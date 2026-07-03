import { describe, expect, it } from "vitest";
import {
  calculateInstallments,
  getInstallmentDueDate,
  resolvePaymentStartDate,
} from "@/domain/recurring";

describe("getInstallmentDueDate", () => {
  it("calcula vencimento no dia informado", () => {
    const date = getInstallmentDueDate("2026-01-15", 6, 1);
    expect(date.getDate()).toBe(6);
    expect(date.getMonth()).toBe(0);
  });

  it("ajusta dia para o último do mês quando necessário", () => {
    const date = getInstallmentDueDate("2026-01-15", 31, 2);
    expect(date.getDate()).toBe(28);
    expect(date.getMonth()).toBe(1);
  });
});

describe("calculateInstallments", () => {
  it("gera parcelas com dia e quantidade", () => {
    const result = calculateInstallments("2026-03-01", 10, 3, null);
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result).toHaveLength(3);
      expect(result[0].number).toBe(1);
      expect(result[2].number).toBe(3);
    }
  });
});

describe("resolvePaymentStartDate", () => {
  it("prioriza payment_start_date", () => {
    expect(
      resolvePaymentStartDate({
        payment_start_date: "2026-05-01",
        created_at: "2026-01-01T00:00:00Z",
      })
    ).toBe("2026-05-01");
  });

  it("usa created_at como fallback", () => {
    expect(
      resolvePaymentStartDate({
        payment_start_date: null,
        created_at: "2026-01-15T00:00:00Z",
      })
    ).toBe("2026-01-15");
  });
});
