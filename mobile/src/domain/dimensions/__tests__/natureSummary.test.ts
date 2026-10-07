import { describe, expect, it } from "vitest";

import { natureSummary } from "../listView";

const tipo = (id: number, classes: number) => ({
  id,
  name: `T${id}`,
  classes: Array.from({ length: classes }, (_, i) => ({ id: id * 100 + i, name: `C${i}` })),
});

describe("natureSummary", () => {
  it("soma categorias e subcategorias no plural", () => {
    expect(natureSummary({ types: [tipo(1, 4), tipo(2, 3), tipo(3, 0)] })).toBe(
      "3 categorias · 7 subcategorias"
    );
  });

  it("usa o singular quando há uma só", () => {
    expect(natureSummary({ types: [tipo(1, 1)] })).toBe("1 categoria · 1 subcategoria");
  });

  it("mostra zero sem quebrar", () => {
    expect(natureSummary({ types: [] })).toBe("0 categorias · 0 subcategorias");
  });
});
