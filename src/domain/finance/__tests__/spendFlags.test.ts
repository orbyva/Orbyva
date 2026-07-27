import { describe, expect, it } from "vitest";
import {
  classExcludesFromSpend,
  countsAsMonthlySpend,
  isInvestmentNature,
  typeExcludesFromSpend,
} from "@/domain/finance/spendFlags";

describe("spendFlags", () => {
  it("detecta exclude_from_spend", () => {
    expect(typeExcludesFromSpend({ exclude_from_spend: true })).toBe(true);
    expect(typeExcludesFromSpend({ exclude_from_spend: false })).toBe(false);
    expect(typeExcludesFromSpend(null)).toBe(false);
  });

  it("reconhece natureza Investimento", () => {
    expect(isInvestmentNature("Investimento")).toBe(true);
    expect(isInvestmentNature("investimento")).toBe(true);
    expect(isInvestmentNature("Despesa")).toBe(false);
  });

  it("Investimento não conta no gasto do mês", () => {
    expect(countsAsMonthlySpend("Investimento", null)).toBe(false);
    expect(countsAsMonthlySpend("Receita", null)).toBe(false);
    expect(countsAsMonthlySpend("Despesa", null)).toBe(true);
    expect(
      countsAsMonthlySpend("Despesa", { exclude_from_spend: true })
    ).toBe(false);
  });

  it("propaga pela classe (flag ou natureza Investimento)", () => {
    expect(
      classExcludesFromSpend({
        type: {
          id: 1,
          name: "Poupança",
          nature: { id: 2, name: "Despesa" },
          hex_color: null,
          lucide_icon: null,
          exclude_from_spend: true,
        },
      })
    ).toBe(true);

    expect(
      classExcludesFromSpend({
        type: {
          id: 2,
          name: "Poupança",
          nature: { id: 3, name: "Investimento" },
          hex_color: null,
          lucide_icon: null,
          exclude_from_spend: false,
        },
      })
    ).toBe(true);
  });
});
