import { describe, expect, it } from "vitest";
import {
  bmiCategory,
  computeBmi,
  deltaSincePrevious,
  latestByType,
} from "@/domain/health/metrics";
import type { HealthMetric, MetricType } from "@/types/health";

/**
 * Domínio puro das métricas corporais (feature 063). É a única prova automatizada de que o IMC, a
 * última medição por tipo e a variação estão certos — a skill `next` proíbe conferir no navegador,
 * e RLS/insert se verificam no harness em Postgres (`supabase/tests/health_metric_reminder/`), não
 * aqui.
 */

let seq = 0;
function metric(
  type: MetricType,
  value: number,
  recorded_date: string,
  created_at?: string
): HealthMetric {
  seq += 1;
  return {
    id: `m${seq}`,
    metric_type: type,
    value,
    recorded_date,
    created_at: created_at ?? `${recorded_date}T10:00:00Z`,
  };
}

describe("computeBmi", () => {
  it("calcula o IMC a partir de peso em kg e altura em cm", () => {
    // 78.4 / 1.76² = 25.30… → 25.3
    expect(computeBmi(78.4, 176)).toBe(25.3);
    expect(computeBmi(60, 170)).toBe(20.8);
  });

  it("sem altura registrada não há IMC — devolve null em vez de chutar", () => {
    expect(computeBmi(78.4, null)).toBeNull();
    expect(computeBmi(78.4, undefined)).toBeNull();
  });

  it("sem peso também não há IMC", () => {
    expect(computeBmi(null, 176)).toBeNull();
    expect(computeBmi(undefined, 176)).toBeNull();
  });

  it("valor inválido (zero, negativo, NaN) não vira Infinity nem NaN na tela", () => {
    expect(computeBmi(78.4, 0)).toBeNull();
    expect(computeBmi(0, 176)).toBeNull();
    expect(computeBmi(-5, 176)).toBeNull();
    expect(computeBmi(78.4, Number.NaN)).toBeNull();
  });
});

describe("bmiCategory", () => {
  it("classifica pelas faixas da OMS, e null sem IMC", () => {
    expect(bmiCategory(null)).toBeNull();
    expect(bmiCategory(17)).toBe("Abaixo do peso");
    expect(bmiCategory(22)).toBe("Peso normal");
    expect(bmiCategory(27)).toBe("Sobrepeso");
    expect(bmiCategory(31)).toBe("Obesidade");
  });
});

describe("latestByType", () => {
  it("pega a medição mais recente de cada tipo, com a lista fora de ordem", () => {
    const metrics = [
      metric("weight", 78.4, "2026-08-10"),
      metric("height", 176, "2026-01-05"),
      metric("weight", 77.9, "2026-08-17"),
      metric("waist", 84, "2026-07-01"),
    ];

    const latest = latestByType(metrics);
    expect(latest.weight?.value).toBe(77.9);
    expect(latest.height?.value).toBe(176);
    expect(latest.waist?.value).toBe(84);
    // Tipo sem nenhuma medição fica undefined — o card não aparece.
    expect(latest.hip).toBeUndefined();
    expect(latest.chest).toBeUndefined();
    expect(latest.arm).toBeUndefined();
  });

  it("duas medições no mesmo dia: vale a registrada por último", () => {
    const metrics = [
      metric("weight", 79, "2026-08-17", "2026-08-17T07:00:00Z"),
      metric("weight", 78.2, "2026-08-17", "2026-08-17T21:00:00Z"),
    ];

    expect(latestByType(metrics).weight?.value).toBe(78.2);
  });

  it("lista vazia devolve todos os tipos indefinidos", () => {
    const latest = latestByType([]);
    expect(Object.values(latest).every((value) => value === undefined)).toBe(true);
  });
});

describe("deltaSincePrevious", () => {
  it("compara a última com a anterior do mesmo tipo (negativo = emagreceu)", () => {
    const metrics = [
      metric("weight", 78.4, "2026-08-10"),
      metric("weight", 77.9, "2026-08-17"),
    ];

    expect(deltaSincePrevious(metrics, "weight")).toBe(-0.5);
  });

  it("positivo quando subiu, e arredondado a duas casas (sem lixo de ponto flutuante)", () => {
    const metrics = [
      metric("weight", 77.9, "2026-08-10"),
      metric("weight", 78.4, "2026-08-17"),
    ];

    expect(deltaSincePrevious(metrics, "weight")).toBe(0.5);
  });

  it("com uma única medição não há variação — null, não zero", () => {
    expect(deltaSincePrevious([metric("weight", 78.4, "2026-08-17")], "weight")).toBeNull();
  });

  it("sem nenhuma medição do tipo, null", () => {
    expect(deltaSincePrevious([metric("weight", 78.4, "2026-08-17")], "waist")).toBeNull();
  });

  it("não mistura tipos: a variação da cintura ignora o peso", () => {
    const metrics = [
      metric("weight", 78.4, "2026-08-10"),
      metric("weight", 70, "2026-08-17"),
      metric("waist", 84, "2026-06-01"),
      metric("waist", 82, "2026-08-01"),
    ];

    expect(deltaSincePrevious(metrics, "waist")).toBe(-2);
    expect(deltaSincePrevious(metrics, "weight")).toBe(-8.4);
  });

  it("usa a ordem por data, não a ordem da lista", () => {
    const metrics = [
      metric("weight", 77.9, "2026-08-17"),
      metric("weight", 78.4, "2026-08-10"),
      metric("weight", 80, "2026-07-01"),
    ];

    expect(deltaSincePrevious(metrics, "weight")).toBe(-0.5);
  });
});
