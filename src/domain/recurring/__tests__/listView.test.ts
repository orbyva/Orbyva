import { describe, expect, it } from "vitest";
import {
  countRecurringByNature,
  filterRecurringByNature,
  filterRecurringBySearch,
  filterRecurringByYearMonth,
  sortRecurringList,
  sumRecurringActiveInMonth,
  toggleRecurringSort,
} from "@/domain/recurring/listView";
import type { Recurring } from "@/types/recurring";

function makeRecurring(overrides: Partial<Recurring> = {}): Recurring {
  return {
    id: "1",
    class: {
      id: 1,
      name: "Classe",
      type: {
        id: 1,
        name: "Tipo",
        hex_color: "#fff",
        lucide_icon: "wallet",
        nature: { id: 2, name: "Despesa" },
      },
    },
    value: 100,
    description: "Conta",
    frequency: "Mensal",
    validity: null,
    due_day: 5,
    installment_count: 2,
    payment_start_date: "2026-07-01",
    status: true,
    created_at: "2026-07-01T00:00:00Z",
    paid_parcels: [],
    installments: [
      { number: 1, dueDate: "2026-07-05", label: "Parcela 1" },
      { number: 2, dueDate: "2026-08-05", label: "Parcela 2" },
    ],
    ...overrides,
  };
}

describe("filterRecurringBySearch", () => {
  it("sem busca devolve a lista inteira", () => {
    const list = [makeRecurring({ id: "a" }), makeRecurring({ id: "b" })];
    expect(filterRecurringBySearch(list, "  ").map((r) => r.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("filtra por descrição", () => {
    const luz = makeRecurring({ id: "luz", description: "Conta de luz" });
    const net = makeRecurring({ id: "net", description: "Internet" });
    expect(
      filterRecurringBySearch([luz, net], "LUZ").map((r) => r.id)
    ).toEqual(["luz"]);
  });

  it("filtra por categoria", () => {
    const moradia = makeRecurring({
      id: "m",
      description: "Parcela",
      class: {
        id: 1,
        name: "Aluguel",
        type: {
          id: 1,
          name: "Moradia",
          hex_color: "#fff",
          lucide_icon: "home",
          nature: { id: 2, name: "Despesa" },
        },
      },
    });
    const comida = makeRecurring({
      id: "c",
      description: "Mercado",
      class: {
        id: 2,
        name: "Supermercado",
        type: {
          id: 2,
          name: "Alimentação",
          hex_color: "#fff",
          lucide_icon: "utensils",
          nature: { id: 2, name: "Despesa" },
        },
      },
    });
    expect(
      filterRecurringBySearch([moradia, comida], "mora").map((r) => r.id)
    ).toEqual(["m"]);
  });

  it("filtra por subcategoria", () => {
    const aluguel = makeRecurring({
      id: "a",
      description: "Apt",
      class: {
        id: 1,
        name: "Aluguel",
        type: {
          id: 1,
          name: "Moradia",
          hex_color: "#fff",
          lucide_icon: "home",
          nature: { id: 2, name: "Despesa" },
        },
      },
    });
    const luz = makeRecurring({
      id: "l",
      description: "CEMIG",
      class: {
        id: 2,
        name: "Energia",
        type: {
          id: 1,
          name: "Moradia",
          hex_color: "#fff",
          lucide_icon: "home",
          nature: { id: 2, name: "Despesa" },
        },
      },
    });
    expect(
      filterRecurringBySearch([aluguel, luz], "alug").map((r) => r.id)
    ).toEqual(["a"]);
  });
});

describe("filterRecurringByNature", () => {
  it("separa a receber e a pagar", () => {
    const pay = makeRecurring({ id: "p" });
    const receive = makeRecurring({
      id: "r",
      class: {
        id: 2,
        name: "Salário",
        type: {
          id: 2,
          name: "Renda",
          hex_color: "#0f0",
          lucide_icon: "wallet",
          nature: { id: 1, name: "Receita" },
        },
      },
    });

    expect(filterRecurringByNature([pay, receive], "pay").map((r) => r.id)).toEqual([
      "p",
    ]);
    expect(
      filterRecurringByNature([pay, receive], "receive").map((r) => r.id)
    ).toEqual(["r"]);
    expect(countRecurringByNature([pay, receive])).toEqual({
      all: 2,
      receive: 1,
      pay: 1,
    });
  });
});

describe("sortRecurringList", () => {
  it("ordena por tipo asc por padrão", () => {
    const a = makeRecurring({
      id: "a",
      class: {
        id: 1,
        name: "X",
        type: {
          id: 1,
          name: "Moradia",
          hex_color: "#fff",
          lucide_icon: "home",
          nature: { id: 2, name: "Despesa" },
        },
      },
    });
    const b = makeRecurring({
      id: "b",
      class: {
        id: 2,
        name: "Y",
        type: {
          id: 2,
          name: "Alimentação",
          hex_color: "#fff",
          lucide_icon: "utensils",
          nature: { id: 2, name: "Despesa" },
        },
      },
    });

    const sorted = sortRecurringList([a, b], { key: "type", dir: "asc" });
    expect(sorted.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("ao ordenar por tipo, desempata por classe crescente", () => {
    const zebra = makeRecurring({
      id: "z",
      description: "Z",
      class: {
        id: 1,
        name: "Zebra",
        type: {
          id: 1,
          name: "Moradia",
          hex_color: "#fff",
          lucide_icon: "home",
          nature: { id: 2, name: "Despesa" },
        },
      },
    });
    const aluguel = makeRecurring({
      id: "a",
      description: "A",
      class: {
        id: 2,
        name: "Aluguel",
        type: {
          id: 1,
          name: "Moradia",
          hex_color: "#fff",
          lucide_icon: "home",
          nature: { id: 2, name: "Despesa" },
        },
      },
    });

    const sorted = sortRecurringList([zebra, aluguel], {
      key: "type",
      dir: "desc",
    });
    expect(sorted.map((r) => r.id)).toEqual(["a", "z"]);
  });

  it("alterna direção no toggle", () => {
    expect(toggleRecurringSort({ key: "type", dir: "asc" }, "type")).toEqual({
      key: "type",
      dir: "desc",
    });
    expect(toggleRecurringSort({ key: "type", dir: "asc" }, "value")).toEqual({
      key: "value",
      dir: "asc",
    });
  });
});

describe("filterRecurringByYearMonth", () => {
  it("mantém só recorrências com parcela no mês", () => {
    const jul = makeRecurring({ id: "jul" });
    const ago = makeRecurring({
      id: "ago",
      installments: [
        { number: 1, dueDate: "2026-08-05", label: "1" },
        { number: 2, dueDate: "2026-09-05", label: "2" },
      ],
    });

    expect(
      filterRecurringByYearMonth([jul, ago], 2026, 7).map((r) => r.id)
    ).toEqual(["jul"]);
    expect(sumRecurringActiveInMonth([jul, ago], 2026, 7)).toEqual({
      receive: 0,
      pay: 100,
    });
  });
});
