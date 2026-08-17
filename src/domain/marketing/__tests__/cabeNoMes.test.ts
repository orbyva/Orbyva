import { describe, expect, it } from "vitest";
import {
  cabeNoMesShareText,
  evaluateCabeNoMes,
} from "@/domain/marketing/cabeNoMes";

const AUG = new Date("2026-08-15T12:00:00-03:00");

describe("evaluateCabeNoMes", () => {
  it("pede renda positiva", () => {
    expect(
      evaluateCabeNoMes({ income: 0, bills: 100, purchase: 0 }, AUG)
    ).toBeNull();
    expect(
      evaluateCabeNoMes({ income: -10, bills: 0, purchase: 0 }, AUG)
    ).toBeNull();
  });

  it("mostra o restante quando a compra cabe com folga", () => {
    const result = evaluateCabeNoMes(
      { income: 5000, bills: 2000, purchase: 800 },
      AUG
    );
    expect(result?.verdict).toBe("cabe");
    expect(result?.afterBills).toBe(3000);
    expect(result?.remaining).toBe(2200);
    expect(result?.headline).toMatch(/R\$\s*2\.200/);
    expect(result?.headline).toMatch(/agosto/i);
  });

  it("aperta quando sobra pouco da renda", () => {
    const result = evaluateCabeNoMes(
      { income: 4000, bills: 3700, purchase: 0 },
      AUG
    );
    expect(result?.verdict).toBe("aperto");
    expect(result?.remaining).toBe(300);
  });

  it("aperta quando a compra come a maior parte da folga", () => {
    const result = evaluateCabeNoMes(
      { income: 4000, bills: 2000, purchase: 1700 },
      AUG
    );
    expect(result?.verdict).toBe("aperto");
    expect(result?.remaining).toBe(300);
  });

  it("não cabe quando a compra passa do restante", () => {
    const result = evaluateCabeNoMes(
      { income: 3000, bills: 2000, purchase: 1500 },
      AUG
    );
    expect(result?.verdict).toBe("nao_cabe");
    expect(result?.remaining).toBe(-500);
    expect(result?.headline).toMatch(/não cabe/i);
  });

  it("não cabe quando as contas passam da renda", () => {
    const result = evaluateCabeNoMes(
      { income: 2000, bills: 2500, purchase: 0 },
      AUG
    );
    expect(result?.verdict).toBe("nao_cabe");
    expect(result?.headline).toMatch(/passam da renda/i);
  });

  it("monta texto para compartilhar", () => {
    const result = evaluateCabeNoMes(
      { income: 5000, bills: 2000, purchase: 0 },
      AUG
    );
    expect(result).not.toBeNull();
    const text = cabeNoMesShareText(result!);
    expect(text).toContain("Quanto ainda cabe no mês");
    expect(text).toContain("orbyva.app/quanto-ainda-cabe");
  });
});
