import { describe, expect, it } from "vitest";
import {
  bucketForDueDate,
  collapseRecurringSeries,
  filterTasksByStatusView,
  findSeriesTasks,
  groupTasksByAgendaBucket,
  isRecurringTask,
  isSimpleRecurringTask,
  sortTasksByCompletedAtDesc,
} from "@/domain/tasks/agenda";

const TODAY = "2026-08-06"; // quinta-feira

describe("bucketForDueDate", () => {
  it("sem prazo cai em no_date", () => {
    expect(bucketForDueDate(null, TODAY)).toBe("no_date");
  });

  it("prazo no passado é overdue", () => {
    expect(bucketForDueDate("2026-08-05", TODAY)).toBe("overdue");
  });

  it("prazo hoje é today", () => {
    expect(bucketForDueDate(TODAY, TODAY)).toBe("today");
  });

  it("prazo no resto da semana civil é this_week", () => {
    expect(bucketForDueDate("2026-08-08", TODAY)).toBe("this_week"); // sábado
  });

  it("prazo além da semana mas dentro do mês é this_month", () => {
    expect(bucketForDueDate("2026-08-20", TODAY)).toBe("this_month");
  });

  it("prazo no próximo mês é later", () => {
    expect(bucketForDueDate("2026-09-01", TODAY)).toBe("later");
  });
});

describe("groupTasksByAgendaBucket", () => {
  it("agrupa em todos os buckets, mantendo os vazios", () => {
    const groups = groupTasksByAgendaBucket(
      [{ due_date: "2026-08-05" }, { due_date: TODAY }, { due_date: null }],
      TODAY
    );
    expect(groups.overdue).toHaveLength(1);
    expect(groups.today).toHaveLength(1);
    expect(groups.no_date).toHaveLength(1);
    expect(groups.this_week).toHaveLength(0);
  });
});

type Row = {
  id: string;
  due_date: string | null;
  status: string;
  recurrence_rule: unknown;
  recurrence_origin_id: string | null;
  linked_recurring_id: string | null;
};

function task(overrides: Partial<Row> & { id: string }): Row {
  return {
    due_date: null,
    status: "todo",
    recurrence_rule: null,
    recurrence_origin_id: null,
    linked_recurring_id: null,
    ...overrides,
  };
}

describe("collapseRecurringSeries", () => {
  it("tarefas não recorrentes passam direto", () => {
    const tasks = [task({ id: "1" }), task({ id: "2" })];
    expect(collapseRecurringSeries(tasks).map((t) => t.id)).toEqual(["1", "2"]);
  });

  it("colapsa série simples na próxima ocorrência em aberto", () => {
    const origin = task({
      id: "origin",
      due_date: "2026-08-01",
      recurrence_rule: { frequency: "weekly", interval: 1 },
      status: "done",
    });
    const child1 = task({
      id: "child1",
      due_date: "2026-08-08",
      recurrence_origin_id: "origin",
      status: "done",
    });
    const child2 = task({
      id: "child2",
      due_date: "2026-08-15",
      recurrence_origin_id: "origin",
      status: "todo",
    });
    const result = collapseRecurringSeries([origin, child1, child2]);
    expect(result.map((t) => t.id)).toEqual(["child2"]);
  });

  it("série vinculada a Recorrência Financeira usa a parcela em aberto mais próxima", () => {
    const inst1 = task({
      id: "p1",
      due_date: "2026-08-10",
      linked_recurring_id: "rec1",
      status: "done",
    });
    const inst2 = task({
      id: "p2",
      due_date: "2026-09-10",
      linked_recurring_id: "rec1",
      status: "todo",
    });
    const inst3 = task({
      id: "p3",
      due_date: "2026-10-10",
      linked_recurring_id: "rec1",
      status: "todo",
    });
    const result = collapseRecurringSeries([inst1, inst2, inst3]);
    expect(result.map((t) => t.id)).toEqual(["p2"]);
  });

  it("série totalmente concluída some da lista", () => {
    const origin = task({
      id: "origin",
      due_date: "2026-08-01",
      recurrence_rule: { frequency: "daily", interval: 1 },
      status: "done",
    });
    const child = task({
      id: "child",
      due_date: "2026-08-02",
      recurrence_origin_id: "origin",
      status: "done",
    });
    expect(collapseRecurringSeries([origin, child])).toEqual([]);
  });
});

describe("findSeriesTasks", () => {
  it("retorna a própria tarefa quando não é recorrente", () => {
    const solo = task({ id: "solo" });
    expect(findSeriesTasks([solo], solo)).toEqual([solo]);
  });

  it("retorna todas as ocorrências da série, ordenadas por prazo", () => {
    const origin = task({
      id: "origin",
      due_date: "2026-08-01",
      recurrence_rule: { frequency: "weekly", interval: 1 },
      status: "done",
    });
    const child1 = task({
      id: "child1",
      due_date: "2026-08-15",
      recurrence_origin_id: "origin",
      status: "todo",
    });
    const child2 = task({
      id: "child2",
      due_date: "2026-08-08",
      recurrence_origin_id: "origin",
      status: "done",
    });
    const other = task({ id: "other", recurrence_origin_id: "another-origin" });
    const result = findSeriesTasks([origin, child1, child2, other], child1);
    expect(result.map((t) => t.id)).toEqual(["origin", "child2", "child1"]);
  });
});

describe("filterTasksByStatusView", () => {
  const tasks = [
    { status: "todo" },
    { status: "doing" },
    { status: "done" },
    { status: "done" },
  ];

  it("pending mantém só status !== done", () => {
    expect(filterTasksByStatusView(tasks, "pending")).toHaveLength(2);
  });

  it("done mantém só status === done", () => {
    expect(filterTasksByStatusView(tasks, "done")).toHaveLength(2);
  });

  it("all não filtra nada", () => {
    expect(filterTasksByStatusView(tasks, "all")).toHaveLength(4);
  });
});

describe("sortTasksByCompletedAtDesc", () => {
  it("ordena por completed_at desc, mais recente primeiro", () => {
    const tasks = [
      { id: "a", completed_at: "2026-08-01T10:00:00Z" },
      { id: "b", completed_at: "2026-08-05T10:00:00Z" },
      { id: "c", completed_at: "2026-08-03T10:00:00Z" },
    ];
    expect(sortTasksByCompletedAtDesc(tasks).map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("tarefas sem completed_at vão pro fim", () => {
    const tasks = [
      { id: "a", completed_at: null },
      { id: "b", completed_at: "2026-08-05T10:00:00Z" },
    ];
    expect(sortTasksByCompletedAtDesc(tasks).map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("isRecurringTask", () => {
  it("detecta recorrência simples, vínculo financeiro e instância materializada", () => {
    expect(isRecurringTask(task({ id: "1", recurrence_rule: { frequency: "daily", interval: 1 } }))).toBe(
      true
    );
    expect(isRecurringTask(task({ id: "2", recurrence_origin_id: "origin" }))).toBe(true);
    expect(isRecurringTask(task({ id: "3", linked_recurring_id: "rec1" }))).toBe(true);
    expect(isRecurringTask(task({ id: "4" }))).toBe(false);
  });
});

describe("isSimpleRecurringTask", () => {
  it("true para origem de recorrência simples (recurrence_rule)", () => {
    expect(
      isSimpleRecurringTask(
        task({ id: "1", recurrence_rule: { frequency: "daily", interval: 1 } })
      )
    ).toBe(true);
  });

  it("true para ocorrência materializada de recorrência simples (recurrence_origin_id)", () => {
    expect(isSimpleRecurringTask(task({ id: "2", recurrence_origin_id: "origin" }))).toBe(true);
  });

  it("false para tarefa vinculada a Recorrência Financeira, mesmo com recurrence_origin_id", () => {
    expect(
      isSimpleRecurringTask(
        task({ id: "3", recurrence_origin_id: "template", linked_recurring_id: "rec1" })
      )
    ).toBe(false);
    expect(isSimpleRecurringTask(task({ id: "4", linked_recurring_id: "rec1" }))).toBe(false);
  });

  it("false para tarefa comum, sem nenhuma recorrência", () => {
    expect(isSimpleRecurringTask(task({ id: "5" }))).toBe(false);
  });
});
