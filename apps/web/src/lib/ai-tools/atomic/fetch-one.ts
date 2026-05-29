import { tool } from "ai";
import { z } from "zod";

// TODO Phase 2: 对应 Python virtuoso/basic/bridge.py:615 fetch_one()
// 单对象批量读 slot

export const fetchOne = tool({
  description:
    "读取单个 Virtuoso 对象的多个 slot。一次 round-trip 拿到结果。",
  inputSchema: z.object({
    selector: z
      .string()
      .describe('SKILL 表达式,返回单个对象。例:hiGetCurrentWindow()->cellView'),
    slots: z.array(z.string()).describe('要读的 slot 名'),
  }),
  execute: async ({ selector: _selector, slots: _slots }) => {
    return {
      ok: false,
      error: "fetch_one not implemented yet (Phase 2)",
    };
  },
});
