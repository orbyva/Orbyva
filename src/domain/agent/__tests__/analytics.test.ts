import { describe, expect, it } from "vitest";
import {
  aggregateSpendingByCategory,
  buildMonthlySummary,
  calculateCategoryTrends,
  detectUnusualExpenses,
  generateInsightsFromData,
} from "../analytics";
import type { TransactionRow } from "../types";

const sampleTransactions: TransactionRow[] = [
  {
    id: 1,
    value: 100,
    description: "Mercado",
    transaction_at: "2026-07-01",
    class_id: 1,
    class: {
      name: "Supermercado",
      type: { name: "Alimentação", nature: { name: "Despesa" } },
    },
  },
  {
    id: 2,
    value: 500,
    description: "Restaurante",
    transaction_at: "2026-07-02",
    class_id: 2,
    class: {
      name: "Restaurante",
      type: { name: "Alimentação", nature: { name: "Despesa" } },
    },
  },
  {
    id: 3,
    value: 3500,
    description: "Salário",
    transaction_at: "2026-07-05",
    class_id: 3,
    class: {
      name: "Salário",
      type: { name: "Renda", nature: { name: "Receita" } },
    },
  },
];

describe("buildMonthlySummary", () => {
  it("calculates balance from income and expense", () => {
    const summary = buildMonthlySummary(2026, 7, 3500, 600);
    expect(summary.balance).toBe(2900);
  });
});

describe("aggregateSpendingByCategory", () => {
  it("groups transactions by category", () => {
    const result = aggregateSpendingByCategory(sampleTransactions);
    expect(result).toHaveLength(3);
    expect(result[0].total).toBe(3500);
  });
});

describe("calculateCategoryTrends", () => {
  it("detects increase between months", () => {
    const current = sampleTransactions.filter((tx) => tx.id !== 3);
    const previous = [
      {
        ...sampleTransactions[0],
        id: 10,
        value: 50,
      },
    ];

    const trends = calculateCategoryTrends(current, previous);
    const food = trends.find((t) => t.category === "Alimentação");
    expect(food).toBeDefined();
    expect(food!.changePercent).toBeGreaterThan(0);
  });
});

describe("detectUnusualExpenses", () => {
  it("flags expenses above category average", () => {
    const expenses: TransactionRow[] = [
      {
        id: 1,
        value: 100,
        description: "Mercado",
        transaction_at: "2026-07-01",
        class_id: 1,
        class: {
          name: "Supermercado",
          type: { name: "Alimentação", nature: { name: "Despesa" } },
        },
      },
      {
        id: 2,
        value: 120,
        description: "Padaria",
        transaction_at: "2026-07-02",
        class_id: 2,
        class: {
          name: "Padaria",
          type: { name: "Alimentação", nature: { name: "Despesa" } },
        },
      },
      {
        id: 3,
        value: 500,
        description: "Restaurante",
        transaction_at: "2026-07-03",
        class_id: 3,
        class: {
          name: "Restaurante",
          type: { name: "Alimentação", nature: { name: "Despesa" } },
        },
      },
    ];

    const unusual = detectUnusualExpenses(expenses);
    expect(unusual.some((item) => item.id === 3)).toBe(true);
  });
});

describe("generateInsightsFromData", () => {
  it("returns budget and trend insights", () => {
    const insights = generateInsightsFromData({
      currentSummary: buildMonthlySummary(2026, 7, 3500, 600),
      previousSummary: buildMonthlySummary(2026, 6, 3500, 400),
      trends: [
        {
          category: "Alimentação",
          currentMonth: 600,
          previousMonth: 400,
          changePercent: 50,
        },
      ],
      budgetItems: [
        {
          typeName: "Alimentação",
          className: null,
          planned: 500,
          spent: 600,
          remaining: -100,
          percentageUsed: 120,
          status: "ESTOUROU",
        },
      ],
      unusualExpenses: [],
      recurringCount: 2,
    });

    expect(insights.length).toBeGreaterThan(0);
    expect(insights.some((i) => i.includes("Alimentação"))).toBe(true);
  });
});
