import { describe, expect, it } from "vitest";
import { filterTasks, sortTasksByDueDate } from "@/domain/tasks/filters";

type Row = { id: string; project_id: string | null; tag_ids: string[]; due_date: string | null };

const rows: Row[] = [
  { id: "1", project_id: "p1", tag_ids: ["casa"], due_date: "2026-08-10" },
  { id: "2", project_id: "p2", tag_ids: ["trabalho"], due_date: "2026-08-05" },
  { id: "3", project_id: null, tag_ids: ["casa", "urgente"], due_date: null },
];

describe("filterTasks", () => {
  it("filtra por projeto", () => {
    expect(filterTasks(rows, { projectId: "p1" }).map((r) => r.id)).toEqual(["1"]);
  });

  it("filtra por tag", () => {
    expect(filterTasks(rows, { tagId: "casa" }).map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("filtra por prazo até uma data", () => {
    expect(filterTasks(rows, { dueBefore: "2026-08-09" }).map((r) => r.id)).toEqual(["2"]);
  });

  it("sem filtro retorna tudo", () => {
    expect(filterTasks(rows, {})).toHaveLength(3);
  });

  it("filtra por projeto null (sem projeto)", () => {
    expect(filterTasks(rows, { projectId: null }).map((r) => r.id)).toEqual(["3"]);
  });
});

describe("sortTasksByDueDate", () => {
  it("ordena por prazo, sem prazo por último", () => {
    expect(sortTasksByDueDate(rows).map((r) => r.id)).toEqual(["2", "1", "3"]);
  });
});
