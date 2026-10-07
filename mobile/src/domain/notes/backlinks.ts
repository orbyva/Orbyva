import { normalizeWikiTitle, parseWikiLinks } from "@/domain/notes/wikiLinks";

/** Trecho da linha em volta do `[[título]]`, para o backlink mostrar *por que* a nota cita esta. */
export interface MentionSnippet {
  before: string;
  link: string;
  after: string;
}

const LINE_MARKER_RE = /^\s*(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|#{1,6}\s+|>\s*)/;

function plain(text: string): string {
  return text
    .replace(/\[\[([^[\]\n]+)]]/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Primeira menção de `title` fora de código, com até `radius` caracteres de contexto de cada lado,
 * sem sair da linha. Corte no meio de palavra recua até o espaço e ganha `…`.
 */
export function mentionSnippet(
  content: string,
  title: string,
  radius = 48
): MentionSnippet | null {
  const target = normalizeWikiTitle(title);
  if (!target) return null;
  const match = parseWikiLinks(content).find(
    (m) => normalizeWikiTitle(m.title) === target
  );
  if (!match) return null;

  const lineStart = content.lastIndexOf("\n", match.start - 1) + 1;
  const nextBreak = content.indexOf("\n", match.end);
  const lineEnd = nextBreak === -1 ? content.length : nextBreak;

  const from = Math.max(lineStart, match.start - radius);
  let before = content.slice(from, match.start);
  if (from > lineStart) {
    const space = before.indexOf(" ");
    before = `…${space >= 0 ? before.slice(space + 1) : before}`;
  } else {
    before = before.replace(LINE_MARKER_RE, "");
  }

  const to = Math.min(lineEnd, match.end + radius);
  let after = content.slice(match.end, to);
  if (to < lineEnd) {
    const space = after.lastIndexOf(" ");
    after = `${(space > 0 ? after.slice(0, space) : after).trimEnd()}…`;
  }

  return { before: plain(before).trimStart(), link: match.title, after: plain(after).trimEnd() };
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "hoje", "ontem", "há 3 dias", "12 mar" ou "12 mar 2025" — por dia do calendário local. */
export function noteEditedLabel(iso: string | null | undefined, now = new Date()): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(date)) / 86_400_000);
  if (diff <= 0) return "hoje";
  if (diff === 1) return "ontem";
  if (diff < 7) return `há ${diff} dias`;
  const base = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

export function noteCountLabel(count: number): string {
  return count === 1 ? "1 nota" : `${count} notas`;
}
