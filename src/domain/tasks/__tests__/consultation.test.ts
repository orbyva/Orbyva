import { describe, expect, it } from "vitest";
import { buildConsultationTitle } from "@/domain/tasks/consultation";
import { computeMissingOccurrences } from "@/domain/tasks/recurrence";
import type { RecurrenceRule } from "@/types/tasks";

/**
 * Domínio puro da consulta médica (feature 061): a composição do título (onde mora o especialista,
 * por decisão da feature) e a recorrência de uma série de consultas — que não tem código próprio,
 * usa a mesma engine das medicações, e é justamente isso que este teste fixa.
 */

describe("buildConsultationTitle", () => {
  it("junta especialidade e profissional com travessão", () => {
    expect(buildConsultationTitle("Cardiologista", "Dr. Silva")).toBe(
      "Cardiologista — Dr. Silva"
    );
  });

  it("sem profissional, fica só a especialidade — sem travessão solto", () => {
    expect(buildConsultationTitle("Cardiologista")).toBe("Cardiologista");
    expect(buildConsultationTitle("Cardiologista", "")).toBe("Cardiologista");
    expect(buildConsultationTitle("Cardiologista", null)).toBe("Cardiologista");
    expect(buildConsultationTitle("Cardiologista", "   ")).toBe("Cardiologista");
  });

  it("apara espaços dos dois lados", () => {
    expect(buildConsultationTitle("  Dermatologista ", "  Dra. Costa  ")).toBe(
      "Dermatologista — Dra. Costa"
    );
  });
});

describe("recorrência de uma série de consultas", () => {
  /** Retorno a cada 3 meses, agendado em 10/03/2026. */
  const rule: RecurrenceRule = { frequency: "monthly", interval: 3, time: "14:30" };

  it("gera as ocorrências nas datas esperadas até hoje", () => {
    expect(
      computeMissingOccurrences("2026-03-10", rule, [], "2026-10-01")
    ).toEqual(["2026-06-10", "2026-09-10"]);
  });

  it("não repete uma ocorrência já materializada", () => {
    expect(
      computeMissingOccurrences("2026-03-10", rule, ["2026-06-10"], "2026-10-01")
    ).toEqual(["2026-09-10"]);
  });

  it("não antecipa retorno que ainda não chegou", () => {
    expect(
      computeMissingOccurrences("2026-03-10", rule, [], "2026-05-31")
    ).toEqual([]);
  });

  it("respeita um fim de acompanhamento (until)", () => {
    expect(
      computeMissingOccurrences(
        "2026-03-10",
        { ...rule, until: "2026-07-01" },
        [],
        "2026-12-31"
      )
    ).toEqual(["2026-06-10"]);
  });

  it("consulta única (sem regra mensal) não gera ocorrência nenhuma", () => {
    // `interval: 0` é o que a engine já trata como "sem repetição" — o dialog de consulta única
    // grava `recurrence_rule: null`, que nem chega a passar por aqui.
    expect(
      computeMissingOccurrences("2026-03-10", { ...rule, interval: 0 }, [], "2026-12-31")
    ).toEqual([]);
  });
});
