import { describe, expect, it } from "vitest";
import type { Class, Type } from "@/types/finance";
import {
  filterClassesBySearch,
  filterTypesBySearch,
  visibleClassesForTypeSearch,
} from "@/domain/dimensions/search";

const types: Type[] = [
  {
    id: 1,
    name: "Moradia",
    nature: { id: 1, name: "Despesa" },
    hex_color: null,
    lucide_icon: null,
  },
  {
    id: 2,
    name: "Salário",
    nature: { id: 2, name: "Receita" },
    hex_color: null,
    lucide_icon: null,
  },
];

const classes: Class[] = [
  { id: 10, name: "Aluguel", type_id: 1, type: types[0] },
  { id: 11, name: "CLT", type_id: 2, type: types[1] },
];

describe("filterTypesBySearch", () => {
  it("retorna tudo sem busca", () => {
    expect(filterTypesBySearch(types, classes, "")).toHaveLength(2);
  });

  it("filtra por nome da categoria", () => {
    expect(filterTypesBySearch(types, classes, "mora")).toEqual([types[0]]);
  });

  it("filtra por subcategoria", () => {
    expect(filterTypesBySearch(types, classes, "aluguel")).toEqual([types[0]]);
  });

  it("filtra por natureza", () => {
    expect(filterTypesBySearch(types, classes, "receita")).toEqual([types[1]]);
  });
});

describe("filterClassesBySearch", () => {
  it("filtra por nome", () => {
    expect(filterClassesBySearch(classes, "clt").map((c) => c.id)).toEqual([11]);
  });
});

describe("visibleClassesForTypeSearch", () => {
  it("mostra todas as classes se a categoria bateu", () => {
    const under = classes.filter((c) => c.type_id === 1);
    expect(visibleClassesForTypeSearch(types[0]!, under, "moradia")).toEqual(
      under
    );
  });

  it("filtra só a subcategoria quando a busca é o nome dela", () => {
    const under = classes.filter((c) => c.type_id === 1);
    expect(
      visibleClassesForTypeSearch(types[0]!, under, "aluguel").map((c) => c.id)
    ).toEqual([10]);
  });
});
