import { describe, expect, it } from "vitest";
import { isDoseLate } from "@/domain/tasks/medication";
import type { Task } from "@/types/tasks";

function medicationTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Remédio X",
    status: "done",
    tag_ids: [],
    due_date: "2026-08-16",
    due_time: "08:00",
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    is_medication: true,
    completed_at: "2026-08-16T08:00:00.000",
    ...overrides,
  };
}

describe("isDoseLate", () => {
  it("no horário exato, não é atrasada", () => {
    const task = medicationTask({ completed_at: "2026-08-16T08:00:00.000" });
    expect(isDoseLate(task)).toBe(false);
  });

  it("atrasada além da margem de 60 min, é atrasada", () => {
    const task = medicationTask({ completed_at: "2026-08-16T09:05:00.000" });
    expect(isDoseLate(task)).toBe(true);
  });

  it("dentro da margem de 60 min, não é atrasada", () => {
    const task = medicationTask({ completed_at: "2026-08-16T08:30:00.000" });
    expect(isDoseLate(task)).toBe(false);
  });

  it("sem completed_at, não é atrasada", () => {
    const task = medicationTask({ completed_at: null });
    expect(isDoseLate(task)).toBe(false);
  });

  it("sem due_date, não é atrasada", () => {
    const task = medicationTask({ due_date: null });
    expect(isDoseLate(task)).toBe(false);
  });

  it("sem due_time, não é atrasada", () => {
    const task = medicationTask({ due_time: null });
    expect(isDoseLate(task)).toBe(false);
  });

  it("respeita graceMinutes customizado", () => {
    const task = medicationTask({ completed_at: "2026-08-16T08:20:00.000" });
    expect(isDoseLate(task, 10)).toBe(true);
    expect(isDoseLate(task, 30)).toBe(false);
  });
});
