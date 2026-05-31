import { tool } from "ai";
import { z } from "zod";
import { pythonWorker } from "@/lib/python-bridge";

export const evalPython = tool({
  description:
    "执行一段 Python 代码,可 import virtuoso_bridge 调用 113 个 EDA API + A 类控制面方法。" +
    "适合探索性、低频、未预注册的操作。返回 stdout/stderr。" +
    "提示:print() 才能看到结果;脚本运行在常驻 worker 的隔离命名空间,跨调用不保留变量,共享状态需走 SSH/TCP。",
  inputSchema: z.object({
    code: z
      .string()
      .describe(
        "Python 代码片段。示例:\n" +
          "  from virtuoso_bridge import VirtuosoClient\n" +
          "  c = VirtuosoClient.from_env()\n" +
          "  print(c.fetch('ddGetObj(\"myLib\")~>cells', ['name','view']))",
      ),
    timeoutSec: z
      .number()
      .int()
      .min(1)
      .max(300)
      .optional()
      .describe("超时秒数,默认 30"),
  }),
  execute: async ({ code, timeoutSec }) => {
    const worker = pythonWorker();
    const result = await worker.run(code, {
      timeoutMs: timeoutSec ? timeoutSec * 1000 : undefined,
    });
    return {
      ok: result.ok,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      truncated: result.truncated ?? false,
      timedOut: result.timedOut ?? false,
      _timeoutHintSec: timeoutSec,
    };
  },
});
