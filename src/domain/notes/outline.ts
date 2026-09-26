import GithubSlugger from "github-slugger";
import { stripMarkdown } from "@/lib/markdown";

/**
 * # Sumário da nota (feature 068)
 *
 * Os títulos de uma nota, na ordem do documento, com o **mesmo slug** que o `rehype-slug` põe no
 * `id` de cada `<h1..h6>` do preview (067). Isso não é detalhe de implementação: é o contrato que
 * faz o clique no sumário rolar até a seção. Se os dois algoritmos divergirem, o sumário rola para
 * lugar nenhum — e é por isso que o slug sai do **mesmo pacote** que o `rehype-slug` usa
 * (`github-slugger`), em vez de uma reimplementação parecida, e que há teste comparando os dois.
 *
 * Deriva do **conteúdo**, não do DOM: um sumário lido do HTML renderizado só existiria na aba
 * "Visualizar", e ele precisa aparecer enquanto se escreve.
 *
 * Duas escolhas conscientes de recorte:
 * - **só título ATX** (`## Etapas`). Setext (`Etapas\n---`) é raro, e nada do que o editor oferece
 *   (barra, menu `/`, atalhos) o produz;
 * - **título dentro de citação não conta**. `> # Aviso` é um título para o Markdown, mas não é uma
 *   seção da nota — é texto citado de outro lugar. A consequência assumida é que um título assim
 *   ganha `id` no preview sem aparecer no sumário.
 */
export type NoteHeading = {
  /** 1–6, como em `<h1>`…`<h6>`. */
  level: number;
  /** O texto já sem marcação — o que o leitor vê no título renderizado. */
  text: string;
  /** O `id` gerado pelo `rehype-slug` para este título. */
  slug: string;
  /**
   * Linha do título no Markdown (1-based, como o CodeMirror conta).
   *
   * É o que permite duas coisas na aba "Escrever", onde não existe HTML nem `id` nenhum: levar o
   * cursor até a seção clicada e saber em que seção o cursor está.
   */
  line: number;
};

/** `### Título ###` — o fecho opcional do ATX é marcação, não texto. */
const ATX_RE = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;

/** Cerca de bloco de código: três (ou mais) crases ou tis, com até três espaços de indentação. */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

export function extractHeadings(content: string): NoteHeading[] {
  const slugger = new GithubSlugger();
  const headings: NoteHeading[] = [];
  /** A cerca que abriu o bloco atual, ou `null` fora de bloco. */
  let openFence: string | null = null;
  let lineNumber = 0;

  for (const line of content.split("\n")) {
    lineNumber += 1;
    const fence = FENCE_RE.exec(line);
    if (fence) {
      // Fecha só com o mesmo caractere e comprimento igual ou maior — é a regra do CommonMark, e
      // é o que impede um ` ``` ` dentro de um bloco de ` ```` ` de fechar o de fora.
      if (openFence === null) openFence = fence[1];
      else if (fence[1][0] === openFence[0] && fence[1].length >= openFence.length) {
        openFence = null;
      }
      continue;
    }
    if (openFence !== null) continue;

    const match = ATX_RE.exec(line);
    if (!match) continue;

    // `stripMarkdown` deixa o texto como o parser o entregaria (`**Etapas**` → `Etapas`), que é
    // exatamente o que o `rehype-slug` recebe — sem isso, o slug sairia com os asteriscos.
    const text = stripMarkdown(match[2]);
    if (!text) continue;

    headings.push({
      level: match[1].length,
      text,
      // O mesmo `slugger` para o documento inteiro: é dele que sai o `-1` do título repetido.
      slug: slugger.slug(text),
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
