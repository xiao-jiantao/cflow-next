// TCP client for virtuoso-bridge-lite daemon
// Connects to localhost:65433 by default; switch to real daemon by SSH tunnel
// (same port — see 20260524_task10_TCP客户端与Mock服务器.md).

import net from "node:net";
import {
  encodeRequest,
  parseResponse,
  type SkillRequest,
} from "./virtuoso-protocol";

export interface VirtuosoClientOptions {
  host?: string;
  port?: number;
  defaultTimeoutMs?: number;
}

export class VirtuosoClient {
  private host: string;
  private port: number;
  private defaultTimeoutMs: number;

  constructor(opts: VirtuosoClientOptions = {}) {
    this.host = opts.host ?? process.env.VB_HOST ?? "localhost";
    this.port = opts.port ?? Number(process.env.VB_PORT ?? 65433);
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 30_000;
  }

  async send(skill: string, timeoutSec = 30): Promise<string> {
    const req: SkillRequest = { skill, timeout: timeoutSec };
    const payload = encodeRequest(req);
    const socketTimeoutMs = Math.max(timeoutSec * 1000, this.defaultTimeoutMs);

    return new Promise<string>((resolve, reject) => {
      const socket = new net.Socket();
      const chunks: Buffer[] = [];
      let settled = false;

      const finish = (err: Error | null, value?: string) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (err) reject(err);
        else resolve(value!);
      };

      socket.setTimeout(socketTimeoutMs);

      socket.once("connect", () => {
        socket.write(payload, (writeErr) => {
          if (writeErr) {
            finish(writeErr);
            return;
          }
          // Signal end of request — daemon reads until FIN.
          socket.end();
        });
      });

      socket.on("data", (chunk) => chunks.push(chunk));

      socket.once("end", () => {
        try {
          const buf = Buffer.concat(chunks);
          const { ok, text } = parseResponse(buf);
          if (ok) finish(null, text);
          else finish(new Error(`daemon error: ${text}`));
        } catch (parseErr) {
          finish(parseErr as Error);
        }
      });

      socket.once("timeout", () => {
        finish(new Error(`daemon timeout after ${socketTimeoutMs}ms`));
      });

      socket.once("error", (err) => finish(err));

      socket.connect(this.port, this.host);
    });
  }
}

let singleton: VirtuosoClient | null = null;
export function virtuosoClient(): VirtuosoClient {
  if (!singleton) singleton = new VirtuosoClient();
  return singleton;
}
