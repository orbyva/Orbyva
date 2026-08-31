// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render } from "@testing-library/react";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { extractHeadings } from "@/domain/notes/outline";

/**
 * O sumário da 068.
 *
 * A maior parte é pura, mas o teste que mais importa é o último bloco: os slugs de
 * `extractHeadings` **têm** que ser byte a byte os `id` que o `rehype-slug` põe no preview (067).
 * Divergiu, o sumário rola para lugar nenhum — e nada no build acusaria. Por isso este arquivo
 * roda em jsdom: ele renderiza o preview de verdade e compara.
 */

function slugs(content: string): string[] {
  return extractHeadings(content).map((heading) => heading.slug);
}

/** Os `id` que o preview realmente gerou, na ordem do documento. */
function previewIds(content: string): string[] {
  // `createElement` e não JSX: o arquivo é `.test.ts` (o teste é de domínio; o preview entra só
  // como oráculo do slug).
  const { container } = render(createElement(MarkdownPreview, { content }));
  return [...container.querySelectorAll("h1, h2, h3, h4, h5, h6")].map(
    (element) => element.id
  );
}

describe("extractHeadings", () => {
  it("conteúdo vazio devolve lista vazia", () => {
    expect(extractHeadings("")).toEqual([]);
    expect(extractHeadings("só um parágrafo\n\ne outro")).toEqual([]);
  });

  it("lê os seis níveis, na ordem do documento", () => {
    const content = ["# um", "## dois", "### três", "#### quatro", "##### cinco", "###### seis"].join(
      "\n"
    );
    expect(extractHeadings(content).map((h) => h.level)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(extractHeadings(content).map((h) => h.text)).toEqual([
      "um",
      "dois",
      "três",
      "quatro",
      "cinco",
      "seis",
    ]);
  });

  it("`#######` (sete) não é título", () => {
    expect(extractHeadings("####### sete")).toEqual([]);
  });

  it("exige o espaço depois do `#`, como o CommonMark", () => {
    expect(extractHeadings("#semespaço")).toEqual([]);
  });

  it("tira o fecho opcional do ATX e a marcação inline do texto", () => {
    expect(extractHeadings("## Etapas ##")[0].text).toBe("Etapas");
    expect(extractHeadings("## **Etapas** da `obra`")[0].text).toBe("Etapas da obra");
    expect(extractHeadings("## [Etapas](http://x)")[0].text).toBe("Etapas");
  });

  it("título repetido ganha slug distinto", () => {
    expect(slugs("# Etapas\n\n# Etapas\n\n# Etapas")).toEqual([
      "etapas",
      "etapas-1",
      "etapas-2",
    ]);
  });

  it("acento vira slug sem acento e emoji some do slug, mas fica no texto", () => {
    const headings = extractHeadings("# Reunião de segunda\n\n## Prazo 🚧 curto");
    expect(headings[0].slug).toBe("reunião-de-segunda");
    expect(headings[1].text).toBe("Prazo 🚧 curto");
  });

  it("`#` dentro de bloco de código não vira título", () => {
    const content = [
      "# Real",
      "",
      "```bash",
      "# isto é um comentário de shell",
      "```",
      "",
      "## Também real",
    ].join("\n");
    expect(extractHeadings(content).map((h) => h.text)).toEqual([
      "Real",
      "Também real",
    ]);
  });

  it("cerca de tis e cerca aninhada mais longa não confundem o contador", () => {
    const content = ["~~~", "# não", "~~~", "````", "```", "# também não", "````", "# sim"].join(
      "\n"
    );
    expect(extractHeadings(content).map((h) => h.text)).toEqual(["sim"]);
  });

  it("`#` dentro de citação não vira seção do sumário", () => {
    expect(extractHeadings("> # Citado\n\n# Meu")).toEqual([
      { level: 1, text: "Meu", slug: "meu", line: 3 },
    ]);
  });

  it("guarda a linha do título, que é como o painel navega na aba Escrever", () => {
    const content = ["intro", "", "# Um", "corpo", "", "## Dois"].join("\n");
    expect(extractHeadings(content).map((h) => h.line)).toEqual([3, 6]);
  });

  it("`#` no meio da linha não vira título", () => {
    expect(extractHeadings("nota #1 do dia")).toEqual([]);
  });
});

describe("o slug do sumário é o mesmo `id` do preview (067)", () => {
  it.each([
    ["títulos simples", "# Etapas\n\n## Materiais"],
    ["repetidos", "# Etapas\n\n# Etapas\n\n# Etapas"],
    ["com acento e pontuação", "# Reunião: segunda-feira\n\n## Custo (R$ 1.000)"],
    ["com marcação inline", "# **Obra** da `casa`\n\n## Prazo — 30 dias"],
    ["com emoji", "# Prazo 🚧 curto\n\n## Fim"],
    ["níveis fundos", "### Terceiro\n\n###### Sexto"],
  ])("%s", (_name, content) => {
    expect(slugs(content)).toEqual(previewIds(content));
  });
});
