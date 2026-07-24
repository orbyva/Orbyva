import { describe, expect, it } from "vitest";
import {
  buildMomTrends,
  formatMomTrend,
  previousYearMonth,
} from "@/domain/finance/insights";

describe("finance insights MoM", () => {
  it("previousYearMonth cruza o ano", () => {
    expect(previousYearMonth(2026, 1)).toEqual({ year: 2025, month: 12 });
    expect(previousYearMonth(2026, 7)).toEqual({ year: 2026, month: 6 });
  });

  it("formatMomTrend", () => {
    expect(formatMomTrend(110, 100, 6)).toBe("↑10% vs jun");
    expect(formatMomTrend(90, 100, 6)).toBe("↓10% vs jun");
    expect(formatMomTrend(100, 100, 6)).toBe("estável vs jun");
    expect(formatMomTrend(50, 0, 5)).toBe("novo vs mai");
    expect(formatMomTrend(0, null, 5)).toBeNull();
  });

  it("buildMomTrends", () => {
    const t = buildMomTrends(
      { receita: 2000, despesa: 1000 },
      { receita: 1000, despesa: 1200 },
      6
    );
    expect(t.receita).toBe("↑100% vs jun");
    expect(t.despesa).toBe("↓17% vs jun");
    expect(t.saldo).toBe("↑600% vs jun"); // 1000 vs -200
  });
});
