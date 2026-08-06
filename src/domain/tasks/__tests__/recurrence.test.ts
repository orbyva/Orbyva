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
});
