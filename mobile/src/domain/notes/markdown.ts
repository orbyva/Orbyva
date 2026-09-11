export type TextRange = { start: number; end: number };

function clampRange(text: string, start: number, end: number): TextRange {
  const s = Math.max(0, Math.min(start, end, text.length));
  const e = Math.max(0, Math.min(Math.max(start, end), text.length));
  return { start: s, end: e };
}

export function wrapInline(
  text: string,
  range: TextRange,
  left: string,
  right = left
): { text: string; start: number; end: number } {
  const { start, end } = clampRange(text, range.start, range.end);
  const selected = text.slice(start, end);
  const next = `${text.slice(0, start)}${left}${selected}${right}${text.slice(end)}`;
  return {
    text: next,
    start: start + left.length,
    end: end + left.length,
  };
}

export function prefixLines(
  text: string,
  range: TextRange,
  prefix: string
): { text: string; start: number; end: number } {
  const { start, end } = clampRange(text, range.start, range.end);
  const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const slice = text.slice(lineStart, end);
  const prefixed = slice
    .split("\n")
    .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
    .join("\n");
  const next = `${text.slice(0, lineStart)}${prefixed}${text.slice(end)}`;
  return {
    text: next,
    start: lineStart,
    end: lineStart + prefixed.length,
  };
}
