import { isInsideCode } from "@/domain/notes/wikiLinks";
import { stripMarkdown } from "@/lib/markdown";

/**
 * # Âncora de título — `slugifyHeading` (feature 069)
 *
 * Todo título de uma nota ganha um `id` estável, derivado do próprio texto. É o que torna possível
 * apontar para **dentro** de uma nota: `[[nota#seção]]` (vocabulário da 056) e o sumário da 070
 * precisam de um alvo que exista no DOM e que não mude a cada render.
 *
 * As regras são as do GitHub, porque são as que o usuário já conhece de qualquer README:
 * minúsculas, acento removido, pontuação fora, espaço vira hífen. Acento sai de propósito — `#nao`
 * é digitável em qualquer teclado, `#não` não é.
 *
 * Isto é lógica pura (texto → texto), por isso mora em `domain/` e não no componente: é o pedaço
 * que dá para testar sem renderizar nada.
 */

/**
 * Texto do título → identificador de URL.
 *
 * ```
 * slugifyHeading("Como Rodar o Café?")  // "como-rodar-o-cafe"
 * slugifyHeading("  ")                  // "secao"
 * ```
 */
export function slugifyHeading(text: string): string {
  const slug = text
    .normalize("NFD")
    // Tira os diacríticos que o NFD separou da letra — "ção" vira "cao".
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    // Pontuação some; o que separa palavra vira hífen.
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  // Título só de emoji, de pontuação ou vazio ainda precisa de um alvo para o link.
  return slug || FALLBACK_HEADING_SLUG;
}

export const FALLBACK_HEADING_SLUG = "secao";

/**
 * O mesmo título pode aparecer duas vezes na mesma nota ("Notas", "Notas"), e dois `id` iguais
 * fazem o link levar sempre ao primeiro. O segundo vira `-2`, o terceiro `-3`, como no GitHub.
 *
 * `used` é o contador da nota inteira, criado por quem percorre a árvore — a função em si continua
 * pura: mesma entrada, mesma saída.
 */
export function uniqueHeadingId(
  slug: string,
  used: Map<string, number>
): string {
  const seen = used.get(slug) ?? 0;
  used.set(slug, seen + 1);
  return seen === 0 ? slug : `${slug}-${seen + 1}`;
}

/**
 * ## Sumário da nota — `extractHeadings` (feature 070)
 *
 * Os títulos de uma nota, em ordem, com o mesmo `slug` que o preview põe no `id` de cada `h1`–`h6`
 * (`rehypeHeadingIds`, 069). É essa igualdade que faz o item do sumário e a âncora da tela se
 * encontrarem — por isso o contador de repetidos é o **mesmo** `uniqueHeadingId`, percorrendo o
 * documento na mesma ordem.
 *
 * Pura e sem parser: a leitura é linha a linha, que é o que permite devolver o **número da linha** —
 * clicar no sumário no modo "Escrever" rola o editor até ela, e para isso não existe âncora nenhuma
 * no DOM.
 */

export interface NoteHeading {
  /** 1 a 6, do `#` ao `######`. */
  level: number;
  /** Texto já sem a marcação (`## Um **título**` vale "Um título", como no preview). */
  text: string;
  /** `id` do título no preview — inclusive o sufixo `-2` de título repetido. */
  slug: string;
  /** Linha no documento, começando em 1 (é o que o CodeMirror usa). */
  line: number;
}

/** `#` a `######` no começo da linha; o texto é opcional (`#` sozinho é título vazio no CommonMark). */
const ATX_HEADING_RE = /^(\s{0,3})(#{1,6})(?:[ \t]+(.*))?$/;

export function extractHeadings(markdown: string): NoteHeading[] {
  const headings: NoteHeading[] = [];
  const used = new Map<string, number>();
  let offset = 0;

  markdown.split("\n").forEach((line, index) => {
    const match = ATX_HEADING_RE.exec(line);
    if (match) {
      // `# dentro de bloco de código` é conteúdo, não título — a mesma varredura que o wiki-link
      // usa para não linkar dentro de fence (`isInsideCode`, em `wikiLinks.ts`).
      const hashAt = offset + match[1].length;
      if (!isInsideCode(markdown, hashAt)) {
        // A sequência de fechamento (`## Título ##`) é marcação, não texto.
        const raw = (match[3] ?? "").replace(/\s+#+\s*$/, "");
        const text = stripMarkdown(raw);
        headings.push({
          level: match[2].length,
          text,
          slug: uniqueHeadingId(slugifyHeading(text), used),
          line: index + 1,
        });
      }
    }
    offset += line.length + 1; // +1 = o "\n" que o split comeu
  });

  return headings;
}
