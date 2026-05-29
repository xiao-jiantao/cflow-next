import { tool } from "ai";
import { z } from "zod";
import { virtuosoClient } from "@/lib/virtuoso-client";
import { parseSexpr } from "./skill-parse";

// 通路 B 原子 tool — 对应 Python virtuoso/basic/bridge.py:564 fetch()。
// 批量读多个对象的多个 slot,一次 round-trip 拿全部结果。
// 相比逐对象逐 slot 访问(N×M 次网络调用)提升 ~150 倍。
//
// 纯 TS 实现:拼 SKILL + 在 TS 侧解析 S-表达式,不走 Python 子进程,
// 保留"快/省 token/确定性"的通路 B 价值。

/**
 * Core helper shared by fetch / fetch_one.
 * Builds `mapcar(lambda((o) list(o~>f1 o~>f2 ...)) <expr>)`, sends it in a
 * single round-trip, parses the SKILL list-of-lists into row dicts.
 */
export async function fetchRows(
  expr: string,
  fields: string[],
  timeoutSec = 30,
): Promise<Array<Record<string, unknown>>> {
  const slots = fields.map((f) => `o~>${f}`).join(" ");
  const sk = `mapcar(lambda((o) list(${slots})) ${expr})`;
  const raw = await virtuosoClient().send(sk, timeoutSec);
  const parsed = parseSexpr(raw.trim());
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => {
      const obj: Record<string, unknown> = {};
      fields.forEach((f, idx) => {
        obj[f] = row[idx] ?? null;
      });
      return obj;
    });
}

export const fetch = tool({
  description:
    "批量读取多个 Virtuoso 对象的多个 slot。一次 round-trip 拿到所有结果。" +
    "适合读 100+ 实例的参数、网表、形状等。比逐对象访问快 ~150 倍。",
  inputSchema: z.object({
    selector: z
      .string()
      .describe('SKILL 选择器,返回对象列表。例:ddGetObj("myLib")~>cells'),
    slots: z
      .array(z.string())
      .min(1)
      .describe('每个对象要读的 slot 名。例:["name","cellViews"]'),
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
      const rows = await fetchRows(selector, slots, timeoutSec);
      return { ok: true, count: rows.length, rows };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});
