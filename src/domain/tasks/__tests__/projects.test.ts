import { describe, expect, it } from "vitest";
import { topOngoingTasksForProject } from "@/domain/tasks/projects";

type Row = {
  id: string;
  project_id: string | null;
  parent_task_id: string | null;
  status: string;
  due_date: string | null;
  linked_recurring_id: string | null;
  linked_installment_number: number | null;
};

function task(overrides: Partial<Row> & { id: string }): Row {
  return {
    project_id: "p1",
    parent_task_id: null,
    status: "todo",
    due_date: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    ...overrides,
  };
}

describe("topOngoingTasksForProject", () => {
  it("filtra por projeto e por status em aberto", () => {
    const tasks = [
      task({ id: "1", project_id: "p1", status: "todo" }),
      task({ id: "2", project_id: "p2", status: "todo" }),
      task({ id: "3", project_id: "p1", status: "done" }),
    ];
    expect(topOngoingTasksForProject(tasks, "p1").map((t) => t.id)).toEqual(["1"]);
  });

  it("exclui subtarefas", () => {
    const tasks = [task({ id: "1", parent_task_id: "parent" })];
    expect(topOngoingTasksForProject(tasks, "p1")).toEqual([]);
  });

  it("exclui tarefas-template vinculadas a Recorrência Financeira", () => {
    const tasks = [
      task({ id: "1", linked_recurring_id: "rec1", linked_installment_number: null }),
      task({ id: "2", linked_recurring_id: "rec1", linked_installment_number: 2 }),
    ];
    expect(topOngoingTasksForProject(tasks, "p1").map((t) => t.id)).toEqual(["2"]);
  });

  it("ordena por prazo e respeita o limite", () => {
    const tasks = [
      task({ id: "1", due_date: "2026-08-10" }),
      task({ id: "2", due_date: "2026-08-05" }),
      task({ id: "3", due_date: "2026-08-01" }),
      task({ id: "4", due_date: null }),
    ];
    expect(topOngoingTasksForProject(tasks, "p1", 2).map((t) => t.id)).toEqual(["3", "2"]);
  });
});
