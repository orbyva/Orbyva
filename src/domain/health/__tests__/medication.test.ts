import { describe, expect, it } from "vitest";
import {
  computeMissingDoses,
  formatDoseTitle,
  formatPosology,
  medicationTimes,
  normalizeTime,
} from "@/domain/health/medication";
import type { Medication } from "@/types/health";

function medication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: "med-1",
    name: "Losartana",
    times: ["08:00"],
    interval_days: 1,
    started_on: "2026-08-10",
    ended_on: null,
    active: true,
    ...overrides,
  };
}

describe("normalizeTime", () => {
  it("achata HH:MM:SS do Postgres e HH:MM do input no mesmo formato", () => {
    expect(normalizeTime("08:00:00")).toBe("08:00");
    expect(normalizeTime("08:00")).toBe("08:00");
    expect(normalizeTime("8:00")).toBe("08:00");
    expect(normalizeTime("20:00:00.000")).toBe("20:00");
  });

  it("devolve null pro que não é horário", () => {
    expect(normalizeTime(null)).toBeNull();
    expect(normalizeTime("")).toBeNull();
    expect(normalizeTime("manhã")).toBeNull();
  });
});

describe("medicationTimes", () => {
  it("normaliza, deduplica e ordena", () => {
    expect(medicationTimes({ times: ["20:00:00", "08:00", "20:00"] })).toEqual([
      "08:00",
      "20:00",
    ]);
  });
});

describe("computeMissingDoses", () => {
  it("gera uma dose por (data × horário) — múltiplos horários por dia", () => {
    const missing = computeMissingDoses(
      medication({ times: ["08:00", "20:00"], started_on: "2026-08-15" }),
      [],
      "2026-08-17"
    );

    expect(missing).toEqual([
      { date: "2026-08-15", time: "08:00" },
      { date: "2026-08-15", time: "20:00" },
      { date: "2026-08-16", time: "08:00" },
      { date: "2026-08-16", time: "20:00" },
      { date: "2026-08-17", time: "08:00" },
      { date: "2026-08-17", time: "20:00" },
    ]);
  });

  it("respeita interval_days > 1 (a cada 2 dias, a partir do início)", () => {
    const missing = computeMissingDoses(
      medication({ interval_days: 2, started_on: "2026-08-11" }),
      [],
      "2026-08-16"
    );

    expect(missing.map((slot) => slot.date)).toEqual([
      "2026-08-11",
      "2026-08-13",
      "2026-08-15",
    ]);
  });

  it("para em ended_on no passado, sem gerar nada depois do fim do tratamento", () => {
    const missing = computeMissingDoses(
      medication({ started_on: "2026-08-10", ended_on: "2026-08-12" }),
      [],
      "2026-08-20"
    );

    expect(missing.map((slot) => slot.date)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
    ]);
  });

  it("tratamento inativo não gera dose nenhuma, nem retroativa", () => {
    expect(
      computeMissingDoses(medication({ active: false }), [], "2026-08-20")
    ).toEqual([]);
  });

  it("não repete dose já materializada, mesmo com dose_time em HH:MM:SS", () => {
    const missing = computeMissingDoses(
      medication({ times: ["08:00", "20:00"], started_on: "2026-08-16" }),
      [
        { due_date: "2026-08-16", dose_time: "08:00:00" },
        { due_date: "2026-08-16", dose_time: "20:00:00" },
        { due_date: "2026-08-17", dose_time: "08:00:00" },
      ],
      "2026-08-17"
    );

    // Só a dose das 20:00 de hoje ficou faltando — é o guard contra dose duplicada no calendário.
    expect(missing).toEqual([{ date: "2026-08-17", time: "20:00" }]);
  });

  it("rodar de novo com o resultado já inserido devolve lista vazia (idempotente)", () => {
    const med = medication({ times: ["08:00", "20:00"], started_on: "2026-08-16" });
    const first = computeMissingDoses(med, [], "2026-08-17");
    const materialized = first.map((slot) => ({
      due_date: slot.date,
      dose_time: `${slot.time}:00`,
    }));

    expect(computeMissingDoses(med, materialized, "2026-08-17")).toEqual([]);
  });

  it("tratamento que ainda não começou não gera dose", () => {
    expect(
      computeMissingDoses(medication({ started_on: "2026-09-01" }), [], "2026-08-17")
    ).toEqual([]);
  });

  it("tratamento sem horário nenhum não gera dose", () => {
    expect(computeMissingDoses(medication({ times: [] }), [], "2026-08-17")).toEqual([]);
  });
});

describe("formatDoseTitle", () => {
  it("junta nome, quantidade e unidade", () => {
    expect(
      formatDoseTitle({ name: "Losartana", dose_amount: 2, dose_unit: "comprimidos" })
    ).toBe("Losartana 2 comprimidos");
  });

  it("sem posologia devolve só o nome (o caso das medicações migradas da 049)", () => {
    expect(formatDoseTitle({ name: "Losartana", dose_amount: null, dose_unit: null })).toBe(
      "Losartana"
    );
  });

  it("aceita quantidade sem unidade e unidade sem quantidade", () => {
    expect(formatDoseTitle({ name: "Vitamina D", dose_amount: 2, dose_unit: null })).toBe(
      "Vitamina D 2"
    );
    expect(formatDoseTitle({ name: "Insulina", dose_amount: null, dose_unit: "UI" })).toBe(
      "Insulina UI"
    );
  });

  it("não inventa casa decimal", () => {
    expect(
      formatDoseTitle({ name: "Dipirona", dose_amount: 500, dose_unit: "mg" })
    ).toBe("Dipirona 500 mg");
    expect(
      formatDoseTitle({ name: "Dipirona", dose_amount: 0.5, dose_unit: "mg" })
    ).toBe("Dipirona 0,5 mg");
  });
});

describe("formatPosology", () => {
  it("resume posologia, horários e cadência numa linha", () => {
    expect(
      formatPosology(
        medication({
          dose_amount: 2,
          dose_unit: "comprimidos",
          times: ["08:00", "20:00"],
        })
      )
    ).toBe("2 comprimidos · 08:00, 20:00 · todos os dias");
  });

  it("cadência maior que um dia aparece explícita", () => {
    expect(formatPosology(medication({ interval_days: 3 }))).toBe(
      "08:00 · a cada 3 dias"
    );
  });
});
