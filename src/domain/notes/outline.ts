import { stripMarkdown } from "@/lib/markdown";
import {
  extractHeadings as extractHeadingsFromDoc,
  slugifyHeading,
  uniqueHeadingId,
} from "@/domain/notes/headings";
import type { NoteHeading } from "@/domain/notes/headings";

/**
 * # Sumário da nota (feature 068 / 070)
 *
 * Os títulos de uma nota, na ordem do documento, com o **mesmo slug** que o preview põe no `id`
 * de cada `<h1..h6>` (`rehypeHeadingIds` → `slugifyHeading` / `uniqueHeadingId` em `headings.ts`).
 * Isso não é detalhe de implementação: é o contrato que faz o clique no sumário rolar até a seção.
 *
 * A extração rica (cerca de tis, título dentro de citação fora do sumário) mora aqui; o algoritmo
 * de slug é o de `headings.ts`, compartilhado com o preview.
 */

export type { NoteHeading };

/** Cerca de bloco de código: três (ou mais) crases ou tis, com até três espaços de indentação. */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/** `### Título ###` — o fecho opcional do ATX é marcação, não texto. */
const ATX_RE = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;

/**
 * Extração do sumário com as regras da 068 (pula citação; cerca de tis aninhada) e o slug da 069/070.
 */
export function extractHeadings(content: string): NoteHeading[] {
  const headings: NoteHeading[] = [];
  const used = new Map<string, number>();
  /** A cerca que abriu o bloco atual, ou `null` fora de bloco. */
  let openFence: string | null = null;
  let lineNumber = 0;

  for (const line of content.split("\n")) {
    lineNumber += 1;
    const fence = FENCE_RE.exec(line);
    if (fence) {
      // Fecha só com o mesmo caractere e comprimento igual ou maior — regra do CommonMark.
      if (openFence === null) openFence = fence[1];
      else if (fence[1][0] === openFence[0] && fence[1].length >= openFence.length) {
        openFence = null;
      }
      continue;
    }
    if (openFence !== null) continue;

    // `> # Aviso` é título para o Markdown, mas não é seção da nota.
    if (/^ {0,3}>/.test(line)) continue;

    const match = ATX_RE.exec(line);
    if (!match) continue;

    const text = stripMarkdown(match[2]);
    if (!text) continue;

    headings.push({
      level: match[1].length,
      text,
      slug: uniqueHeadingId(slugifyHeading(text), used),
      line: lineNumber,
    });
  }

  return headings;
}

/**
 * Quantos títulos justificam mostrar o sumário. Com um título só, o painel é uma lista de um item
 * ao lado do texto — ocupa largura e não orienta ninguém.
 */
export const OUTLINE_MIN_HEADINGS = 2;

/** Reexporta a extração simples da 070 para quem só precisa de ATX + fence. */
export { extractHeadingsFromDoc, slugifyHeading, uniqueHeadingId };
