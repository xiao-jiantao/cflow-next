// Mock TCP daemon — simulates virtuoso-bridge-lite ramic_bridge_daemon on port 65433.
// Run with: pnpm mock-daemon

import net from "node:net";
import {
  encodeSuccess,
  encodeFailure,
} from "../src/lib/virtuoso-protocol";

const PORT = Number(process.env.VB_PORT ?? 65433);
const HOST = process.env.VB_HOST ?? "127.0.0.1";

interface ParsedRequest {
  skill: string;
  timeout: number;
}

function parseRequest(raw: string): ParsedRequest {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("empty request");
  const obj = JSON.parse(trimmed);
  if (typeof obj.skill !== "string") {
    throw new Error("missing 'skill' field");
  }
  return { skill: obj.skill, timeout: Number(obj.timeout ?? 30) };
}

function evalSkill(skill: string): string {
  const code = skill.trim();

  if (code.startsWith("error:")) {
    throw new Error(code.slice(6).trim() || "mock error");
  }

  if (code === "(getCurrentTime)" || code === "getCurrentTime()") {
    return new Date().toISOString();
  }

  // Very small arithmetic: "1+2", "3*4", "(plus 1 2)"
  const arith = code.match(/^\s*(-?\d+)\s*([+\-*/])\s*(-?\d+)\s*$/);
  if (arith) {
    const a = Number(arith[1]);
    const b = Number(arith[3]);
    switch (arith[2]) {
      case "+": return String(a + b);
      case "-": return String(a - b);
      case "*": return String(a * b);
      case "/": return b === 0 ? "ERR_DIV_ZERO" : String(a / b);
    }
  }

  const lispPlus = code.match(/^\(plus\s+(-?\d+)\s+(-?\d+)\)$/);
  if (lispPlus) return String(Number(lispPlus[1]) + Number(lispPlus[2]));

  // fetch()/fetch_one() emit `mapcar(lambda((o) list(o~>f1 o~>f2 ...)) <expr>)`.
  // Return a canned list-of-rows sized to the slot count so the demo works for
  // any fields. Two sample rows; each cell is a quoted "<field>_<rowIdx>".
  if (code.startsWith("mapcar(")) {
    const fields = [...code.matchAll(/o~>(\w+)/g)].map((m) => m[1]);
    const ncols = fields.length || 1;
    const rows = [0, 1].map((r) => {
      const cells = Array.from({ length: ncols }, (_, c) =>
        `"${fields[c] ?? `col${c}`}_${r}"`,
      ).join(" ");
      return `(${cells})`;
    });
    return `(${rows.join(" ")})`;
  }

  // Default: echo SKILL back so caller can confirm transport works.
  return `echo: ${code}`;
}

const server = net.createServer((socket) => {
  const chunks: Buffer[] = [];

  socket.on("data", (chunk) => chunks.push(chunk));

  socket.once("end", () => {
    const raw = Buffer.concat(chunks).toString("utf-8");
    let resp: Buffer;
    try {
      const { skill, timeout } = parseRequest(raw);
      console.log(`[mock-daemon] recv skill=${JSON.stringify(skill)} timeout=${timeout}`);
      const result = evalSkill(skill);
      resp = encodeSuccess(result);
      console.log(`[mock-daemon] reply OK ${JSON.stringify(result)}`);
    } catch (err) {
      const msg = (err as Error).message;
      resp = encodeFailure(msg);
      console.log(`[mock-daemon] reply NAK ${msg}`);
    }
    socket.end(resp);
  });

  socket.once("error", (err) => {
    console.error(`[mock-daemon] socket error: ${err.message}`);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[mock-daemon] listening on ${HOST}:${PORT}`);
});

const shutdown = (sig: string) => {
  console.log(`[mock-daemon] ${sig} received, closing`);
  server.close(() => process.exit(0));
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
