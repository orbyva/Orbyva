import type { NoteDraft } from "@/types/notes";

/** Título de nota sem nome — a coluna é `not null`, então nunca sobra vazio. */
export const UNTITLED_NOTE_TITLE = "Sem título";

/** Teto do título. Não há `check` no banco: o corte é aqui, para o autosave nunca falhar por isso. */
export const NOTE_TITLE_MAX = 120;

/**
 * Deixa o rascunho pronto para ir ao banco: título sem espaço sobrando, nunca vazio e nunca maior
 * que `NOTE_TITLE_MAX`; `project_id` vazio vira `null` (é FK nullable, `""` não é id de nada).
 * O `content` passa intacto — é Markdown cru, e cortar espaço nele mudaria o que o usuário
 * escreveu (indentação de bloco de código, por exemplo).
 */
export function normalizeNoteDraft(draft: NoteDraft): NoteDraft {
  const title = draft.title.trim().slice(0, NOTE_TITLE_MAX).trim();
  return {
    title: title || UNTITLED_NOTE_TITLE,
    content: draft.content,
    project_id: draft.project_id ? draft.project_id : null,
  };
}

/** Linha que é só estrutura de Markdown, não conteúdo: régua, cerca de código ou título. */
function isStructuralLine(line: string): boolean {
  return (
    /^(-{3,}|\*{3,}|_{3,})$/.test(line) || // régua horizontal
    /^(```|~~~)/.test(line) || // cerca de bloco de código
    /^#{1,6}\s/.test(line) // título: o card já mostra o título da nota, repetir é ruído
  );
}

/** Tira a marcação de bloco (lista, citação, checklist) do começo da linha. */
function stripBlockMarkers(line: string): string {
  return line
    .replace(/^\s*>\s?/, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/^\[[ xX]\]\s*/, "");
}

/** Tira a marcação inline (ênfase, código, link, imagem) sem perder o texto. */
function stripInlineMarkup(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resumo de uma linha para o card da lista: a primeira linha que tem conteúdo de verdade, sem
 * marcação, cortada em `max` sem partir palavra ao meio (com `…` quando cortou).
 *
 * Linhas estruturais (régua, cerca de código, título) são puladas — o card já mostra o título da
 * nota ao lado, então repetir o `# Título` do corpo não informa nada.
 */
export function noteExcerpt(content: string, max = 140): string {
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || isStructuralLine(line)) continue;
    const text = stripInlineMarkup(stripBlockMarkers(line));
    if (!text) continue;
    return truncateOnWord(text, max);
  }
  return "";
}

function truncateOnWord(text: string, max: number): string {
  if (max <= 0) return "";
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const lastSpace = head.lastIndexOf(" ");
  // Sem espaço nenhum dentro do limite é uma palavra só, maior que o limite: aí corta na força.
  const cut = lastSpace > 0 ? head.slice(0, lastSpace) : head;
  return `${cut.trimEnd()}…`;
}
