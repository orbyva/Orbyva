import { describe, expect, it } from "vitest";
import { isTravelExpenseClass } from "@/domain/finance/travelLink";
import type { Dimension } from "@/types/dimensions";

const dims: Dimension[] = [
  {
    id: 1,
    name: "Despesa",
    types: [
      {
        id: 10,
        name: "Viagens",
        classes: [{ id: 100, name: "Hospedagem" }],
      },
      {
        id: 11,
        name: "Alimentação",
        classes: [{ id: 101, name: "Mercado" }],
      },
    ],
  },
];

describe("isTravelExpenseClass", () => {
  it("detecta tipo Viagens", () => {
    expect(isTravelExpenseClass(dims, 100)).toBe(true);
  });

  it("ignora outras categorias", () => {
    expect(isTravelExpenseClass(dims, 101)).toBe(false);
    expect(isTravelExpenseClass(dims, null)).toBe(false);
  });
});
