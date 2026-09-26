import { describe, expect, it } from "vitest";
import {
  buildConsultationTitle,
  splitConsultationTitle,
} from "@/domain/tasks/consultation";
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

describe("splitConsultationTitle", () => {
  it("separa especialidade e profissional", () => {
    expect(splitConsultationTitle("Cardiologista — Dr. Silva")).toEqual({
      specialty: "Cardiologista",
      professional: "Dr. Silva",
    });
  });

  it("sem travessão, o título inteiro é a especialidade", () => {
    expect(splitConsultationTitle("Cardiologista")).toEqual({
      specialty: "Cardiologista",
      professional: "",
    });
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

/**
 * Recorrência semanal (pedido de 2026-08-23). Continua sem código de domínio próprio — o atalho só
 * passou a montar `frequency: "weekly"` —, então o que estes casos fixam é o contrato do qual a
 * consulta semanal depende: o ramo simples (mesmo dia da semana da consulta, a cada N semanas), o
 * ramo com `weekdays` (uma série só para "seg, qua e sex") e o corte por `until`.
 */
describe("recorrência de uma série semanal de consultas", () => {
  /** Fisioterapia toda terça — 03/03/2026 é terça-feira. */
  const rule: RecurrenceRule = { frequency: "weekly", interval: 1, time: "07:30" };

  it("toda semana: uma ocorrência por terça até hoje", () => {
    expect(computeMissingOccurrences("2026-03-03", rule, [], "2026-03-31")).toEqual([
      "2026-03-10",
      "2026-03-17",
      "2026-03-24",
      "2026-03-31",
    ]);
  });

  it("a cada 2 semanas pula a semana do meio", () => {
    expect(
      computeMissingOccurrences("2026-03-03", { ...rule, interval: 2 }, [], "2026-03-31")
    ).toEqual(["2026-03-17", "2026-03-31"]);
  });

  it("com dias da semana marcados, gera as três sessões de cada semana numa série só", () => {
    // seg/qua/sex a partir de uma terça: a segunda da própria semana da consulta fica de fora
    // (é anterior à data de início), as semanas seguintes vêm completas.
    expect(
      computeMissingOccurrences(
        "2026-03-03",
        { ...rule, weekdays: [1, 3, 5] },
        [],
        "2026-03-20"
      )
    ).toEqual([
      "2026-03-04",
      "2026-03-06",
      "2026-03-09",
      "2026-03-11",
      "2026-03-13",
      "2026-03-16",
      "2026-03-18",
      "2026-03-20",
    ]);
  });

  it("o término (until) corta a série na data certa, com ou sem dias marcados", () => {
    expect(
      computeMissingOccurrences("2026-03-03", { ...rule, until: "2026-03-17" }, [], "2026-04-14")
    ).toEqual(["2026-03-10", "2026-03-17"]);

    expect(
      computeMissingOccurrences(
        "2026-03-03",
        { ...rule, weekdays: [1, 3, 5], until: "2026-03-11" },
        [],
        "2026-03-20"
      )
    ).toEqual(["2026-03-04", "2026-03-06", "2026-03-09", "2026-03-11"]);
  });

  it("sessão já materializada não é regerada", () => {
    expect(
      computeMissingOccurrences("2026-03-03", rule, ["2026-03-17"], "2026-03-31")
    ).toEqual(["2026-03-10", "2026-03-24", "2026-03-31"]);

    expect(
      computeMissingOccurrences(
        "2026-03-03",
        { ...rule, weekdays: [1, 3, 5] },
        ["2026-03-04", "2026-03-09"],
        "2026-03-13"
      )
    ).toEqual(["2026-03-06", "2026-03-11", "2026-03-13"]);
  });
});
