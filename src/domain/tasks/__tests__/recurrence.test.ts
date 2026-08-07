import { describe, expect, it } from "vitest";
import { computeMissingOccurrences } from "@/domain/tasks/recurrence";

describe("computeMissingOccurrences", () => {
  it("gera ocorrências diárias faltantes até hoje", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 1 },
      [],
      "2026-08-04"
    );
    expect(result).toEqual(["2026-08-02", "2026-08-03", "2026-08-04"]);
  });

  it("não gera ocorrências além de hoje", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 1 },
      [],
      "2026-08-01"
    );
    expect(result).toEqual([]);
  });

  it("pula datas já existentes", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 1 },
      ["2026-08-02"],
      "2026-08-03"
    );
    expect(result).toEqual(["2026-08-03"]);
  });

  it("respeita intervalo semanal", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "weekly", interval: 1 },
      [],
      "2026-08-20"
    );
    expect(result).toEqual(["2026-08-08", "2026-08-15"]);
  });

  it("respeita intervalo mensal", () => {
    const result = computeMissingOccurrences(
      "2026-01-31",
      { frequency: "monthly", interval: 1 },
      [],
      "2026-04-01"
    );
    expect(result).toEqual(["2026-03-03"]);
  });

  it("para no limite `until`", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 1, until: "2026-08-02" },
      [],
      "2026-08-10"
    );
    expect(result).toEqual(["2026-08-02"]);
  });

  it("rejeita interval zero", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 0 },
      [],
      "2026-08-10"
    );
    expect(result).toEqual([]);
  });

  it("rejeita interval negativo", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: -1 },
      [],
      "2026-08-10"
    );
    expect(result).toEqual([]);
  });

  it("gera ocorrências semanais em dias da semana específicos (terça e quinta)", () => {
    // 2026-08-01 é sábado; terça=2, quinta=4
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "weekly", interval: 1, weekdays: [2, 4] },
      [],
      "2026-08-20"
    );
    expect(result).toEqual([
      "2026-08-04",
      "2026-08-06",
      "2026-08-11",
      "2026-08-13",
      "2026-08-18",
      "2026-08-20",
    ]);
  });

  it("respeita intervalo de N semanas com dias da semana específicos", () => {
    // 2026-08-04 é terça; a cada 2 semanas, só terça
    const result = computeMissingOccurrences(
      "2026-08-04",
      { frequency: "weekly", interval: 2, weekdays: [2] },
      [],
      "2026-09-01"
    );
    expect(result).toEqual(["2026-08-18", "2026-09-01"]);
  });

  it("sem weekdays, mantém o comportamento semanal antigo (regressão)", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "weekly", interval: 1, weekdays: [] },
      [],
      "2026-08-20"
    );
    expect(result).toEqual(["2026-08-08", "2026-08-15"]);
  });

  it("pula datas de dias da semana já existentes", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "weekly", interval: 1, weekdays: [2, 4] },
      ["2026-08-04"],
      "2026-08-06"
    );
    expect(result).toEqual(["2026-08-06"]);
  });

  it("gera ocorrências anuais", () => {
    const result = computeMissingOccurrences(
      "2024-08-01",
      { frequency: "yearly", interval: 1 },
      [],
      "2027-08-01"
    );
    expect(result).toEqual(["2025-08-01", "2026-08-01", "2027-08-01"]);
  });

  it("mensal no enésimo dia da semana (terceira terça-feira)", () => {
    // 2026-08-18 é a 3ª terça-feira de agosto
    const result = computeMissingOccurrences(
      "2026-08-18",
      { frequency: "monthly", interval: 1, monthlyMode: "weekday" },
      [],
      "2026-11-20"
    );
    expect(result).toEqual(["2026-09-15", "2026-10-20", "2026-11-17"]);
  });

  it("mensal no enésimo dia da semana respeita intervalo de N meses", () => {
    const result = computeMissingOccurrences(
      "2026-08-18",
      { frequency: "monthly", interval: 2, monthlyMode: "weekday" },
      [],
      "2027-02-01"
    );
    expect(result).toEqual(["2026-10-20", "2026-12-15"]);
  });

  it("mensal no último dia da semana do mês", () => {
    // 2026-08-25 é a última terça-feira de agosto (2026-09-01 já é setembro)
    const result = computeMissingOccurrences(
      "2026-08-25",
      { frequency: "monthly", interval: 1, monthlyMode: "weekday" },
      [],
      "2026-11-30"
    );
    expect(result).toEqual(["2026-09-29", "2026-10-27", "2026-11-24"]);
  });

  it("mensal por dia do mês continua sendo o padrão sem monthlyMode (regressão)", () => {
    const result = computeMissingOccurrences(
      "2026-01-31",
      { frequency: "monthly", interval: 1 },
      [],
      "2026-04-01"
    );
    expect(result).toEqual(["2026-03-03"]);
  });

  it("termina depois de N ocorrências (count)", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 1, count: 3 },
      [],
      "2026-08-10"
    );
    // origem (2026-08-01) já conta como a 1ª; só faltam 2 novas
    expect(result).toEqual(["2026-08-02", "2026-08-03"]);
  });

  it("count considera ocorrências já materializadas", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 1, count: 3 },
      ["2026-08-02"],
      "2026-08-10"
    );
    expect(result).toEqual(["2026-08-03"]);
  });

  it("count zero ou nulo não limita (comportamento normal)", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 1, count: null },
      [],
      "2026-08-03"
    );
    expect(result).toEqual(["2026-08-02", "2026-08-03"]);
  });
});
