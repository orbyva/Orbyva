import { describe, expect, it } from "vitest";
import { computeGanttBar, computeGanttDays } from "@/domain/tasks/gantt";

describe("computeGanttDays", () => {
  it("retorna vazio quando nenhuma tarefa tem data", () => {
    expect(computeGanttDays([{ id: "1", due_date: null }])).toEqual([]);
  });

  it("cobre do menor start_date/due_date ao maior, com folga", () => {
    const days = computeGanttDays(
      [
        { id: "1", start_date: "2026-08-05", due_date: "2026-08-07" },
        { id: "2", due_date: "2026-08-10" },
      ],
      1
    );
    expect(days[0]).toBe("2026-08-04");
    expect(days[days.length - 1]).toBe("2026-08-11");
    expect(days).toHaveLength(8);
  });

  it("ignora tarefas sem nenhuma data", () => {
    const days = computeGanttDays(
      [
        { id: "1", due_date: "2026-08-05" },
        { id: "2", due_date: null },
      ],
      0
    );
    expect(days).toEqual(["2026-08-05"]);
  });
});

describe("computeGanttBar", () => {
  const days = computeGanttDays([{ id: "x", due_date: "2026-08-05" }], 3);
  // days: 2026-08-02 .. 2026-08-08 (7 dias)

  it("calcula coluna inicial e span para tarefa com início e prazo", () => {
    const bar = computeGanttBar({ id: "1", start_date: "2026-08-03", due_date: "2026-08-05" }, days);
    expect(bar).toEqual({ taskId: "1", startCol: 2, span: 3 });
  });

  it("tarefa só com due_date vira marcador de 1 dia", () => {
    const bar = computeGanttBar({ id: "2", due_date: "2026-08-05" }, days);
    expect(bar).toEqual({ taskId: "2", startCol: 4, span: 1 });
  });

  it("tarefa só com start_date vira marcador de 1 dia", () => {
    const bar = computeGanttBar({ id: "3", start_date: "2026-08-02", due_date: null }, days);
    expect(bar).toEqual({ taskId: "3", startCol: 1, span: 1 });
  });

  it("retorna null para tarefa sem nenhuma data", () => {
    expect(computeGanttBar({ id: "4", due_date: null }, days)).toBeNull();
  });

  it("retorna null quando a data cai fora do intervalo calculado", () => {
    expect(
      computeGanttBar({ id: "5", due_date: "2026-09-01" }, days)
    ).toBeNull();
  });
});
