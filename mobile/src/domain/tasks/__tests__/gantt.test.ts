import { describe, expect, it } from "vitest";

import { resolveTaskSchedule } from "@/domain/tasks/duration";
import {
  buildGanttRows,
  dependencyCandidates,
  ganttTasks,
  layoutGantt,
  wouldCreateCycle,
} from "@/domain/tasks/gantt";
import type { Task } from "@/types/tasks";

const TODAY = "2026-10-05";

function task(over: Partial<Task> & Pick<Task, "id">): Task {
  return {
    title: over.id,
    status: "todo",
    due_date: null,
    parent_task_id: null,
    project_id: null,
    recurrence_rule: null,
    recurrence_origin_id: null,
    linked_recurring_id: null,
    ...over,
  } as Task;
}

describe("resolveTaskSchedule", () => {
  it("duas datas ganham da duração", () => {
    expect(
      resolveTaskSchedule({ start_date: "2026-10-01", due_date: "2026-10-03", estimated_duration: 9999 }, TODAY)
    ).toEqual({ start_date: "2026-10-01", due_date: "2026-10-03", hasPlannedDate: true });
  });

  it("só prazo + duração deriva o início (arredonda para dia cheio)", () => {
    expect(resolveTaskSchedule({ due_date: "2026-10-10", estimated_duration: 60 * 30 }, TODAY)).toEqual({
      start_date: "2026-10-08",
      due_date: "2026-10-10",
      hasPlannedDate: true,
    });
  });

  it("sem data ancora em hoje e marca como não planejada", () => {
    expect(resolveTaskSchedule({}, TODAY)).toEqual({
      start_date: TODAY,
      due_date: "2026-10-06",
      hasPlannedDate: false,
    });
  });
});

describe("buildGanttRows", () => {
  it("ordena por início, põe subtarefa logo abaixo do pai e trata marco", () => {
    const rows = buildGanttRows(
      [
        task({ id: "late", due_date: "2026-10-20" }),
        task({ id: "early", start_date: "2026-10-01", due_date: "2026-10-04" }),
        task({ id: "child", parent_task_id: "late", due_date: "2026-10-18" }),
        task({ id: "ms", due_date: "2026-10-12", is_milestone: true, estimated_duration: 600 }),
        task({ id: "orphan", parent_task_id: "missing", due_date: "2026-10-02" }),
      ],
      TODAY
    );
    expect(rows.map((r) => [r.id, r.depth])).toEqual([
      ["early", 0],
      ["ms", 0],
      ["late", 0],
      ["child", 1],
    ]);
    const ms = rows.find((r) => r.id === "ms");
    expect(ms).toMatchObject({ kind: "milestone", start: "2026-10-12", end: "2026-10-12" });
  });

  it("ganttTasks tira só a tarefa-modelo financeira", () => {
    const kept = ganttTasks([
      task({ id: "a" }),
      task({ id: "tpl", linked_recurring_id: "r1", linked_installment_number: null }),
      task({ id: "parcela", linked_recurring_id: "r1", linked_installment_number: 2 }),
    ]);
    expect(kept.map((t) => t.id)).toEqual(["a", "parcela"]);
  });
});

describe("layoutGantt", () => {
  const rows = buildGanttRows(
    [
      task({ id: "a", start_date: "2026-10-05", due_date: "2026-10-07" }),
      task({ id: "b", start_date: "2026-10-08", due_date: "2026-10-08" }),
      task({ id: "m", due_date: "2026-10-09", is_milestone: true }),
    ],
    TODAY
  );
  const layout = layoutGantt(
    rows,
    [
      { task_id: "b", depends_on_task_id: "a" },
      { task_id: "b", depends_on_task_id: "fora" },
    ],
    { todayIso: TODAY, dayWidth: 10, rowHeight: 20, padDays: 1 }
  );

  it("faixa cobre barras + hoje com folga", () => {
    expect(layout.startIso).toBe("2026-10-04");
    expect(layout.days.at(-1)).toBe("2026-10-10");
    expect(layout.width).toBe(70);
    expect(layout.height).toBe(60);
    expect(layout.todayX).toBe(15);
  });

  it("barra é inclusiva no fim; marco é ponto no meio do dia", () => {
    expect(layout.bars[0]).toMatchObject({ id: "a", x: 10, width: 30, y: 0 });
    expect(layout.bars[1]).toMatchObject({ id: "b", x: 40, width: 10, y: 20 });
    expect(layout.bars[2]).toMatchObject({ id: "m", kind: "milestone", x: 55, width: 0, y: 40 });
  });

  it("seta liga fim da fonte ao início do alvo; dependência invisível some", () => {
    expect(layout.links).toHaveLength(1);
    const [link] = layout.links;
    expect(link.id).toBe("a->b");
    expect(link.points[0]).toEqual({ x: 40, y: 10 });
    expect(link.points.at(-1)).toEqual({ x: 40, y: 30 });
  });
});

describe("dependências", () => {
  const deps = [
    { task_id: "b", depends_on_task_id: "a" },
    { task_id: "c", depends_on_task_id: "b" },
  ];

  it("detecta ciclo direto, indireto e auto-dependência", () => {
    expect(wouldCreateCycle(deps, "a", "c")).toBe(true);
    expect(wouldCreateCycle(deps, "a", "b")).toBe(true);
    expect(wouldCreateCycle(deps, "a", "a")).toBe(true);
    expect(wouldCreateCycle(deps, "c", "a")).toBe(false);
  });

  it("candidatos excluem a própria, as já ligadas e as que fechariam ciclo", () => {
    const tasks = ["a", "b", "c", "d"].map((id) => ({ id, title: id }));
    expect(dependencyCandidates(tasks, deps, "a").map((t) => t.id)).toEqual(["d"]);
    expect(dependencyCandidates(tasks, deps, "c").map((t) => t.id)).toEqual(["a", "d"]);
  });
});
