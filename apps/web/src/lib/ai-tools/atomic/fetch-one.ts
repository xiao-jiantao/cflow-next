import { tool } from "ai";
import { z } from "zod";
import { fetchRows } from "./fetch";

// 通路 B 原子 tool — 对应 Python virtuoso/basic/bridge.py:615 fetch_one()。
// fetch 的单对象变体:把 expr 包进 list(...) 复用 fetchRows,取第一行。

export const fetchOne = tool({
  description:
    "读取单个 Virtuoso 对象的多个 slot。一次 round-trip 拿到结果。",
  inputSchema: z.object({
    selector: z
      .string()
      .describe('SKILL 表达式,返回单个对象。例:hiGetCurrentWindow()->cellView'),
    slots: z.array(z.string()).min(1).describe("要读的 slot 名"),
    timeoutSec: z
      .number()
      .int()
      .min(1)
      .max(300)
      .optional()
      .describe("超时秒数,默认 30"),
  }),
  execute: async ({ selector, slots, timeoutSec }) => {
    try {
      const rows = await fetchRows(`list(${selector})`, slots, timeoutSec);
      return { ok: true, row: rows[0] ?? {} };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});
