import { describe, expect, it } from "vitest";
import { groupSubtasksByParent } from "@/domain/tasks/subtasks";

type Row = { id: string; parent_task_id: string | null };

describe("groupSubtasksByParent", () => {
  it("agrupa subtarefas pelo pai, ignorando tarefas de topo", () => {
    const rows: Row[] = [
      { id: "top1", parent_task_id: null },
      { id: "sub1", parent_task_id: "top1" },
      { id: "sub2", parent_task_id: "top1" },
      { id: "sub3", parent_task_id: "top2" },
    ];
    const map = groupSubtasksByParent(rows);
    expect(map.get("top1")?.map((t) => t.id)).toEqual(["sub1", "sub2"]);
    expect(map.get("top2")?.map((t) => t.id)).toEqual(["sub3"]);
    expect(map.has("top3")).toBe(false);
  });

  it("retorna mapa vazio quando não há subtarefas", () => {
    expect(groupSubtasksByParent([{ id: "1", parent_task_id: null }]).size).toBe(0);
  });
});
