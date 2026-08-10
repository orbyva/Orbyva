import { describe, expect, it } from "vitest";
import { buildGanttLinks, buildGanttNodes, type GanttNode, type GanttTaskInput } from "@/domain/tasks/gantt";

function task(overrides: Partial<GanttTaskInput> & Pick<GanttTaskInput, "id" | "title">): GanttTaskInput {
  return {
    status: "todo",
    parent_task_id: null,
    project_id: null,
    start_date: null,
    due_date: null,
    ...overrides,
  };
}

describe("buildGanttNodes", () => {
  it("tarefa de topo sem projeto vira nó com parent 0", () => {
    const { nodes, untimedCount } = buildGanttNodes(
      [],
      [task({ id: "1", title: "Solo", due_date: "2026-08-10" })]
    );
    expect(nodes).toEqual([
      {
        id: "1",
        text: "Solo",
        start: new Date(2026, 7, 10, 12),
        end: new Date(2026, 7, 10, 12),
        type: "task",
        parent: 0,
        open: false,
        progress: 0,
      },
    ]);
    expect(untimedCount).toBe(0);
  });

  it("nó sem filhos vem com open:false (open:true num nó sem `data` crasha a lib)", () => {
    const projects = [{ id: "p1", name: "Projeto 1" }];
    const { nodes } = buildGanttNodes(projects, [
      task({ id: "1", title: "Sem subtarefa", project_id: "p1", due_date: "2026-08-10" }),
    ]);
    const taskNode = nodes.find((n) => n.id === "1");
    expect(taskNode?.open).toBe(false);
  });

  it("tarefa de topo com subtarefa vem com open:true; a subtarefa (sem filhos) vem com open:false", () => {
    const { nodes } = buildGanttNodes(
      [],
      [
        task({ id: "parent", title: "Pai", due_date: "2026-08-10" }),
        task({ id: "child", title: "Filho", parent_task_id: "parent", due_date: "2026-08-11" }),
      ]
    );
    expect(nodes.find((n) => n.id === "parent")?.open).toBe(true);
    expect(nodes.find((n) => n.id === "child")?.open).toBe(false);
  });

  it("tarefa sem nenhuma data não aparece e conta em untimedCount", () => {
    const { nodes, untimedCount } = buildGanttNodes(
      [],
      [task({ id: "1", title: "Sem data" })]
    );
    expect(nodes).toEqual([]);
    expect(untimedCount).toBe(1);
  });

  it("projeto só aparece se tiver ao menos uma tarefa de topo com data", () => {
    const projects = [{ id: "p1", name: "Projeto 1" }, { id: "p2", name: "Projeto 2 (vazio)" }];
    const { nodes } = buildGanttNodes(projects, [
      task({ id: "1", title: "Com data", project_id: "p1", due_date: "2026-08-10" }),
      task({ id: "2", title: "Sem data", project_id: "p2" }),
    ]);
    const projectNodes = nodes.filter((n) => n.type === "summary");
    expect(projectNodes.map((n) => n.id)).toEqual(["project:p1"]);
    const taskNode = nodes.find((n) => n.id === "1");
    expect(taskNode?.parent).toBe("project:p1");
  });

  it("subtarefa aparece indentada sob tarefa-pai com data, mesmo sem data própria", () => {
    const { nodes } = buildGanttNodes(
      [],
      [
        task({ id: "parent", title: "Pai", due_date: "2026-08-10" }),
        task({ id: "child", title: "Filho", parent_task_id: "parent" }),
      ]
    );
    const child = nodes.find((n) => n.id === "child");
    expect(child).toBeDefined();
    expect(child?.parent).toBe("parent");
    expect(child?.start).toBeUndefined();
    expect(child?.end).toBeUndefined();
  });

  it("subtarefa some se a tarefa-pai não tiver data", () => {
    const { nodes } = buildGanttNodes(
      [],
      [
        task({ id: "parent", title: "Pai sem data" }),
        task({ id: "child", title: "Filho", parent_task_id: "parent", due_date: "2026-08-10" }),
      ]
    );
    expect(nodes.find((n) => n.id === "child")).toBeUndefined();
  });

  it("subtarefas não contam em untimedCount", () => {
    const { untimedCount } = buildGanttNodes(
      [],
      [
        task({ id: "parent", title: "Pai", due_date: "2026-08-10" }),
        task({ id: "child", title: "Filho sem data", parent_task_id: "parent" }),
      ]
    );
    expect(untimedCount).toBe(0);
  });

  it("tarefa concluída tem progress 100", () => {
    const { nodes } = buildGanttNodes(
      [],
      [task({ id: "1", title: "Feita", status: "done", due_date: "2026-08-10" })]
    );
    expect(nodes[0].progress).toBe(100);
  });

  it("tarefa só com start_date usa a mesma data pra start e end", () => {
    const { nodes } = buildGanttNodes(
      [],
      [task({ id: "1", title: "Só início", start_date: "2026-08-05" })]
    );
    expect(nodes[0].start).toEqual(new Date(2026, 7, 5, 12));
    expect(nodes[0].end).toEqual(new Date(2026, 7, 5, 12));
  });
});

describe("buildGanttLinks", () => {
  const nodes: GanttNode[] = [
    { id: "a", text: "A", type: "task", parent: 0, open: false },
    { id: "b", text: "B", type: "task", parent: 0, open: false },
  ];

  it("converte task_dependency (X depende de Y) em link end-to-start Y→X", () => {
    const links = buildGanttLinks([{ task_id: "a", depends_on_task_id: "b" }], nodes);
    expect(links).toEqual([{ id: "b->a", source: "b", target: "a", type: "e2s" }]);
  });

  it("descarta dependência com um lado fora dos nós visíveis", () => {
    const links = buildGanttLinks([{ task_id: "a", depends_on_task_id: "outro" }], nodes);
    expect(links).toEqual([]);
  });

  it("lista vazia sem dependências", () => {
    expect(buildGanttLinks([], nodes)).toEqual([]);
  });
});
