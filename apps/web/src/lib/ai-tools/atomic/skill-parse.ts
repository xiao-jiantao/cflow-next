// SKILL s-expression decoder — TS port of virtuoso-bridge-lite's
// maestro/reader/_parse_skill.py::_parse_sexpr. Pure, no I/O.
//
// Decodes one SKILL token into a JS value:
//   "x"        → "x"   (quotes stripped, \" and \\ unescaped)
//   nil        → null
//   t          → true
//   (a b c)    → array (recursively parsed)
//   bare atom  → original string (number/symbol; caller coerces as needed)
//
// Used by fetch()/fetch_one() to decode the mapcar(...) round-trip result.

const isSpace = (c: string): boolean => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v";

export function parseSexpr(tok: string): unknown {
  const t = (tok ?? "").trim();
  if (!t) return null;
  if (t === "nil") return null;
  if (t === "t") return true;

  // Quoted string: strip surrounding quotes, unescape \" and \\.
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }

  // List: parse inner tokens, respecting nested quotes/parens.
  if (t.startsWith("(") && t.endsWith(")")) {
    const inner = t.slice(1, -1);
    const items: unknown[] = [];
    let i = 0;
    const n = inner.length;
    while (i < n) {
      while (i < n && isSpace(inner[i])) i++;
      if (i >= n) break;

      if (inner[i] === '"') {
        // Quoted string — scan to the unescaped closing quote.
        let j = i + 1;
        while (j < n && !(inner[j] === '"' && inner[j - 1] !== "\\")) j++;
        items.push(parseSexpr(inner.slice(i, j + 1)));
        i = j + 1;
      } else if (inner[i] === "(") {
        // Nested list — track paren depth.
        let depth = 1;
        let j = i + 1;
        while (j < n && depth) {
          if (inner[j] === "(") depth++;
          else if (inner[j] === ")") depth--;
          j++;
        }
        items.push(parseSexpr(inner.slice(i, j)));
        i = j;
      } else {
        // Bare atom — run until whitespace or paren.
        let j = i;
        while (j < n && !isSpace(inner[j]) && inner[j] !== "(" && inner[j] !== ")") j++;
        items.push(parseSexpr(inner.slice(i, j)));
        i = j;
      }
    }
    return items;
  }

  // Bare atom (number/symbol): return original string.
  return t;
}
