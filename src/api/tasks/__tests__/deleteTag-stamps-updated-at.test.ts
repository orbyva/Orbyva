import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteTag } from "@/api/tasks/tags";

/**
 * Auditoria da feature 079: não há trigger `moddatetime` em `task` — quem carimba `updated_at` é o
 * cliente, em toda escrita. `deleteTag` é o único caminho fora de `updateTask` que **atualiza**
 * linhas de `task` (tira a tag do array `tag_ids`), e antes da 079 ele não carimbava: a tarefa
 * mudava e ainda assim afundava na lista ordenada por "Última atualização". Este teste tranca isso.
 */

interface Call {
  table: string;
  op: "select" | "update" | "delete";
  payload?: Record<string, unknown>;
  eq: [string, unknown][];
}

const calls: Call[] = [];
type Result = { data: unknown; error: { message: string } | null };
let selectResults: Record<string, Result> = {};

function makeBuilder(table: string) {
  const call: Call = { table, op: "select", eq: [] };
  calls.push(call);
  const settle = () =>
    Promise.resolve(
      call.op === "select" ? (selectResults[table] ?? { data: [], error: null }) : { data: null, error: null }
    );
  const builder = {
    select() {
      return builder;
    },
    update(payload: Record<string, unknown>) {
      call.op = "update";
      call.payload = payload;
      return builder;
    },
    delete() {
      call.op = "delete";
      return builder;
    },
    eq(column: string, value: unknown) {
      call.eq.push([column, value]);
      return builder;
    },
    contains() {
      return builder;
    },
    then(resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) {
      return settle().then(resolve, reject);
    },
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => makeBuilder(table) },
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

beforeEach(() => {
  calls.length = 0;
  selectResults = {};
});

describe("deleteTag — carimbo de updated_at (feature 079)", () => {
  it("tirar a tag de uma tarefa carimba updated_at junto com tag_ids", async () => {
    selectResults = {
      task: { data: [{ id: "t-1", tag_ids: ["tag-x", "tag-y"] }], error: null },
      project: { data: [], error: null },
    };
    const before = Date.now();

    await deleteTag("tag-x");

    const taskUpdate = calls.find((c) => c.table === "task" && c.op === "update");
    expect(taskUpdate).toBeDefined();
    expect(taskUpdate?.payload?.tag_ids).toEqual(["tag-y"]);

    const stamp = Date.parse(String(taskUpdate?.payload?.updated_at));
    expect(Number.isNaN(stamp)).toBe(false);
    expect(stamp).toBeGreaterThanOrEqual(before);
    expect(taskUpdate?.eq).toContainEqual(["id", "t-1"]);
  });

  it("sem tarefa usando a tag, nenhuma linha de task é atualizada", async () => {
    selectResults = {
      task: { data: [], error: null },
      project: { data: [], error: null },
    };

    await deleteTag("tag-x");

    expect(calls.filter((c) => c.table === "task" && c.op === "update")).toHaveLength(0);
    // A tag em si continua sendo apagada.
    expect(calls.some((c) => c.table === "tag" && c.op === "delete")).toBe(true);
  });
});
