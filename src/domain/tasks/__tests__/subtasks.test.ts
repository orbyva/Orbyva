import { describe, expect, it } from "vitest";
import {
  groupSubtasksByParent,
  isSubtaskDueDateValid,
  reorderItems,
} from "@/domain/tasks/subtasks";

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

  it("ordena cada grupo por sort_order, com o id como desempate", () => {
    const map = groupSubtasksByParent([
      { id: "b", parent_task_id: "top", sort_order: 2 },
      { id: "c", parent_task_id: "top", sort_order: 1 },
      { id: "a", parent_task_id: "top", sort_order: 1 },
    ]);
    expect(map.get("top")?.map((t) => t.id)).toEqual(["a", "c", "b"]);
  });

  it("retorna mapa vazio quando não há subtarefas", () => {
    expect(groupSubtasksByParent([{ id: "1", parent_task_id: null }]).size).toBe(0);
  });
});

describe("isSubtaskDueDateValid", () => {
  it("subtarefa sem prazo é sempre válida", () => {
    expect(isSubtaskDueDateValid(null, "2026-08-10")).toBe(true);
  });

  it("subtarefa com prazo igual ao do pai é válida", () => {
    expect(isSubtaskDueDateValid("2026-08-10", "2026-08-10")).toBe(true);
  });

  it("subtarefa com prazo depois do pai é inválida", () => {
    expect(isSubtaskDueDateValid("2026-08-11", "2026-08-10")).toBe(false);
  });

  it("subtarefa com prazo antes do pai é válida", () => {
    expect(isSubtaskDueDateValid("2026-08-01", "2026-08-10")).toBe(true);
  });

  it("pai sem prazo não restringe nenhum prazo de subtarefa", () => {
    expect(isSubtaskDueDateValid("2099-01-01", null)).toBe(true);
  });
});

describe("reorderItems", () => {
  it("move o item para o índice destino sem mutar o original", () => {
    const source = ["a", "b", "c"];
    expect(reorderItems(source, 0, 2)).toEqual(["b", "c", "a"]);
    expect(source).toEqual(["a", "b", "c"]);
  });

  it("índice inválido devolve cópia igual", () => {
    expect(reorderItems(["a", "b"], 0, 0)).toEqual(["a", "b"]);
    expect(reorderItems(["a", "b"], -1, 1)).toEqual(["a", "b"]);
  });
});
