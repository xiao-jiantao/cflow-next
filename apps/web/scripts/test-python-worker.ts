// Tier 1/2 verification for the resident PythonWorker (task17).
// Run: cd cflow-next/apps/web && npx tsx scripts/test-python-worker.ts
// No EDA / dev server needed. Tier 2 only checks `import virtuoso_bridge` succeeds.
import { PythonWorker } from "../src/lib/python-bridge/worker";

let passed = 0;
let failed = 0;
const lines: string[] = [];

function log(s: string) {
  console.log(s);
  lines.push(s);
}
function ok(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    log(`  PASS  ${name}${detail ? " — " + detail : ""}`);
  } else {
    failed++;
    log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

async function main() {
  const w = new PythonWorker();
  w.start();

  // ① 基础:print(1+2) → "3"
  const r1 = await w.run("print(1+2)");
  ok("① basic print", r1.ok && r1.stdout.trim() === "3", `stdout=${JSON.stringify(r1.stdout)}`);

  // ② 命名空间隔离:先定义 x,再读 x 应 NameError(模式 A 跨调用不保留)
  await w.run("x = 5");
  const r2 = await w.run("print(x)");
  ok(
    "② namespace isolation",
    !r2.ok && r2.stderr.includes("NameError"),
    `ok=${r2.ok} stderr_has_NameError=${r2.stderr.includes("NameError")}`,
  );

  // ③ ping/pong:worker 健康
  const r3 = await w.ping();
  ok("③ ping/pong", r3 === true, `ping=${r3}`);

  // ④ 异常被捕获到 stderr 且 ok=false(不杀 worker)
  const r4 = await w.run("raise ValueError('boom')");
  const r4b = await w.run("print('still alive')");
  ok(
    "④ exception captured, worker survives",
    !r4.ok && r4.stderr.includes("ValueError") && r4b.ok && r4b.stdout.trim() === "still alive",
    `r4.ok=${r4.ok} r4b.stdout=${JSON.stringify(r4b.stdout)}`,
  );

  // ⑤ 超时 → timedOut,且重启后 worker 仍可用
  const r5 = await w.run("import time; time.sleep(5)", { timeoutMs: 800 });
  const r5b = await w.run("print('recovered')");
  ok(
    "⑤ timeout → restart → usable",
    r5.timedOut === true && r5b.ok && r5b.stdout.trim() === "recovered",
    `r5.timedOut=${r5.timedOut} r5b.stdout=${JSON.stringify(r5b.stdout)}`,
  );

  // ⑥ Tier 2:import virtuoso_bridge 成功(仅验 import,不连 EDA)
  const r6 = await w.run(
    "import virtuoso_bridge; print('bridge', getattr(virtuoso_bridge,'__version__','?'))",
  );
  ok("⑥ import virtuoso_bridge", r6.ok && r6.stdout.includes("bridge"), `stdout=${JSON.stringify(r6.stdout)} stderr=${JSON.stringify(r6.stderr.slice(0, 120))}`);

  w.dispose();

  // ⑦ fallback:坏 pythonPath → 自动降级到一次性 spawn(PythonRunner)仍能跑
  const wbad = new PythonWorker({ pythonPath: "python", workerScriptPath: "Z:/no/such/worker.py" });
  const r7 = await wbad.run("print(7*7)");
  ok("⑦ fallback to one-shot spawn", r7.ok && r7.stdout.trim() === "49", `stdout=${JSON.stringify(r7.stdout)}`);
  wbad.dispose();

  log("");
  log(`RESULT: ${passed} passed, ${failed} failed`);

  // 测试当下留存日志(CLAUDE.md 铁律:写报告直接引用,不重跑)
  const { writeFileSync } = await import("fs");
  const logPath = "../../../ClaudeCodeDocs/temp/tier1_worker.log";
  try {
    writeFileSync(logPath, lines.join("\n") + "\n", "utf8");
    console.log(`\n(log written to ${logPath})`);
  } catch (e) {
    console.log(`\n(could not write log: ${(e as Error).message})`);
  }

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("test harness crashed:", e);
  process.exit(2);
});
