import { describe, expect, it } from "vitest";
import {
  buildBalanceSeriesWindow,
  buildMonthCashBalance,
  buildMonthProjection,
  buildProjectionSeries,
  buildProjectionSeriesWindow,
  buildPurchaseSimulation,
  filterOpenProjectionLines,
  formatYm,
  futureMonthsForSimulation,
  indexAvulsoLedgerByYm,
  indexLedgerByYm,
  ledgerTransactionsToLines,
  simulationAmountForYm,
} from "@/domain/recurring/projection";
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
    description: "Aluguel",
    frequency: "Mensal",
    validity: null,
    due_day: 5,
    installment_count: 3,
    payment_start_date: "2026-07-01",
    status: true,
    created_at: "2026-07-01T00:00:00Z",
    paid_parcels: [],
    installments: [
      { number: 1, dueDate: "2026-07-05", label: "Parcela 1" },
      { number: 2, dueDate: "2026-08-05", label: "Parcela 2" },
      { number: 3, dueDate: "2026-09-05", label: "Parcela 3" },
    ],
    ...overrides,
  };
}

function makeReceita(overrides: Partial<Recurring> = {}): Recurring {
  return makeRecurring({
    id: "rec",
    description: "Salário",
    value: 5000,
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
    installment_count: 2,
    installments: [
      { number: 1, dueDate: "2026-07-01", label: "Parcela 1" },
      { number: 2, dueDate: "2026-08-01", label: "Parcela 2" },
    ],
    ...overrides,
  });
}

describe("formatYm", () => {
  it("formata ano-mês", () => {
    expect(formatYm(2026, 7)).toBe("2026-07");
  });
});

describe("buildMonthProjection", () => {
  it("separa a receber e a pagar no mês e calcula saldo", () => {
    const pay = makeRecurring();
    const receive = makeReceita();
    const m = buildMonthProjection([pay, receive], 2026, 7);

    expect(m.payLines).toHaveLength(1);
    expect(m.receiveLines).toHaveLength(1);
    expect(m.payTotal).toBe(100);
    expect(m.receiveTotal).toBe(5000);
    expect(m.net).toBe(4900);
    expect(m.payLines[0].description).toContain("Aluguel");
    expect(m.payLines[0].paid).toBe(false);
  });

  it("marca parcela paga e ainda inclui no comprometido", () => {
    const pay = makeRecurring({ paid_parcels: [1] });
    const m = buildMonthProjection([pay], 2026, 7);
    expect(m.payLines).toHaveLength(1);
    expect(m.payLines[0].paid).toBe(true);
    expect(m.payTotal).toBe(100);
  });

  it("exclui investimento do a pagar", () => {
    const inv = makeRecurring({
      id: "inv",
      description: "Aporte",
      class: {
        id: 9,
        name: "Aporte",
        type: {
          id: 9,
          name: "Meta",
          hex_color: "#00f",
          lucide_icon: "piggy",
          nature: { id: 3, name: "Investimento" },
        },
      },
    });
    const m = buildMonthProjection([inv], 2026, 7);
    expect(m.payLines).toHaveLength(0);
    expect(m.receiveLines).toHaveLength(0);
  });

  it("não inclui parcelas de outro mês", () => {
    const pay = makeRecurring();
    const m = buildMonthProjection([pay], 2026, 10);
    expect(m.payLines).toHaveLength(0);
    expect(m.payTotal).toBe(0);
  });
});

describe("filterOpenProjectionLines", () => {
  it("remove linhas pagas da vista", () => {
    const pay = makeRecurring({ paid_parcels: [1] });
    const m = buildMonthProjection([pay], 2026, 7);
    const open = filterOpenProjectionLines(m);
    expect(open.payLines).toHaveLength(0);
    expect(m.payTotal).toBe(100);
  });
});

describe("buildMonthProjection openOnly", () => {
  it("exclui pagas das linhas e dos totais", () => {
    const pay = makeRecurring({ paid_parcels: [1] });
    const m = buildMonthProjection([pay], 2026, 7, { openOnly: true });
    expect(m.payLines).toHaveLength(0);
    expect(m.payTotal).toBe(0);
  });
});

describe("buildProjectionSeries", () => {
  it("agrega vários meses", () => {
    const pay = makeRecurring();
    const series = buildProjectionSeries(
      [pay],
      { year: 2026, month: 7 },
      { year: 2026, month: 9 }
    );
    expect(series).toHaveLength(3);
    expect(series.map((p) => p.ym)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    expect(series.every((p) => p.payTotal === 100)).toBe(true);
  });

  it("respeita openOnly na série", () => {
    const pay = makeRecurring({ paid_parcels: [1] });
    const series = buildProjectionSeries(
      [pay],
      { year: 2026, month: 7 },
      { year: 2026, month: 7 },
      { openOnly: true }
    );
    expect(series[0].payTotal).toBe(0);
  });
});

describe("buildProjectionSeriesWindow", () => {
  it("inclui passado, âncora e meses futuros", () => {
    const pay = makeRecurring({
      installment_count: 12,
      installments: Array.from({ length: 12 }, (_, i) => {
        const month = 7 + i;
        const year = month > 12 ? 2027 : 2026;
        const m = ((month - 1) % 12) + 1;
        return {
          number: i + 1,
          dueDate: `${year}-${String(m).padStart(2, "0")}-05`,
          label: `Parcela ${i + 1}`,
        };
      }),
    });

    const series = buildProjectionSeriesWindow(
      [pay],
      { year: 2026, month: 8 },
      { past: 1, future: 2 }
    );

    expect(series.map((p) => p.ym)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    expect(series[3].payTotal).toBe(100);
  });
});

describe("buildMonthCashBalance", () => {
  it("mantém parcela paga e soma só avulsos do ledger", () => {
    const pay = makeRecurring({ paid_parcels: [1] });
    const openPay = makeRecurring({
      id: "2",
      description: "Internet",
      value: 120,
      paid_parcels: [],
    });
    const balance = buildMonthCashBalance([pay, openPay], 2026, 7, {
      receita: 5000,
      despesa: 30,
    });

    expect(balance.parcelPay).toBe(220);
    expect(balance.openPay).toBe(120);
    expect(balance.extraDespesa).toBe(30);
    expect(balance.payTotal).toBe(250);
    expect(balance.receiveTotal).toBe(5000);
    expect(balance.net).toBe(4750);
  });

  it("conta parcela paga mesmo sem ledger no mês", () => {
    const pay = makeRecurring({ paid_parcels: [1] });
    const balance = buildMonthCashBalance([pay], 2026, 7, null);

    expect(balance.parcelPay).toBe(100);
    expect(balance.openPay).toBe(0);
    expect(balance.extraDespesa).toBe(0);
    expect(balance.payTotal).toBe(100);
  });

  it("soma lançamentos avulsos além das parcelas", () => {
    const pay = makeRecurring({ paid_parcels: [1] });
    const balance = buildMonthCashBalance([pay], 2026, 7, {
      receita: 0,
      despesa: 50,
    });

    expect(balance.parcelPay).toBe(100);
    expect(balance.extraDespesa).toBe(50);
    expect(balance.payTotal).toBe(150);
  });
});

describe("indexAvulsoLedgerByYm", () => {
  it("agrupa avulsos e ignora liquidações de parcela", () => {
    const map = indexAvulsoLedgerByYm([
      {
        id: 1,
        value: 80,
        description: "Mercado",
        transaction_at: "2026-07-10",
        class: {
          type: {
            nature: { name: "Despesa" },
          },
        },
      },
      {
        id: 2,
        value: 100,
        description: "Parcela",
        transaction_at: "2026-07-05",
        recurring_transaction_id: "rec-1",
        class: {
          type: {
            nature: { name: "Despesa" },
          },
        },
      },
      {
        id: 3,
        value: 3000,
        description: "Freela",
        transaction_at: "2026-07-01",
        class: {
          type: {
            nature: { name: "Receita" },
          },
        },
      },
    ]);

    expect(map["2026-07"]).toEqual({ receita: 3000, despesa: 80 });
  });
});

describe("buildBalanceSeriesWindow", () => {
  it("aplica ledger avulso nos totais quando não é openOnly", () => {
    const pay = makeRecurring();
    const series = buildBalanceSeriesWindow(
      [pay],
      { year: 2026, month: 7 },
      indexLedgerByYm([
        { year: 2026, month: 7, receita_total: 1000, despesa_total: 50 },
      ]),
      { past: 0, future: 0 }
    );
    // Parcela em aberto 100 + receita avulsa 1000 + despesa avulsa 50
    expect(series[0].receiveTotal).toBe(1000);
    expect(series[0].payTotal).toBe(150);
    expect(series[0].net).toBe(850);
  });
});

describe("ledgerTransactionsToLines", () => {
  it("ignora lançamentos gerados por parcela", () => {
    const lines = ledgerTransactionsToLines([
      {
        id: 1,
        value: 100,
        description: "Parcela aluguel",
        transaction_at: "2026-07-05",
        recurring_transaction_id: "rec-1",
        class: {
          type: {
            nature: { name: "Despesa" },
            exclude_from_spend: false,
          },
        },
      },
      {
        id: 2,
        value: 40,
        description: "Café",
        transaction_at: "2026-07-10",
        recurring_transaction_id: null,
        class: {
          type: {
            nature: { name: "Despesa" },
            exclude_from_spend: false,
          },
        },
      },
    ]);
    expect(lines.payLines).toHaveLength(1);
    expect(lines.payLines[0].description).toBe("Café");
  });
});

describe("buildPurchaseSimulation", () => {
  it("divide o total em parcelas mensais a partir do início", () => {
    const sim = buildPurchaseSimulation({
      total: 1200,
      installmentCount: 12,
      start: { year: 2026, month: 8 },
    });
    expect(sim).not.toBeNull();
    expect(sim!.installmentValue).toBe(100);
    expect(sim!.byYm["2026-08"]).toBe(100);
    expect(sim!.byYm["2027-07"]).toBe(100);
    expect(Object.keys(sim!.byYm)).toHaveLength(12);
    expect(simulationAmountForYm(sim, 2026, 7)).toBe(0);
  });

  it("ajusta a última parcela pelo arredondamento", () => {
    const sim = buildPurchaseSimulation({
      total: 1000,
      installmentCount: 3,
      start: { year: 2026, month: 1 },
    });
    expect(sim).not.toBeNull();
    const values = Object.values(sim!.byYm);
    expect(values.reduce((s, v) => s + v, 0)).toBeCloseTo(1000, 2);
    expect(sim!.byYm["2026-01"]).toBe(333.33);
    expect(sim!.byYm["2026-02"]).toBe(333.33);
    expect(sim!.byYm["2026-03"]).toBe(333.34);
  });

  it("estende o horizonte do gráfico para caber a simulação", () => {
    const sim = buildPurchaseSimulation({
      total: 6000,
      installmentCount: 18,
      start: { year: 2026, month: 7 },
    });
    expect(
      futureMonthsForSimulation({ year: 2026, month: 7 }, sim, 9, 23)
    ).toBe(17);
  });
});
