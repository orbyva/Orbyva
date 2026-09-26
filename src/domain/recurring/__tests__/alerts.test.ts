import { describe, expect, it } from "vitest";
import {
  calculateCommittedThisMonth,
  calculateProjectedMonthBalance,
  filterRecurringList,
  getRecurringDueAlerts,
  getRecurringProgress,
} from "@/domain/recurring";
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
    description: "Netflix",
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

describe("getRecurringProgress", () => {
  it("calcula progresso de parcelas", () => {
    const rec = makeRecurring({ paid_parcels: [1] });
    const progress = getRecurringProgress(rec);
    expect(progress).toEqual({ total: 2, paid: 1, open: 1, percent: 50 });
  });
});

describe("filterRecurringList", () => {
  it("filtra parcelas pagas na série inteira (mês em que todas estão pagas)", () => {
    const paid = makeRecurring({ id: "paid", paid_parcels: [1, 2] });
    const open = makeRecurring({ id: "open", paid_parcels: [] });
    const result = filterRecurringList([paid, open], "paid", [], 2026, 7);
    expect(result.map((r) => r.id)).toEqual(["paid"]);
  });

  it("filtra em aberto no mês escolhido, mesmo com parcelas futuras", () => {
    const paid = makeRecurring({ id: "paid", paid_parcels: [1, 2] });
    const open = makeRecurring({ id: "open", paid_parcels: [] });
    const result = filterRecurringList([paid, open], "open", [], 2026, 7);
    expect(result.map((r) => r.id)).toEqual(["open"]);
  });

  it("Em aberto e Pagas olham só a parcela do mês, não o resto da série", () => {
    const mid = makeRecurring({
      id: "mid",
      paid_parcels: [1],
      installments: [
        { number: 1, dueDate: "2026-07-05", label: "Parcela 1" },
        { number: 2, dueDate: "2026-08-05", label: "Parcela 2" },
      ],
    });

    expect(
      filterRecurringList([mid], "paid", [], 2026, 7).map((r) => r.id)
    ).toEqual(["mid"]);
    expect(filterRecurringList([mid], "open", [], 2026, 7)).toEqual([]);
    expect(
      filterRecurringList([mid], "open", [], 2026, 8).map((r) => r.id)
    ).toEqual(["mid"]);
    expect(filterRecurringList([mid], "paid", [], 2026, 8)).toEqual([]);
  });
});

describe("getRecurringDueAlerts", () => {
  it("retorna alerta para parcela atrasada", () => {
    const rec = makeRecurring({
      installments: [
        { number: 1, dueDate: "2020-01-05", label: "Parcela 1" },
      ],
    });
    const alerts = getRecurringDueAlerts([rec]);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].status).toBe("overdue");
  });
});

describe("calculateProjectedMonthBalance", () => {
  it("soma realizado + comprometido", () => {
    const rec = makeRecurring({
      installments: [
        { number: 1, dueDate: "2026-07-05", label: "Parcela 1" },
      ],
    });
    const committed = calculateCommittedThisMonth(
      [rec],
      new Date("2026-07-15T12:00:00")
    );
    expect(committed.pay).toBe(100);
    const projected = calculateProjectedMonthBalance(
      { receita: 5000, despesa: 2000 },
      committed
    );
    expect(projected.projectedExpense).toBe(2100);
    expect(projected.projectedBalance).toBe(2900);
  });
});
