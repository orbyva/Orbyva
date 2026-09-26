import { describe, expect, it } from "vitest";
import { formatEstimatedDuration, resolveTaskSchedule } from "@/domain/tasks/duration";
import { formatLocalIsoDate } from "@/lib/dates";

describe("formatEstimatedDuration", () => {
  it("formata minutos < 60 como 'Xmin'", () => {
    expect(formatEstimatedDuration(45)).toBe("45min");
    expect(formatEstimatedDuration(1)).toBe("1min");
  });

  it("formata horas exatas como 'Xh'", () => {
    expect(formatEstimatedDuration(60)).toBe("1h");
    expect(formatEstimatedDuration(120)).toBe("2h");
  });

  it("formata horas com minutos como 'XhY'", () => {
    expect(formatEstimatedDuration(90)).toBe("1h30");
    expect(formatEstimatedDuration(135)).toBe("2h15");
  });

  it("retorna vazio para null/undefined/0", () => {
    expect(formatEstimatedDuration(null)).toBe("");
    expect(formatEstimatedDuration(undefined)).toBe("");
    expect(formatEstimatedDuration(0)).toBe("");
  });

  it("retorna vazio para valores negativos", () => {
    expect(formatEstimatedDuration(-10)).toBe("");
  });
});

describe("resolveTaskSchedule", () => {
  it("duas datas presentes ignora a duração", () => {
    const schedule = resolveTaskSchedule({
      start_date: "2026-08-10",
      due_date: "2026-08-15",
      estimated_duration: 60,
    });
    expect(schedule).toEqual({
      start_date: "2026-08-10",
      due_date: "2026-08-15",
      hasPlannedDate: true,
    });
  });

  it("só início + duração calcula o prazo (start + dias(duração))", () => {
    const schedule = resolveTaskSchedule({
      start_date: "2026-08-10",
      due_date: null,
      estimated_duration: 3 * 24 * 60, // 3 dias
    });
    expect(schedule).toEqual({
      start_date: "2026-08-10",
      due_date: "2026-08-13",
      hasPlannedDate: true,
    });
  });

  it("só início, sem duração, mantém due_date == start_date (comportamento atual)", () => {
    const schedule = resolveTaskSchedule({ start_date: "2026-08-10", due_date: null });
    expect(schedule).toEqual({
      start_date: "2026-08-10",
      due_date: "2026-08-10",
      hasPlannedDate: true,
    });
  });

  it("só prazo + duração calcula o início (due − dias(duração))", () => {
    const schedule = resolveTaskSchedule({
      start_date: null,
      due_date: "2026-08-15",
      estimated_duration: 2 * 24 * 60, // 2 dias
    });
    expect(schedule).toEqual({
      start_date: "2026-08-13",
      due_date: "2026-08-15",
      hasPlannedDate: true,
    });
  });

  it("só prazo, sem duração, mantém start_date == due_date (comportamento atual)", () => {
    const schedule = resolveTaskSchedule({ start_date: null, due_date: "2026-08-15" });
    expect(schedule).toEqual({
      start_date: "2026-08-15",
      due_date: "2026-08-15",
      hasPlannedDate: true,
    });
  });

  it("nenhuma data + duração usa âncora de hoje com a largura da duração, hasPlannedDate:false", () => {
    const todayIso = formatLocalIsoDate(new Date());
    const schedule = resolveTaskSchedule({
      start_date: null,
      due_date: null,
      estimated_duration: 4 * 24 * 60, // 4 dias
    });
    expect(schedule.start_date).toBe(todayIso);
    expect(schedule.due_date).not.toBe(todayIso);
    expect(schedule.hasPlannedDate).toBe(false);
    const [y, m, d] = schedule.due_date.split("-").map(Number);
    const expectedEnd = new Date(y, m - 1, d);
    const start = new Date(todayIso + "T00:00:00");
    const diffDays = Math.round((expectedEnd.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBe(4);
  });

  it("nenhuma data nem duração usa âncora de 1 dia (comportamento atual preservado)", () => {
    const todayIso = formatLocalIsoDate(new Date());
    const schedule = resolveTaskSchedule({});
    expect(schedule.start_date).toBe(todayIso);
    expect(schedule.hasPlannedDate).toBe(false);
    const [y, m, d] = schedule.due_date.split("-").map(Number);
    const expectedEnd = new Date(y, m - 1, d);
    const start = new Date(todayIso + "T00:00:00");
    const diffDays = Math.round((expectedEnd.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBe(1);
  });

  it("duração menor que 1 dia (arredondada pra cima) ainda vira barra de 1 dia mínimo", () => {
    const schedule = resolveTaskSchedule({
      start_date: "2026-08-10",
      due_date: null,
      estimated_duration: 30, // 30min
    });
    expect(schedule.due_date).toBe("2026-08-11");
  });
});
