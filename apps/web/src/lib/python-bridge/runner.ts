import { spawn } from "child_process";
import type { PythonResult, PythonRunnerOptions } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT = 512 * 1024; // 512 KB

export class PythonRunner {
  private pythonPath: string;
  private cwd: string;
  private timeoutMs: number;
  private maxOutputBytes: number;
  private env: Record<string, string>;

  constructor(opts: PythonRunnerOptions = {}) {
    this.pythonPath = opts.pythonPath ?? process.env.PYTHON_PATH ?? "python";
    this.cwd = opts.cwd ?? process.env.VB_PYTHON_CWD ?? process.cwd();
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxOutputBytes = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
    this.env = opts.env ?? {};
  }

  async run(code: string): Promise<PythonResult> {
    const start = Date.now();
    return new Promise<PythonResult>((resolve) => {
      const proc = spawn(this.pythonPath, ["-c", code], {
        cwd: this.cwd,
        env: { ...process.env, ...this.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let truncated = false;
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGKILL");
      }, this.timeoutMs);

      const appendOut = (chunk: Buffer) => {
        if (stdout.length + chunk.length > this.maxOutputBytes) {
          stdout += chunk.toString("utf8", 0, this.maxOutputBytes - stdout.length);
          truncated = true;
          proc.kill("SIGKILL");
        } else {
          stdout += chunk.toString("utf8");
        }
      };

      const appendErr = (chunk: Buffer) => {
        if (stderr.length + chunk.length > this.maxOutputBytes) {
          stderr += chunk.toString("utf8", 0, this.maxOutputBytes - stderr.length);
          truncated = true;
        } else {
          stderr += chunk.toString("utf8");
        }
      };

      proc.stdout.on("data", appendOut);
      proc.stderr.on("data", appendErr);

      proc.on("close", (exitCode) => {
        clearTimeout(timer);
        resolve({
          ok: !timedOut && exitCode === 0,
          stdout,
          stderr,
          exitCode,
          durationMs: Date.now() - start,
          truncated,
          timedOut,
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          ok: false,
          stdout,
          stderr: stderr + `\nspawn error: ${err.message}`,
          exitCode: null,
          durationMs: Date.now() - start,
          truncated,
          timedOut,
        });
      });
    });
  }
}

let _singleton: PythonRunner | null = null;
export function pythonRunner(): PythonRunner {
  if (!_singleton) _singleton = new PythonRunner();
  return _singleton;
}
