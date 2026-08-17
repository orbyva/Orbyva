/**
 * Linguagem declarada num fence de código do Markdown.
 *
 * O `react-markdown` não entrega a linguagem crua: ele repassa a `className` que o `remark`/`rehype`
 * montou a partir de ` ```<lang> `, no formato `language-<lang>` (podendo vir acompanhada de outras
 * classes). Extrair isso é a parte testável do registry de blocos (feature 057) — por isso mora em
 * `domain/` e não dentro do componente.
 *
 * Devolve a linguagem em minúsculas (` ```Mermaid ` e ` ```mermaid ` são o mesmo bloco) ou `null`
 * quando o fence não declarou linguagem nenhuma.
 */
export function parseBlockLanguage(className?: string | null): string | null {
  if (!className) return null;
  for (const token of className.split(/\s+/)) {
    if (!token.startsWith(LANGUAGE_PREFIX)) continue;
    const language = token.slice(LANGUAGE_PREFIX.length).trim().toLowerCase();
    if (language) return language;
  }
  return null;
}

const LANGUAGE_PREFIX = "language-";
