import { describe, expect, it } from "vitest";
import {
  buildFixedYearPlan,
  buildRenewedFixedSchedule,
  canRenewFixedPlan,
  countMonthsThroughYearEnd,
  isFixedRecurringPlan,
  resolveFixedRenewalRollback,
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
  it("mensal monta contagem e validity no fim do ano", () => {
    expect(buildFixedYearPlan("2026-07-25")).toEqual({
      installment_count: 6,
      validity: "2026-12-31",
    });
    expect(buildFixedYearPlan("2027-01-10", "Mensal")).toEqual({
      installment_count: 12,
      validity: "2027-12-31",
    });
    expect(yearEndIsoFor("2026-03-01")).toBe("2026-12-31");
  });

  it("anual gera 1 parcela no ano da data de início", () => {
    expect(buildFixedYearPlan("2026-07-25", "Anual")).toEqual({
      installment_count: 1,
      validity: "2026-12-31",
    });
    expect(buildFixedYearPlan("2027-03-01", "Anual")).toEqual({
      installment_count: 1,
      validity: "2027-12-31",
    });
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

describe("canRenewFixedPlan", () => {
  it("permite renovar quando tudo foi pago", () => {
    expect(
      canRenewFixedPlan(
        {
          validity: "2026-12-31",
          installment_count: 6,
          paid_parcels: [1, 2, 3, 4, 5, 6],
          installments: [
            { dueDate: "2026-07-05" },
            { dueDate: "2026-12-05" },
          ],
        },
        "2026-08-01"
      )
    ).toBe(true);
  });

  it("permite renovar quando o ano do plano já passou", () => {
    expect(
      canRenewFixedPlan(
        {
          validity: "2026-12-31",
          installment_count: 6,
          paid_parcels: [1],
          installments: [{ dueDate: "2026-12-05" }],
        },
        "2027-01-02"
      )
    ).toBe(true);
  });

  it("não renova plano em andamento", () => {
    expect(
      canRenewFixedPlan(
        {
          validity: "2026-12-31",
          installment_count: 6,
          paid_parcels: [1, 2],
          installments: [
            { dueDate: "2026-07-05" },
            { dueDate: "2026-08-05" },
            { dueDate: "2026-09-05" },
            { dueDate: "2026-10-05" },
            { dueDate: "2026-11-05" },
            { dueDate: "2026-12-05" },
          ],
        },
        "2026-08-01"
      )
    ).toBe(false);
  });
});

describe("buildRenewedFixedSchedule", () => {
  it("mensal estende do início original até dez do ano seguinte", () => {
    expect(
      buildRenewedFixedSchedule({
        frequency: "Mensal",
        validity: "2026-12-31",
        payment_start_date: "2026-07-01",
      })
    ).toEqual({
      payment_start_date: "2026-07-01",
      installment_count: 18,
      validity: "2027-12-31",
      year: 2027,
    });
  });

  it("anual mantém início e acrescenta o ano seguinte", () => {
    expect(
      buildRenewedFixedSchedule({
        frequency: "Anual",
        validity: "2026-12-31",
        payment_start_date: "2026-03-15",
      })
    ).toEqual({
      payment_start_date: "2026-03-15",
      installment_count: 2,
      validity: "2027-12-31",
      year: 2027,
    });
  });
});

describe("resolveFixedRenewalRollback", () => {
  it("ao desfazer mês anterior à renovação, remove o ano estendido", () => {
    // Jul/2026 → 6 parcelas; renovou até 2027 (18); desfaz parcela 5 (nov/2026)
    const result = resolveFixedRenewalRollback(
      {
        frequency: "Mensal",
        validity: "2027-12-31",
        payment_start_date: "2026-07-01",
        installment_count: 18,
      },
      5,
      [1, 2, 3, 4, 6]
    );

    expect(result).toEqual({
      payment_start_date: "2026-07-01",
      installment_count: 6,
      validity: "2026-12-31",
      paid_parcels: [1, 2, 3, 4, 6],
    });
  });

  it("não reverte se o desfazer for no próprio ano renovado", () => {
    expect(
      resolveFixedRenewalRollback(
        {
          frequency: "Mensal",
          validity: "2027-12-31",
          payment_start_date: "2026-07-01",
          installment_count: 18,
        },
        8, // fev/2027
        [1, 2, 3, 4, 5, 6, 7]
      )
    ).toBeNull();
  });

  it("não reverte se ainda houver pago em ano posterior", () => {
    expect(
      resolveFixedRenewalRollback(
        {
          frequency: "Mensal",
          validity: "2027-12-31",
          payment_start_date: "2026-07-01",
          installment_count: 18,
        },
        5,
        [1, 2, 3, 4, 6, 8] // 8 = fev/2027 ainda pago
      )
    ).toBeNull();
  });
});
