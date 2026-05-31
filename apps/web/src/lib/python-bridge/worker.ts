import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { pythonRunner } from "./runner";
import type { PythonResult, PythonWorkerOptions } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT = 512 * 1024; // 512 KB,与 runner 一致

// worker.py 与本文件同目录。tsx/ESM 下无 __dirname,用 import.meta.url 推导。
const WORKER_PY = join(dirname(fileURLToPath(import.meta.url)), "worker.py");

interface Pending {
  // 收到响应 → settle(result);进程死亡或 ping 超时 → settle(null)。
  // exec 的 settle 在 null 时降级到一次性 spawn;ping 的 settle 把 null 判为不健康。
  settle: (r: PythonResult | null) => void;
  start: number;
  timer: NodeJS.Timeout;
}

/**
 * 常驻 Python worker(模式 A 无状态)。spawn 一个长驻 `python -u worker.py`,
 * 通过 stdin/stdout 行分隔 JSON 通信。崩溃自动重启;重启失败则降级到一次性 spawn。
 */
export class PythonWorker {
  private pythonPath: string;
  private scriptPath: string;
  private timeoutMs: number;
  private maxOutputBytes: number;
  private env: Record<string, string>;

  private proc: ChildProcessWithoutNullStreams | null = null;
  private alive = false;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private stdoutBuf = "";
  private healthTimer: NodeJS.Timeout | null = null;

  constructor(opts: PythonWorkerOptions = {}) {
    this.pythonPath = opts.pythonPath ?? process.env.PYTHON_PATH ?? "python";
    this.scriptPath = opts.workerScriptPath ?? WORKER_PY;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxOutputBytes = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
    this.env = opts.env ?? {};
  }
  /** 启动常驻 worker 进程。已活着则跳过。 */
  start(): void {
    if (this.alive && this.proc) return;
    const proc = spawn(this.pythonPath, ["-u", this.scriptPath], {
      env: { ...process.env, ...this.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc = proc;
    this.alive = true;
    this.stdoutBuf = "";

    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    // worker 的 stderr 是诊断信息(import 警告等),不参与协议,丢弃即可。
    proc.stderr.on("data", () => {});
    // 守卫 this.proc === proc:被 restart 杀掉的旧进程,其晚到的 exit 事件
    // 不应干扰已经换上的新进程(否则会误清空新进程的 pending,造成竞态)。
    proc.on("exit", () => {
      if (this.proc === proc) this.onDead();
    });
    proc.on("error", () => {
      if (this.proc === proc) this.onDead();
    });
  }

  /** 进程死亡:标记 dead,把在途请求交给 settle(null)(exec→fallback、ping→false)。 */
  private onDead(): void {
    this.alive = false;
    this.proc = null;
    const pendings = [...this.pending.values()];
    this.pending.clear();
    for (const p of pendings) {
      clearTimeout(p.timer);
      p.settle(null);
    }
  }

  /** 累积 stdout 缓冲,按 \n 切出完整行(防粘包/半行),逐行派发。 */
  private onStdout(chunk: string): void {
    this.stdoutBuf += chunk;
    let nl: number;
    while ((nl = this.stdoutBuf.indexOf("\n")) >= 0) {
      const line = this.stdoutBuf.slice(0, nl).trim();
      this.stdoutBuf = this.stdoutBuf.slice(nl + 1);
      if (line) this.onLine(line);
    }
  }

  /** 解析一行响应 JSON,按 id 回填对应 pending。 */
  private onLine(line: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // 非 JSON 行(理论上不会有)直接忽略
    }
    const id = msg.id as number | null;
    if (id == null) return;
    const p = this.pending.get(id);
    if (!p) return; // ping 的响应或已超时的请求
    this.pending.delete(id);
    clearTimeout(p.timer);
    p.settle({
      ok: Boolean(msg.ok),
      stdout: (msg.stdout as string) ?? "",
      stderr: (msg.stderr as string) ?? "",
      exitCode: msg.ok ? 0 : 1,
      durationMs: Date.now() - p.start,
      truncated: Boolean(msg.truncated),
      timedOut: false,
    });
  }
  /** 执行一段 Python 代码。worker 不可用时自动降级到一次性 spawn。 */
  async run(code: string, opts: { timeoutMs?: number } = {}): Promise<PythonResult> {
    if (!this.alive || !this.proc) {
      try {
        this.start();
      } catch {
        return this.fallback(code); // 起不来 → 降级
      }
    }
    const proc = this.proc;
    if (!proc) return this.fallback(code);

    const id = this.nextId++;
    const timeoutMs = opts.timeoutMs ?? this.timeoutMs;
    const start = Date.now();
    const req = JSON.stringify({
      id,
      type: "exec",
      code,
      maxOutput: this.maxOutputBytes,
    });

    return new Promise<PythonResult>((resolve) => {
      const timer = setTimeout(() => {
        // 超时:模式 A 单线程被卡死,杀掉重启(下次 run 自动 start)。
        this.pending.delete(id);
        this.restart();
        resolve({
          ok: false,
          stdout: "",
          stderr: `worker timeout after ${timeoutMs}ms (worker restarted)`,
          exitCode: null,
          durationMs: Date.now() - start,
          truncated: false,
          timedOut: true,
        });
      }, timeoutMs);

      // 收到响应 → resolve;进程死亡(settle(null))→ 降级到一次性 spawn。
      const settle = (r: PythonResult | null) => {
        if (r) resolve(r);
        else this.fallback(code).then(resolve);
      };
      this.pending.set(id, { settle, start, timer });
      try {
        proc.stdin.write(req + "\n");
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        // 写 stdin 失败 → 降级到一次性 spawn
        this.fallback(code).then(resolve);
      }
    });
  }
  /** 发一个 ping,worker 在 timeout 内回 pong 则视为健康。 */
  ping(timeoutMs = 3_000): Promise<boolean> {
    if (!this.alive || !this.proc) return Promise.resolve(false);
    const proc = this.proc;
    const id = this.nextId++;
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(false);
      }, timeoutMs);
      // pong 的 id 也走 pending 通道:收到任何响应(settle 非 null)= 健康;
      // 进程死亡(settle(null))= 不健康。
      this.pending.set(id, {
        start: Date.now(),
        timer,
        settle: (r) => resolve(r !== null),
      });
      try {
        proc.stdin.write(JSON.stringify({ id, type: "ping" }) + "\n");
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve(false);
      }
    });
  }

  /** 杀掉当前进程并清状态;下次 run 会自动重启。 */
  restart(): void {
    const proc = this.proc;
    // 先解绑,再 kill:这样旧进程晚到的 exit 事件因 this.proc!==proc 被守卫忽略,
    // 而当前在途 pending 由这里的 onDead 统一交给 settle(null)。
    this.proc = null;
    this.alive = false;
    if (proc) {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }
    this.onDead();
  }

  /** 周期性健康检查:ping 失败则重启。返回的 timer 可用于 dispose。 */
  startHealthCheck(intervalMs = 30_000): void {
    if (this.healthTimer) return;
    this.healthTimer = setInterval(async () => {
      if (!this.alive) return;
      const ok = await this.ping();
      if (!ok) this.restart();
    }, intervalMs);
    // 不阻止进程退出
    this.healthTimer.unref?.();
  }

  /** 关闭 worker,清理定时器。 */
  dispose(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    this.restart();
  }

  /** 降级:用现有一次性 spawn(PythonRunner)执行,结果形状一致。 */
  private fallback(code: string): Promise<PythonResult> {
    return pythonRunner().run(code);
  }
}

let _singleton: PythonWorker | null = null;
export function pythonWorker(): PythonWorker {
  if (!_singleton) _singleton = new PythonWorker();
  return _singleton;
}
