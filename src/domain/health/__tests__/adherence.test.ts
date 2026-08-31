import { describe, expect, it } from "vitest";
import { computeAdherence, formatRate } from "@/domain/health/adherence";
import type { Task } from "@/types/tasks";

/** Uma dose materializada, como `materializeMedicationDoses` a grava. */
function dose(overrides: Partial<Task> = {}): Task {
  return {
    id: `dose-${Math.random()}`,
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Losartana",
    status: "todo",
    tag_ids: [],
    due_date: "2026-08-16",
    due_time: "08:00",
    dose_time: "08:00",
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    is_medication: true,
    medication_id: "med-1",
    completed_at: null,
    ...overrides,
  };
}

const NOW = new Date(2026, 7, 17, 12, 0); // 17/08/2026 12:00 local

describe("computeAdherence", () => {
  it("lista vazia devolve tudo zerado, sem dividir por zero", () => {
    expect(computeAdherence([], NOW)).toEqual({
      total: 0,
      taken: 0,
      onTime: 0,
      late: 0,
      missed: 0,
      takenRate: 0,
      onTimeRate: 0,
    });
  });

  it("dose tomada dentro da margem conta como no horário", () => {
    const result = computeAdherence(
      [
        dose({
          due_date: "2026-08-16",
          status: "done",
          // 20 min depois do agendado: dentro da tolerância de 60 min da 049.
          completed_at: new Date(2026, 7, 16, 8, 20).toISOString(),
        }),
      ],
      NOW
    );

    expect(result).toMatchObject({ total: 1, taken: 1, onTime: 1, late: 0, missed: 0 });
    expect(result.takenRate).toBe(1);
    expect(result.onTimeRate).toBe(1);
  });

  it("dose tomada com mais de 60 min de atraso conta como atrasada, mas ainda como tomada", () => {
    const result = computeAdherence(
      [
        dose({
          due_date: "2026-08-16",
          status: "done",
          completed_at: new Date(2026, 7, 16, 11, 30).toISOString(),
        }),
      ],
      NOW
    );

    expect(result).toMatchObject({ total: 1, taken: 1, onTime: 0, late: 1, missed: 0 });
    expect(result.takenRate).toBe(1);
    // A métrica que separa "tomou" de "tomou na hora" — é o ponto de ter as duas.
    expect(result.onTimeRate).toBe(0);
  });

  it("dose vencida e não tomada entra como perdida", () => {
    const result = computeAdherence([dose({ due_date: "2026-08-16" })], NOW);

    expect(result).toMatchObject({ total: 1, taken: 0, onTime: 0, late: 0, missed: 1 });
    expect(result.takenRate).toBe(0);
  });

  it("dose ainda não vencida não entra na conta (nem como perdida)", () => {
    const result = computeAdherence(
      [dose({ due_date: "2026-08-17", due_time: "20:00", dose_time: "20:00" })],
      NOW
    );

    expect(result).toMatchObject({ total: 0, taken: 0, missed: 0 });
  });

  it("dose futura já concluída (tomada adiantada) conta como tomada e no horário", () => {
    const result = computeAdherence(
      [
        dose({
          due_date: "2026-08-17",
          due_time: "20:00",
          dose_time: "20:00",
          status: "done",
          completed_at: new Date(2026, 7, 17, 11, 0).toISOString(),
        }),
      ],
      NOW
    );

    expect(result).toMatchObject({ total: 1, taken: 1, onTime: 1, late: 0, missed: 0 });
  });

  it("mistura das quatro situações: taxas sobre as vencidas, não sobre tudo", () => {
    const result = computeAdherence(
      [
        // no horário
        dose({
          due_date: "2026-08-15",
          status: "done",
          completed_at: new Date(2026, 7, 15, 8, 5).toISOString(),
        }),
        // atrasada
        dose({
          due_date: "2026-08-16",
          status: "done",
          completed_at: new Date(2026, 7, 16, 14, 0).toISOString(),
        }),
        // perdida
        dose({ due_date: "2026-08-17", due_time: "08:00", dose_time: "08:00" }),
        // ainda não vencida — fora da conta
        dose({ due_date: "2026-08-17", due_time: "20:00", dose_time: "20:00" }),
      ],
      NOW
    );

    expect(result).toMatchObject({ total: 3, taken: 2, onTime: 1, late: 1, missed: 1 });
    expect(result.takenRate).toBeCloseTo(0.6667, 4);
    expect(result.onTimeRate).toBeCloseTo(0.3333, 4);
  });

  it("dose sem horário só vence no fim do dia", () => {
    const semHorario = dose({
      due_date: "2026-08-17",
      due_time: null,
      dose_time: null,
    });

    expect(computeAdherence([semHorario], NOW).total).toBe(0);
    expect(computeAdherence([semHorario], new Date(2026, 7, 18, 0, 30)).total).toBe(1);
  });

  it("dose sem due_date é ignorada", () => {
    expect(computeAdherence([dose({ due_date: null })], NOW).total).toBe(0);
  });
});

describe("formatRate", () => {
  it("vira percentual inteiro", () => {
    expect(formatRate(0.6667)).toBe("67%");
    expect(formatRate(1)).toBe("100%");
    expect(formatRate(0)).toBe("0%");
  });
});
