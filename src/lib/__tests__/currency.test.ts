import { describe, expect, it } from "vitest";
import { formatBRL, formatDateBR } from "@/lib/currency";

describe("formatBRL", () => {
  it("formata valores no padrão brasileiro", () => {
    expect(formatBRL(144.44)).toMatch(/R\$\s*144,44/);
    expect(formatBRL(1000)).toMatch(/R\$\s*1\.000,00/);
  });
});

describe("formatDateBR", () => {
  it("converte ISO para dd/mm/aaaa", () => {
    expect(formatDateBR("2026-07-03")).toBe("03/07/2026");
  });
});
