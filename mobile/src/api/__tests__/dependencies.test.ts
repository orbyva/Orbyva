import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const { db } = vi.hoisted(() => ({ db: { rows: [] as Row[], inserts: 0 } }));

vi.mock("@/lib/auth-user", () => ({ getCurrentUserId: vi.fn(async () => "me") }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => {
      const filters: [string, unknown][] = [];
      let op = "select";
      const match = (r: Row) => filters.every(([k, v]) => r[k] === v);
      const builder: Record<string, unknown> = {
        select: () => builder,
        delete: () => ((op = "delete"), builder),
        eq: (k: string, v: unknown) => (filters.push([k, v]), builder),
        insert: async (rows: Row[]) => {
          db.inserts += 1;
          db.rows.push(...rows);
          return { error: null };
        },
        then: (resolve: (v: unknown) => void) => {
          if (op === "delete") {
            db.rows = db.rows.filter((r) => !match(r));
            return resolve({ error: null });
          }
          return resolve({
            data: db.rows.filter(match).map((r) => ({ task_id: r.task_id, depends_on_task_id: r.depends_on_task_id })),
            error: null,
          });
        },
      };
      return builder;
    },
  },
}));

import { createDependency, deleteDependency, fetchDependencies } from "@/api/tasks/dependencies";

beforeEach(() => {
  db.inserts = 0;
  db.rows = [{ user_id: "other", task_id: "x", depends_on_task_id: "y" }];
});

describe("task_dependency", () => {
  it("cria com o dono, lista só as do usuário e remove o par exato", async () => {
    await createDependency("b", "a");
    await createDependency("c", "a");
    expect(db.rows.at(-1)).toEqual({ user_id: "me", task_id: "c", depends_on_task_id: "a" });
    expect(await fetchDependencies()).toEqual([
      { task_id: "b", depends_on_task_id: "a" },
      { task_id: "c", depends_on_task_id: "a" },
    ]);
    await deleteDependency("b", "a");
    expect(await fetchDependencies()).toEqual([{ task_id: "c", depends_on_task_id: "a" }]);
    expect(db.rows).toContainEqual({ user_id: "other", task_id: "x", depends_on_task_id: "y" });
  });

  it("recusa auto-dependência sem ir ao banco", async () => {
    await expect(createDependency("a", "a")).rejects.toThrow("Uma tarefa não pode depender de si mesma.");
    expect(db.inserts).toBe(0);
  });
});
