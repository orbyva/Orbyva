import { describe, expect, it } from "vitest";
import {
  formatBRL,
  formatDateBR,
  formatMoneyInput,
  moneyFromDigits,
  parseMoneyInput,
} from "@/lib/currency";

describe("formatBRL", () => {
  it("formata valores no padrão brasileiro", () => {
    expect(formatBRL(144.44)).toMatch(/R\$\s*144,44/);
    expect(formatBRL(1000)).toMatch(/R\$\s*1\.000,00/);
  });
});

describe("formatMoneyInput", () => {
  it("formata sem símbolo de moeda", () => {
    expect(formatMoneyInput(1234.56)).toBe("1.234,56");
    expect(formatMoneyInput(10)).toBe("10,00");
  });
});

describe("parseMoneyInput", () => {
  it("aceita vírgula decimal e ponto de milhar", () => {
    expect(parseMoneyInput("1.234,56")).toBe(1234.56);
    expect(parseMoneyInput("1234,56")).toBe(1234.56);
    expect(parseMoneyInput("10,5")).toBe(10.5);
  });

  it("aceita ponto decimal estilo en-US", () => {
    expect(parseMoneyInput("1234.56")).toBe(1234.56);
  });

  it("retorna null para vazio", () => {
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("   ")).toBeNull();
  });
});

describe("moneyFromDigits", () => {
  it("interpreta dígitos como centavos", () => {
    expect(moneyFromDigits("123456")).toBe(1234.56);
    expect(moneyFromDigits("1.234,56")).toBe(1234.56);
    expect(moneyFromDigits("")).toBeNull();
  });
});

describe("formatDateBR", () => {
  it("converte ISO para dd/mm/aaaa", () => {
    expect(formatDateBR("2026-07-03")).toBe("03/07/2026");
  });
});
