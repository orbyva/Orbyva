import { describe, expect, it } from "vitest";
import { parseBookSearchQuery } from "@/domain/books";

describe("parseBookSearchQuery", () => {
  it("NÃO separa por 'de' — é parte do título em português", () => {
    // "Memórias Póstumas de Brás Cubas" não é livro do autor "Brás Cubas".
    expect(parseBookSearchQuery("Memórias Póstumas de Brás Cubas")).toEqual({
      title: "Memórias Póstumas de Brás Cubas",
      authors: "",
    });
  });

  it("separa por 'por' e por 'by'", () => {
    expect(parseBookSearchQuery("Sapiens por Yuval Harari").authors).toBe(
      "Yuval Harari"
    );
    expect(parseBookSearchQuery("Dune by Frank Herbert").authors).toBe(
      "Frank Herbert"
    );
  });

  it("separa por travessão como Título - Autor", () => {
    expect(parseBookSearchQuery("1984 - George Orwell")).toEqual({
      title: "1984",
      authors: "George Orwell",
    });
  });

  it("sem separador, tudo vira título", () => {
    expect(parseBookSearchQuery("Inteligência Pragmática")).toEqual({
      title: "Inteligência Pragmática",
      authors: "",
    });
  });

  it("string vazia não quebra", () => {
    expect(parseBookSearchQuery("   ")).toEqual({ title: "", authors: "" });
  });
});
