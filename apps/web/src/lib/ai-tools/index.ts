import { tool } from "ai";
import { z } from "zod";
import { virtuosoClient } from "@/lib/virtuoso-client";
import { evalPython } from "./eval-python";

// 通路 A:eval_python — LLM 自由写 Python 调用 virtuoso-bridge-lite
// 通路 B:预注册原子 tool — 薄包装,高频/确定性/省 token
// 通路 C:workflow tool — 固化业务流程(Phase 3)

const executeSkill = tool({
  description:
    "执行 Virtuoso SKILL 代码并返回结果。用于简单的 SKILL 表达式求值。" +
    "对于多步操作或需要解析返回值的场景,优先用 eval_python。",
  inputSchema: z.object({
    code: z
      .string()
      .describe("要执行的 SKILL 代码,如 (plus 1 2) 或 hiOpenCellView(...)"),
  }),
  execute: async ({ code }: { code: string }) => {
    return await virtuosoClient().send(code);
  },
});

export const tools = {
  execute_skill: executeSkill,
  eval_python: evalPython,
  // TODO Phase 2: ...atomic (fetch, fetch_one, load_il, dismiss_dialog)
  // TODO Phase 3: ...workflows
};
