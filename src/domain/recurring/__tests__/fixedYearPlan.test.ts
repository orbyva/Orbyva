import { describe, expect, it } from "vitest";
import {
  buildFixedYearPlan,
  countMonthsThroughYearEnd,
  isFixedRecurringPlan,
  yearEndIsoFor,
} from "@/domain/recurring";

describe("countMonthsThroughYearEnd", () => {
  it("de janeiro gera 12 meses", () => {
    expect(countMonthsThroughYearEnd("2026-01-15")).toBe(12);
  });

  it("de julho gera até dezembro (6 meses)", () => {
    expect(countMonthsThroughYearEnd("2026-07-31")).toBe(6);
  });

  it("de dezembro gera 1 mês", () => {
    expect(countMonthsThroughYearEnd("2026-12-01")).toBe(1);
  });
});

describe("buildFixedYearPlan", () => {
  it("monta contagem e validity no fim do ano", () => {
    expect(buildFixedYearPlan("2026-07-25")).toEqual({
      installment_count: 6,
      validity: "2026-12-31",
    });
    expect(yearEndIsoFor("2026-03-01")).toBe("2026-12-31");
  });
});

describe("isFixedRecurringPlan", () => {
  it("reconhece validity em 31/12", () => {
    expect(
      isFixedRecurringPlan({ validity: "2026-12-31", installment_count: 6 })
    ).toBe(true);
  });

  it("não marca parcelada Nx sem validity de fim de ano", () => {
    expect(
      isFixedRecurringPlan({ validity: null, installment_count: 6 })
    ).toBe(false);
  });

  it("reconhece horizonte legado 60", () => {
    expect(
      isFixedRecurringPlan({ validity: null, installment_count: 60 })
    ).toBe(true);
  });
});
