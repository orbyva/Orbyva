import { describe, expect, it } from "vitest";
import {
  buildSortedBudgetGroups,
  type BudgetSortState,
} from "@/domain/budget/listView";
import {
  sortClassesList,
  sortTypesList,
} from "@/domain/dimensions/listView";
import type { Class, Nature, Type } from "@/types/finance";
import type { MonthlyBudgetSummary } from "@/types/finance";

const natures: Nature[] = [
  { id: 1, name: "Receita" },
  { id: 2, name: "Despesa" },
];

function typeRow(overrides: Partial<Type> & { id: number; name: string }): Type {
  return {
    hex_color: null,
    lucide_icon: null,
    nature_id: 2,
    ...overrides,
  } as Type;
}

describe("sortTypesList", () => {
  it("ordena por natureza e depois por nome", () => {
    const types = [
      typeRow({ id: 1, name: "Uber", nature_id: 2 }),
      typeRow({ id: 2, name: "Salário", nature_id: 1 }),
      typeRow({ id: 3, name: "Aluguel", nature_id: 2 }),
    ];
    const sorted = sortTypesList(types, natures, {
      key: "nature",
      dir: "asc",
    });
    // Despesa < Receita (pt-BR); dentro da mesma natureza, nome crescente
    expect(sorted.map((t) => t.name)).toEqual(["Aluguel", "Uber", "Salário"]);
  });
});

describe("sortClassesList", () => {
  it("ao ordenar por tipo, desempata por classe", () => {
    const types = [
      typeRow({ id: 1, name: "Moradia" }),
      typeRow({ id: 2, name: "Alimentação" }),
    ];
    const classes = [
      { id: 1, name: "Condomínio", type_id: 1 },
      { id: 2, name: "Aluguel", type_id: 1 },
      { id: 3, name: "Mercado", type_id: 2 },
    ] as Class[];

    const sorted = sortClassesList(classes, types, {
      key: "type",
      dir: "asc",
    });
    expect(sorted.map((c) => c.name)).toEqual([
      "Mercado",
      "Aluguel",
      "Condomínio",
    ]);
  });
});

describe("buildSortedBudgetGroups", () => {
  it("ordena tipos e classes crescentes", () => {
    const budgets = [
      {
        id: 1,
        type_id: 1,
        type_name: "Moradia",
        class_id: 2,
        class_name: "Condomínio",
        nature_name: "Despesa",
        planned_value: 300,
        expense_value: 100,
        remaining_value: 200,
        percentage_used: 33,
        status: "OK",
      },
      {
        id: 2,
        type_id: 1,
        type_name: "Moradia",
        class_id: 1,
        class_name: "Aluguel",
        nature_name: "Despesa",
        planned_value: 2000,
        expense_value: 2000,
        remaining_value: 0,
        percentage_used: 100,
        status: "OK",
      },
      {
        id: 3,
        type_id: 2,
        type_name: "Alimentação",
        class_id: 3,
        class_name: "Mercado",
        nature_name: "Despesa",
        planned_value: 800,
        expense_value: 400,
        remaining_value: 400,
        percentage_used: 50,
        status: "OK",
      },
    ] as MonthlyBudgetSummary[];

    const sort: BudgetSortState = { key: "type", dir: "asc" };
    const groups = buildSortedBudgetGroups(budgets, sort);
    expect(groups.map((g) => g.typeName)).toEqual(["Alimentação", "Moradia"]);
    expect(groups[1].children.map((c) => c.class_name)).toEqual([
      "Aluguel",
      "Condomínio",
    ]);
  });
});
