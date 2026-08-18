import { describe, expect, it } from "vitest";
import { evaluatePurchaseAgainstRemaining } from "@/domain/extension/budgetFit";
import {
  cashVsInstallmentHint,
  evaluateInstallmentAgainstRemaining,
  parseInstallmentOffer,
  buildInstallmentCalendar,
} from "@/domain/extension/installments";

describe("evaluatePurchaseAgainstRemaining", () => {
  it("marca dentro quando a compra cabe com folga", () => {
    const result = evaluatePurchaseAgainstRemaining(2000, 400);
    expect(result?.verdict).toBe("dentro");
    expect(result?.after).toBe(1600);
  });

  it("aperta quando a compra come a maior parte do restante", () => {
    const result = evaluatePurchaseAgainstRemaining(1000, 900);
    expect(result?.verdict).toBe("aperto");
  });

  it("marca fora quando passa do restante", () => {
    const result = evaluatePurchaseAgainstRemaining(200, 500);
    expect(result?.verdict).toBe("fora");
    expect(result?.after).toBe(-300);
  });
});

describe("parseInstallmentOffer", () => {
  it("lê o maior Nx sem juros no texto do Mercado Livre", () => {
    const offer = parseInstallmentOffer(
      "R$ 1.199,00  3x de R$ 399,67  12x R$ 99,92 sem juros  18x R$ 80,00"
    );
    expect(offer).toEqual({ count: 12, value: 99.92 });
  });

  it("não atribui sem juros da oferta seguinte ao Nx anterior", () => {
    const offer = parseInstallmentOffer(
      "3x de R$ 399,67  12x sem juros de R$ 99,92"
    );
    expect(offer).toEqual({ count: 12, value: 99.92 });
  });

  it("lê 12x sem juros de R$ no meio da frase", () => {
    const offer = parseInstallmentOffer(
      "Parcelado em 12x sem juros de R$ 99,92 no cartão"
    );
    expect(offer).toEqual({ count: 12, value: 99.92 });
  });

  it("cai no maior N quando não há sem juros", () => {
    const offer = parseInstallmentOffer("em 10x de R$ 50,00");
    expect(offer).toEqual({ count: 10, value: 50 });
  });
});

describe("evaluateInstallmentAgainstRemaining", () => {
  it("usa a parcela, não o total, para o mês", () => {
    const result = evaluateInstallmentAgainstRemaining(400, 1200, 12, null);
    expect(result?.installmentValue).toBe(100);
    expect(result?.fit.verdict).toBe("dentro");
    expect(result?.fromPage).toBe(false);
  });

  it("respeita a oferta da página quando o N coincide", () => {
    const result = evaluateInstallmentAgainstRemaining(200, 1200, 12, {
      count: 12,
      value: 110,
    });
    expect(result?.installmentValue).toBe(110);
    expect(result?.fromPage).toBe(true);
    expect(result?.fit.verdict).toBe("dentro");
    expect(result?.fit.headline).toBe("A 1ª parcela cabe neste mês");
  });

  it("diz que à vista não cabe e a 1ª parcela entra", () => {
    const cash = evaluatePurchaseAgainstRemaining(400, 1200);
    const installment = evaluateInstallmentAgainstRemaining(
      400,
      1200,
      12,
      null
    );
    expect(cash?.verdict).toBe("fora");
    expect(installment).not.toBeNull();
    expect(cashVsInstallmentHint(cash!, installment!)).toMatch(
      /À vista não cabe/
    );
  });
});

describe("buildInstallmentCalendar", () => {
  it("espalha as parcelas pelos meses a partir do início", () => {
    const rows = buildInstallmentCalendar(
      { year: 2026, month: 8 },
      1200,
      12,
      null
    );
    expect(rows).toHaveLength(12);
    expect(rows?.[0]).toMatchObject({
      year: 2026,
      month: 8,
      number: 1,
      value: 100,
    });
    expect(rows?.[11]).toMatchObject({
      year: 2027,
      month: 7,
      number: 12,
      value: 100,
    });
  });

  it("usa o valor da página em todos os meses quando o N coincide", () => {
    const rows = buildInstallmentCalendar(
      { year: 2026, month: 8 },
      1200,
      12,
      { count: 12, value: 110 }
    );
    expect(rows).toHaveLength(12);
    expect(rows?.every((row) => row.value === 110)).toBe(true);
  });

  it("ajusta o centavo na última parcela", () => {
    const rows = buildInstallmentCalendar(
      { year: 2026, month: 1 },
      1000,
      3,
      null
    );
    expect(rows?.map((row) => row.value)).toEqual([333.33, 333.33, 333.34]);
  });
});
