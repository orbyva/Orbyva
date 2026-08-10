import { describe, expect, it } from "vitest";
import type { Dimension } from "@/types/dimensions";
import {
  hasExactClassNameMatch,
  listTypesForCreate,
  resolveNatureForCreate,
  shouldOfferCreateClass,
  shouldOfferCreateCta,
} from "@/domain/dimensions/classSearchCreate";

const options = [
  { name: "Aluguel" },
  { name: "Uber" },
  { name: "Mercado" },
];

const dimensions: Dimension[] = [
  {
    id: 1,
    name: "Despesa",
    types: [
      {
        id: 10,
        name: "Moradia",
        hex_color: "#111",
        lucide_icon: "home",
        classes: [{ id: 100, name: "Aluguel" }],
      },
      {
        id: 11,
        name: "Transporte",
        hex_color: "#222",
        lucide_icon: "car",
        classes: [],
      },
    ],
  },
  {
    id: 2,
    name: "Receita",
    types: [
      {
        id: 20,
        name: "Salário",
        hex_color: null,
        lucide_icon: null,
        classes: [{ id: 200, name: "CLT" }],
      },
    ],
  },
];

describe("hasExactClassNameMatch", () => {
  it("ignora query vazia", () => {
    expect(hasExactClassNameMatch(options, "")).toBe(false);
    expect(hasExactClassNameMatch(options, "  ")).toBe(false);
  });

  it("detecta match exato case-insensitive", () => {
    expect(hasExactClassNameMatch(options, "uber")).toBe(true);
    expect(hasExactClassNameMatch(options, " Uber ")).toBe(true);
    expect(hasExactClassNameMatch(options, "Ubers")).toBe(false);
  });
});

describe("shouldOfferCreateClass", () => {
  it("não oferece com query vazia ou allowCreate false", () => {
    expect(shouldOfferCreateClass("", options)).toBe(false);
    expect(shouldOfferCreateClass("Novo", options, false)).toBe(false);
  });

  it("oferece quando não há match exato (mesmo com parcial)", () => {
    expect(shouldOfferCreateClass("Alu", options)).toBe(true);
    expect(shouldOfferCreateClass("Farmácia", options)).toBe(true);
  });

  it("não oferece quando já existe o nome", () => {
    expect(shouldOfferCreateClass("Aluguel", options)).toBe(false);
  });
});

describe("listTypesForCreate", () => {
  it("lista tipos de todas as naturezas sem filtro", () => {
    const types = listTypesForCreate(dimensions);
    expect(types.map((t) => t.name)).toEqual([
      "Moradia",
      "Salário",
      "Transporte",
    ]);
  });

  it("filtra por natureza", () => {
    const types = listTypesForCreate(dimensions, "Despesa");
    expect(types).toHaveLength(2);
    expect(types.every((t) => t.natureName === "Despesa")).toBe(true);
  });
});

describe("resolveNatureForCreate", () => {
  it("respeita natureza preferida", () => {
    expect(resolveNatureForCreate(dimensions, "Receita")?.name).toBe("Receita");
  });

  it("cai em Despesa por padrão", () => {
    expect(resolveNatureForCreate(dimensions)?.name).toBe("Despesa");
  });
});

describe("shouldOfferCreateCta", () => {
  it("oferece CTA quando há busca sem match exato e naturezas", () => {
    expect(shouldOfferCreateCta("Farmácia", options, true, true)).toBe(true);
  });

  it("não oferece sem naturezas ou com match exato", () => {
    expect(shouldOfferCreateCta("Farmácia", options, true, false)).toBe(false);
    expect(shouldOfferCreateCta("Aluguel", options, true, true)).toBe(false);
  });
});
