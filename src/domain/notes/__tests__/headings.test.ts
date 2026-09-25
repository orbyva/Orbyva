import { describe, expect, it } from "vitest";
import {
  FALLBACK_HEADING_SLUG,
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
