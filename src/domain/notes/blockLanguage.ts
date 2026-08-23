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

/**
 * Linguagem de fence que o `remark-math` usa para fórmula (`$…$`, `$$…$$` e ` ```math `), e que o
 * `blockRegistry` roteia para o `MathBlock` (feature 067). Mora aqui, junto do resto do
 * vocabulário de bloco, e não no componente: constante exportada de arquivo de componente acende
 * `react-refresh/only-export-components`.
 */
export const MATH_BLOCK_LANGUAGE = "math";

/** Variante que o `remark-math` marca em `$$…$$` (bloco); sem ela, a fórmula é inline. */
export const MATH_DISPLAY_CLASS = "math-display";

/**
 * Linguagens que o menu de inserção (`/`, feature 068) oferece para um bloco de código, com o
 * nome que aparece no menu.
 *
 * O `id` é o que vai no fence (` ```ts `) e **precisa** ser uma linguagem realçada pela 067 —
 * oferecer no menu uma linguagem que sai sem cor seria oferecer uma promessa quebrada. Quem garante
 * isso é um teste (`highlight.test.tsx`) que registra as gramáticas de
 * `MARKDOWN_HIGHLIGHT_LANGUAGES` e confere que cada `id` daqui é conhecido — inclusive os apelidos
 * (`ts` vem do `typescript`, `html` do `xml`).
 *
 * A lista mora aqui, em `domain/`, e não junto do `rehypePlugins.ts`: aquele módulo importa as
 * gramáticas do highlight.js de verdade, e o menu (que vive no chunk do CodeMirror) não pode
 * arrastar 70 KB de realce só para saber que "SQL" existe.
 */
export const CODE_BLOCK_LANGUAGES: readonly { id: string; label: string }[] = [
  { id: "ts", label: "TypeScript" },
  { id: "tsx", label: "TSX" },
  { id: "js", label: "JavaScript" },
  { id: "json", label: "JSON" },
  { id: "sql", label: "SQL" },
  { id: "bash", label: "Shell" },
  { id: "python", label: "Python" },
  { id: "css", label: "CSS" },
  { id: "html", label: "HTML" },
  { id: "markdown", label: "Markdown" },
  { id: "diff", label: "Diff" },
];
