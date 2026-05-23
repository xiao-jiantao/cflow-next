// Virtuoso bridge daemon TCP protocol constants and codec
// Reference: virtuoso-bridge-lite/ramic_bridge_daemon_3.py

export const STX = 0x02; // success marker
export const NAK = 0x15; // failure marker
export const RS = 0x1e;  // record separator (end of response)

export interface SkillRequest {
  skill: string;
  timeout?: number;
}

export function encodeRequest(req: SkillRequest): Buffer {
  const payload = JSON.stringify({
    skill: req.skill,
    timeout: req.timeout ?? 30,
  });
  return Buffer.from(payload + "\n", "utf-8");
}

export interface ParsedResponse {
  ok: boolean;
  text: string;
}

export function parseResponse(buf: Buffer): ParsedResponse {
  if (buf.length === 0) {
    throw new Error("empty response from daemon");
  }
  const marker = buf[0];
  if (marker !== STX && marker !== NAK) {
    throw new Error(
      `invalid response marker: 0x${marker.toString(16)} (expected 0x02 or 0x15)`
    );
  }
  const rsIndex = buf.indexOf(RS, 1);
  const end = rsIndex === -1 ? buf.length : rsIndex;
  const text = buf.slice(1, end).toString("utf-8");
  return { ok: marker === STX, text };
}

export function encodeSuccess(text: string): Buffer {
  return Buffer.concat([
    Buffer.from([STX]),
    Buffer.from(text, "utf-8"),
    Buffer.from([RS]),
  ]);
}

export function encodeFailure(errorMsg: string): Buffer {
  return Buffer.concat([
    Buffer.from([NAK]),
    Buffer.from(errorMsg, "utf-8"),
    Buffer.from([RS]),
  ]);
}
