import { describe, expect, it } from "vitest";
import {
  getTotalFromInstallments,
  splitInstallmentValue,
} from "@/domain/recurring";

describe("splitInstallmentValue", () => {
  it("divide o valor total pelo número de parcelas", () => {
    expect(splitInstallmentValue(1200, 12)).toBe(100);
  });

  it("arredonda para duas casas decimais", () => {
    expect(splitInstallmentValue(1000, 3)).toBe(333.33);
  });
});

describe("getTotalFromInstallments", () => {
  it("reconstrói o valor total a partir da parcela", () => {
    expect(getTotalFromInstallments(100, 12)).toBe(1200);
  });
});
