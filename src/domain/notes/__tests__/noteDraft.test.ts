import { describe, expect, it } from "vitest";
import {
  NOTE_TITLE_MAX,
  UNTITLED_NOTE_TITLE,
  noteExcerpt,
  normalizeNoteDraft,
} from "@/domain/notes/noteDraft";

const draft = (over: Partial<Parameters<typeof normalizeNoteDraft>[0]> = {}) => ({
  title: "Titulo",
  content: "",
  project_id: null,
  ...over,
});

describe("normalizeNoteDraft", () => {
  it("tira o espaço sobrando do título", () => {
    expect(normalizeNoteDraft(draft({ title: "  Reunião de segunda  " })).title).toBe(
      "Reunião de segunda"
    );
  });

  it("título só com espaços vira 'Sem título' — a coluna é not null", () => {
    for (const title of ["", "   ", "\t\n  "]) {
      expect(normalizeNoteDraft(draft({ title })).title).toBe(UNTITLED_NOTE_TITLE);
    }
  });

  it("corta o título no limite, sem deixar espaço na ponta", () => {
    const long = `${"a".repeat(NOTE_TITLE_MAX - 1)} bbbbb`;
    const { title } = normalizeNoteDraft(draft({ title: long }));
    expect(title).toHaveLength(NOTE_TITLE_MAX - 1);
    expect(title).toBe("a".repeat(NOTE_TITLE_MAX - 1));
  });

  // Feature 058: `kind`/`canvas_data` são o contrato com o `check` de `note.kind`.
  it("rascunho sem kind vira 'markdown', o mesmo default da coluna", () => {
    const normalized = normalizeNoteDraft(draft());
    expect(normalized.kind).toBe("markdown");
    expect(normalized.canvas_data).toBeNull();
  });

  it("rascunho de canvas mantém kind e o desenho", () => {
    const canvas_data = { elements: [{ id: "r1", type: "rectangle" }] };
    const normalized = normalizeNoteDraft(
      draft({ kind: "canvas", canvas_data })
    );
    expect(normalized.kind).toBe("canvas");
    expect(normalized.canvas_data).toEqual(canvas_data);
  });

  it("desenho em nota markdown é descartado — seria dado órfão", () => {
    const normalized = normalizeNoteDraft(
      draft({ kind: "markdown", canvas_data: { elements: [{ id: "r1" }] } })
    );
    expect(normalized.canvas_data).toBeNull();
  });

  it("não mexe no content — Markdown cru, indentação inclusive", () => {
    const content = "```\n    codigo indentado\n```\n";
    expect(normalizeNoteDraft(draft({ content })).content).toBe(content);
  });

  it("project_id vazio vira null, id de verdade passa intacto", () => {
    expect(normalizeNoteDraft(draft({ project_id: "" })).project_id).toBeNull();
    expect(normalizeNoteDraft(draft({ project_id: null })).project_id).toBeNull();
    expect(normalizeNoteDraft(draft({ project_id: "p1" })).project_id).toBe("p1");
  });
});

describe("noteExcerpt", () => {
  it("pula título de markdown e pega a primeira linha de conteúdo", () => {
    expect(noteExcerpt("# Reforma\n\nComprar cimento na terça")).toBe(
      "Comprar cimento na terça"
    );
  });

  it("pula régua horizontal de '-' e cerca de código", () => {
    expect(noteExcerpt("---\n\n```\n\nTexto de verdade")).toBe("Texto de verdade");
  });

  it("tira o marcador de lista, deixando o texto do item", () => {
    expect(noteExcerpt("- comprar cimento")).toBe("comprar cimento");
    expect(noteExcerpt("* item\n")).toBe("item");
    expect(noteExcerpt("1. primeiro")).toBe("primeiro");
    expect(noteExcerpt("- [ ] tarefa aberta")).toBe("tarefa aberta");
    expect(noteExcerpt("> citação")).toBe("citação");
  });

  it("tira a marcação inline sem perder o texto", () => {
    expect(noteExcerpt("**negrito** e `código` e [link](https://x.com)")).toBe(
      "negrito e código e link"
    );
    expect(noteExcerpt("~~riscado~~ vale")).toBe("riscado vale");
  });

  it("trunca sem cortar palavra no meio", () => {
    const excerpt = noteExcerpt("abcde fghij klmno pqrst", 12);
    expect(excerpt).toBe("abcde fghij…");
    // O corte cai num limite de palavra: nada de "klm…".
    expect(excerpt.replace("…", "").split(" ")).toEqual(["abcde", "fghij"]);
  });

  it("não trunca o que já cabe", () => {
    expect(noteExcerpt("curto", 12)).toBe("curto");
    expect(noteExcerpt("exatamente12", 12)).toBe("exatamente12");
  });

  it("palavra única maior que o limite é cortada na força, não devolvida inteira", () => {
    expect(noteExcerpt("supercalifragilisticexpialidocious", 10)).toBe("supercalif…");
  });

  it("conteúdo vazio ou só estrutura devolve string vazia", () => {
    expect(noteExcerpt("")).toBe("");
    expect(noteExcerpt("\n\n   \n")).toBe("");
    expect(noteExcerpt("# só título\n---\n")).toBe("");
  });
});
