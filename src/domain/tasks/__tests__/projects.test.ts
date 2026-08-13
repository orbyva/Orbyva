import { describe, expect, it } from "vitest";
import { rankProjectsByActivity, topOngoingTasksForProject } from "@/domain/tasks/projects";

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

describe("rankProjectsByActivity", () => {
  function project(overrides: { id: string; created_at?: string }) {
    return { ...overrides };
  }

  function activityTask(overrides: {
    project_id: string | null;
    parent_task_id?: string | null;
    created_at?: string;
  }) {
    return { parent_task_id: null, ...overrides };
  }

  it("ordena por contagem de tarefas de topo, mais tarefas primeiro", () => {
    const projects = [
      project({ id: "p1", created_at: "2026-01-01" }),
      project({ id: "p2", created_at: "2026-01-02" }),
    ];
    const tasks = [
      activityTask({ project_id: "p1", created_at: "2026-01-01" }),
      activityTask({ project_id: "p2", created_at: "2026-01-01" }),
      activityTask({ project_id: "p2", created_at: "2026-01-02" }),
    ];
    expect(rankProjectsByActivity(projects, tasks).map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  it("desempata por created_at da tarefa mais recente do projeto", () => {
    const projects = [project({ id: "p1" }), project({ id: "p2" })];
    const tasks = [
      activityTask({ project_id: "p1", created_at: "2026-01-01" }),
      activityTask({ project_id: "p2", created_at: "2026-01-05" }),
    ];
    expect(rankProjectsByActivity(projects, tasks).map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  it("exclui subtarefas da contagem", () => {
    const projects = [project({ id: "p1" }), project({ id: "p2" })];
    const tasks = [
      activityTask({ project_id: "p1", parent_task_id: "parent", created_at: "2026-01-01" }),
      activityTask({ project_id: "p2", created_at: "2026-01-01" }),
    ];
    expect(rankProjectsByActivity(projects, tasks).map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  it("projetos sem tarefas ficam por último, ordenados por created_at do próprio projeto", () => {
    const projects = [
      project({ id: "empty-old", created_at: "2026-01-01" }),
      project({ id: "empty-new", created_at: "2026-01-05" }),
      project({ id: "active", created_at: "2026-01-03" }),
    ];
    const tasks = [activityTask({ project_id: "active", created_at: "2026-01-01" })];
    expect(rankProjectsByActivity(projects, tasks).map((p) => p.id)).toEqual([
      "active",
      "empty-new",
      "empty-old",
    ]);
  });
});
