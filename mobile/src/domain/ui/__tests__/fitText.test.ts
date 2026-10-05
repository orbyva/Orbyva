import { describe, expect, it } from "vitest";

import { formatBRL } from "../../../lib/currency";
import { sharedValueSize, valueWidthEm } from "../fitText";
import { TypeScale } from "../typography";

describe("valueWidthEm", () => {
  it("soma o avanço medido de cada caractere (inclui o espaço sem quebra do Intl)", () => {
    expect(valueWidthEm(formatBRL(12345.67))).toBeCloseTo(6.51, 2);
    expect(valueWidthEm(formatBRL(-12345.67))).toBeCloseTo(7.0, 2);
  });

  it("caractere desconhecido conta como largo", () => {
    expect(valueWidthEm("W")).toBe(0.75);
  });
});

describe("sharedValueSize", () => {
  it("valor curto em card largo usa o tamanho cheio de `value`", () => {
    expect(sharedValueSize([formatBRL(10)], 300).fontSize).toBe(TypeScale.value.fontSize);
  });

  it("o valor mais largo do grupo decide o tamanho de todos", () => {
    const short = formatBRL(950);
    const long = formatBRL(-12345.67);
    const alone = sharedValueSize([short], 140);
    const group = sharedValueSize([short, long], 140);
    expect(group.fontSize).toBeLessThan(alone.fontSize);
    expect(sharedValueSize([long], 140)).toEqual(group);
  });

  it("o valor mais largo cabe na largura do card", () => {
    const values = [formatBRL(123456.78), formatBRL(-9876.5)];
    const width = 135;
    const { fontSize } = sharedValueSize(values, width);
    for (const v of values) expect(valueWidthEm(v) * fontSize).toBeLessThanOrEqual(width);
  });

  it("card de iPhone de 390 pt com valor de 5 dígitos fica acima do `heading` antigo (18)", () => {
    const width = (390 - 24 * 2 - 8) / 2 - 16 * 2;
    expect(sharedValueSize([formatBRL(12345.67)], width).fontSize).toBeGreaterThan(18);
  });

  it("não desce do mínimo legível e mantém a proporção de entrelinha", () => {
    const tiny = sharedValueSize([formatBRL(1234567890)], 60);
    expect(tiny.fontSize).toBe(16);
    expect(tiny.lineHeight).toBe(Math.round(16 * (38 / 28)));
  });

  it("grupo vazio não quebra", () => {
    expect(sharedValueSize([], 150).fontSize).toBe(TypeScale.value.fontSize);
  });
});
