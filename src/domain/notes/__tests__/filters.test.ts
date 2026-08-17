import { describe, expect, it } from "vitest";
import { filterNotes } from "@/domain/notes/filters";
import type { Note } from "@/types/notes";

const note = (over: Partial<Note> & { id: string }): Note => ({
  title: "",
  content: "",
  project_id: null,
  ...over,
});

const notes: Note[] = [
  note({ id: "n1", title: "Reunião de segunda", content: "pauta do time" }),
  note({ id: "n2", title: "Mercado", content: "cimento e **areia**" }),
  note({ id: "n3", title: "Ideias", content: "" }),
];

const ids = (result: Note[]) => result.map((n) => n.id);

describe("filterNotes", () => {
  it("consulta vazia devolve tudo, na ordem recebida", () => {
    expect(filterNotes(notes, "")).toBe(notes);
    expect(ids(filterNotes(notes, "   "))).toEqual(["n1", "n2", "n3"]);
  });

  it("casa no título", () => {
    expect(ids(filterNotes(notes, "mercado"))).toEqual(["n2"]);
  });

  it("casa no conteúdo, não só no título", () => {
    expect(ids(filterNotes(notes, "pauta"))).toEqual(["n1"]);
  });

  it("ignora caixa e acento nos dois lados", () => {
    expect(ids(filterNotes(notes, "REUNIAO"))).toEqual(["n1"]);
    expect(ids(filterNotes(notes, "reunião"))).toEqual(["n1"]);
    expect(ids(filterNotes([note({ id: "x", title: "Sao Paulo" })], "são"))).toEqual([
      "x",
    ]);
  });

  it("sem nenhum casamento devolve lista vazia", () => {
    expect(filterNotes(notes, "xyz")).toEqual([]);
  });
});
