import { describe, expect, it } from "vitest";

import { mentionSnippet, noteCountLabel, noteEditedLabel } from "@/domain/notes/backlinks";

describe("mentionSnippet", () => {
  it("devolve o contexto da linha em volta da menção", () => {
    expect(mentionSnippet("Primeira linha\nrevisar o [[Plano]] amanhã cedo\nfim", "plano")).toEqual({
      before: "revisar o ",
      link: "Plano",
      after: " amanhã cedo",
    });
  });

  it("tira marcador de lista/tarefa/título do começo da linha e markdown inline", () => {
    expect(mentionSnippet("- [ ] ler **o** [[Plano]] e `x`", "Plano")).toEqual({
      before: "ler o ",
      link: "Plano",
      after: " e x",
    });
    expect(mentionSnippet("## [[Plano]]", "Plano")?.before).toBe("");
  });

  it("corta em palavra inteira com reticências quando a linha é longa", () => {
    const content = `${"palavra ".repeat(12)}[[Plano]]${" depois".repeat(12)}`;
    const snippet = mentionSnippet(content, "Plano", 20)!;
    expect(snippet.before.startsWith("…")).toBe(true);
    expect(snippet.before).toMatch(/…palavra( palavra)* $/);
    expect(snippet.after.endsWith("…")).toBe(true);
    expect(snippet.after).toMatch(/^( depois)+…$/);
  });

  it("outros wiki-links no contexto viram texto e a menção em código não conta", () => {
    expect(mentionSnippet("`[[Plano]]`\nver [[Meta]] e [[Plano]]", "Plano")).toEqual({
      before: "ver Meta e ",
      link: "Plano",
      after: "",
    });
  });

  it("null sem menção ou com título vazio", () => {
    expect(mentionSnippet("nada aqui", "Plano")).toBeNull();
    expect(mentionSnippet("[[Plano]]", "  ")).toBeNull();
  });
});

describe("noteEditedLabel", () => {
  const now = new Date(2026, 9, 7, 15, 0);
  it("dias relativos na última semana", () => {
    expect(noteEditedLabel(new Date(2026, 9, 7, 1).toISOString(), now)).toBe("hoje");
    expect(noteEditedLabel(new Date(2026, 9, 6, 23).toISOString(), now)).toBe("ontem");
    expect(noteEditedLabel(new Date(2026, 9, 3).toISOString(), now)).toBe("há 4 dias");
  });
  it("data curta depois disso, com ano só se for outro", () => {
    expect(noteEditedLabel(new Date(2026, 2, 12).toISOString(), now)).toBe("12 mar");
    expect(noteEditedLabel(new Date(2025, 11, 1).toISOString(), now)).toBe("1 dez 2025");
  });
  it("null sem data válida", () => {
    expect(noteEditedLabel(null, now)).toBeNull();
    expect(noteEditedLabel("xx", now)).toBeNull();
  });
});

describe("noteCountLabel", () => {
  it("singular e plural", () => {
    expect(noteCountLabel(1)).toBe("1 nota");
    expect(noteCountLabel(3)).toBe("3 notas");
  });
});
