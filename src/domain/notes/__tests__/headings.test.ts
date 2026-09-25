import { describe, expect, it } from "vitest";
import {
  FALLBACK_HEADING_SLUG,
  extractHeadings,
  slugifyHeading,
  uniqueHeadingId,
} from "@/domain/notes/headings";

describe("slugifyHeading", () => {
  it.each([
    ["Introdução", "introducao"],
    ["Como Rodar o Café?", "como-rodar-o-cafe"],
    ["Ação, reação e coração", "acao-reacao-e-coracao"],
    ["  espaços   demais  ", "espacos-demais"],
    ["Passo 1: instalar", "passo-1-instalar"],
    ["JavaScript & TypeScript", "javascript-typescript"],
    ["já-com-hífen", "ja-com-hifen"],
    ["MAIÚSCULAS", "maiusculas"],
  ])("%s → %s", (texto, esperado) => {
    expect(slugifyHeading(texto)).toBe(esperado);
  });

  it("título sem letra nenhuma ainda ganha um alvo", () => {
    // Sem isto o `id` sairia vazio e o link do sumário não teria para onde ir.
    expect(slugifyHeading("")).toBe(FALLBACK_HEADING_SLUG);
    expect(slugifyHeading("   ")).toBe(FALLBACK_HEADING_SLUG);
    expect(slugifyHeading("!!! ???")).toBe(FALLBACK_HEADING_SLUG);
    expect(slugifyHeading("🚀")).toBe(FALLBACK_HEADING_SLUG);
  });

  it("não deixa hífen sobrando nas pontas nem repetido no meio", () => {
    expect(slugifyHeading("-- Começo e fim --")).toBe("comeco-e-fim");
    expect(slugifyHeading("um  --  dois")).toBe("um-dois");
  });
});

describe("uniqueHeadingId", () => {
  it("o primeiro fica com o slug limpo; os repetidos numeram a partir de 2", () => {
    const used = new Map<string, number>();

    expect(uniqueHeadingId("notas", used)).toBe("notas");
    expect(uniqueHeadingId("notas", used)).toBe("notas-2");
    expect(uniqueHeadingId("notas", used)).toBe("notas-3");
  });

  it("slugs diferentes não interferem um no outro", () => {
    const used = new Map<string, number>();

    expect(uniqueHeadingId("alfa", used)).toBe("alfa");
    expect(uniqueHeadingId("beta", used)).toBe("beta");
    expect(uniqueHeadingId("alfa", used)).toBe("alfa-2");
  });

  it("contador novo recomeça do zero (uma nota não contamina a outra)", () => {
    expect(uniqueHeadingId("notas", new Map())).toBe("notas");
    expect(uniqueHeadingId("notas", new Map())).toBe("notas");
  });
});

/**
 * `extractHeadings` — o sumário da nota (feature 070). O `slug` tem que bater com o `id` que o
 * preview escreve (`rehypeHeadingIds`, 069): é o que faz o item do sumário encontrar a âncora.
 */
describe("extractHeadings", () => {
  it("lê os seis níveis, com o texto e a linha de cada um", () => {
    const doc = ["# um", "## dois", "### três", "#### quatro", "##### cinco", "###### seis"].join(
      "\n"
    );
    expect(extractHeadings(doc).map((h) => [h.level, h.text, h.line])).toEqual([
      [1, "um", 1],
      [2, "dois", 2],
      [3, "três", 3],
      [4, "quatro", 4],
      [5, "cinco", 5],
      [6, "seis", 6],
    ]);
  });

  it("`#######` (sete) não é título, e `#sem espaço` também não", () => {
    expect(extractHeadings("####### sete")).toEqual([]);
    expect(extractHeadings("#semespaco")).toEqual([]);
  });

  it("ignora `#` dentro de bloco de código — lá é conteúdo, não título", () => {
    const doc = ["# de verdade", "", "```sh", "# comentário de shell", "```", "", "## outro"].join(
      "\n"
    );
    expect(extractHeadings(doc).map((h) => h.text)).toEqual(["de verdade", "outro"]);
  });

  it("tira a marcação do texto, como o preview faz", () => {
    expect(extractHeadings("## Um **título** com `código`")[0]).toMatchObject({
      text: "Um título com código",
      slug: "um-titulo-com-codigo",
    });
    // Sequência de fechamento (`## Título ##`) é marcação, não texto.
    expect(extractHeadings("## Fechado ##")[0].text).toBe("Fechado");
  });

  it("título vazio ainda vira um alvo — `#` sozinho não pode sumir do sumário", () => {
    const headings = extractHeadings("#\n\ntexto");
    expect(headings).toHaveLength(1);
    expect(headings[0]).toMatchObject({ level: 1, text: "", slug: "secao" });
  });

  it("títulos repetidos recebem sufixo, na mesma ordem que o preview numera", () => {
    const doc = "## Notas\n\n## Notas\n\n## Notas";
    expect(extractHeadings(doc).map((h) => h.slug)).toEqual([
      "notas",
      "notas-2",
      "notas-3",
    ]);
  });

  it("nota sem título nenhum devolve lista vazia", () => {
    expect(extractHeadings("só texto\n\ne mais texto")).toEqual([]);
  });

  it("título indentado em até três espaços ainda conta (regra do CommonMark)", () => {
    expect(extractHeadings("   ### recuado")[0]?.text).toBe("recuado");
    // Quatro espaços já é bloco de código indentado.
    expect(extractHeadings("    #### código")).toEqual([]);
  });
});
