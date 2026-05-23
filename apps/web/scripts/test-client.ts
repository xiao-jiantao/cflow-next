// End-to-end verification: run mock-daemon in one terminal, then `pnpm test-client`.
// Verifies the four scenarios listed in 20260524_task10_TCP客户端与Mock服务器.md.

import { VirtuosoClient } from "../src/lib/virtuoso-client";

interface Case {
  name: string;
  run: (client: VirtuosoClient) => Promise<void>;
}

const cases: Case[] = [
  {
    name: "arith: 1+2 → 3",
    async run(client) {
      const out = await client.send("1+2");
      assertEq(out, "3");
    },
  },
  {
    name: "lisp: (plus 10 20) → 30",
    async run(client) {
      const out = await client.send("(plus 10 20)");
      assertEq(out, "30");
    },
  },
  {
    name: "failure: error: bad syntax → throws",
    async run(client) {
      try {
        await client.send("error: bad syntax");
      } catch (e) {
        const msg = (e as Error).message;
        if (!msg.includes("bad syntax")) {
          throw new Error(`unexpected error message: ${msg}`);
        }
        return;
      }
      throw new Error("expected error but got success");
    },
  },
  {
    name: "concurrent: 3 parallel sends each correct",
    async run(client) {
      const [a, b, c] = await Promise.all([
        client.send("2+3"),
        client.send("10-4"),
        client.send("5*6"),
      ]);
      assertEq(a, "5");
      assertEq(b, "6");
      assertEq(c, "30");
    },
  },
  {
    name: "echo fallback: unknown SKILL → 'echo: ...'",
    async run(client) {
      const out = await client.send("hiSetCurrentWindow()");
      if (!out.startsWith("echo: ")) {
        throw new Error(`expected echo prefix, got: ${out}`);
      }
    },
  },
];

function assertEq(actual: string, expected: string) {
  if (actual !== expected) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function main() {
  const client = new VirtuosoClient();
  let pass = 0;
  let fail = 0;
  for (const c of cases) {
    try {
      await c.run(client);
      console.log(`  PASS  ${c.name}`);
      pass++;
    } catch (e) {
      console.error(`  FAIL  ${c.name}\n        ${(e as Error).message}`);
      fail++;
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
