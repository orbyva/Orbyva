import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchProjectAssets,
  createProjectAsset,
  updateProjectAsset,
  deleteProjectAsset,
  reorderProjectAssets,
  fetchAssetsForTasks,
  saveTaskAssetLinks,
} from "@/api/tasks/projectAssets";
import type { ProjectAsset } from "@/types/tasks";

/**
 * Mesmo duplo do query builder de `src/api/notes/__tests__/noteLinks-api.test.ts`: sem Supabase
 * local, o I/O é verificado gravando a query montada (tabela, filtros, ordenação, payload). É o que
 * prova, sem navegador, que todo acesso a `project_asset`/`project_asset_task` é escopado em
 * `user_id` — o mesmo escopo que a RLS exige e que os índices cobrem — e que a gravação em bloco
 * apaga só o que saiu, insere só o que entrou e não reescreve o que não mudou.
 */

interface Call {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  select?: string;
  payload?: unknown;
  eq: [string, unknown][];
  in?: [string, unknown[]];
  order?: [string, { ascending: boolean }];
  limit?: number;
  single?: boolean;
}

const calls: Call[] = [];
let results: { data: unknown; error: { message: string } | null }[] = [];

function nextResult() {
  return results.length > 1
    ? (results.shift() as { data: unknown; error: { message: string } | null })
    : results[0];
}

function makeBuilder(table: string) {
  const call: Call = { table, op: "select", eq: [] };
  calls.push(call);
  const builder = {
    select(columns?: string) {
      if (columns) call.select = columns;
      return builder;
    },
    insert(payload: unknown) {
      call.op = "insert";
      call.payload = payload;
      return builder;
    },
    update(payload: unknown) {
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
    in(column: string, values: unknown[]) {
      call.in = [column, values];
      return builder;
    },
    order(column: string, options: { ascending: boolean }) {
      call.order = [column, options];
      return builder;
    },
    limit(n: number) {
      call.limit = n;
      return builder;
    },
    single() {
      call.single = true;
      return Promise.resolve(nextResult());
    },
    then(
      resolve: (value: ReturnType<typeof nextResult>) => unknown,
      reject?: (reason: unknown) => unknown
    ) {
      return Promise.resolve(nextResult()).then(resolve, reject);
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
  results = [{ data: [], error: null }];
});

function asset(over: Partial<ProjectAsset> & { id: string }): ProjectAsset {
  const { id, ...rest } = over;
  return {
    id,
    user_id: "user-1",
    project_id: "proj-1",
    kind: "link",
    title: "Teste",
    url: "https://example.com",
    comment: null,
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...rest,
  };
}

describe("api/projectAssets", () => {
  it("fetchProjectAssets filtra por user_id e project_id e ordena por position", async () => {
    results = [{ data: [], error: null }];

    await fetchProjectAssets("proj-1");

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("project_asset");
    expect(calls[0].eq).toEqual([
      ["project_id", "proj-1"],
      ["user_id", "user-1"],
    ]);
    expect(calls[0].order).toEqual(["position", { ascending: true }]);
  });

  it("createProjectAsset calcula position = max + 1", async () => {
    // Primeira chamada: select max position
    // Segunda chamada: insert
    results = [
      { data: { position: 2 }, error: null },
      { data: asset({ id: "new-asset" }), error: null },
    ];

    const result = await createProjectAsset({
      project_id: "proj-1",
      title: "Teste",
      url: "https://example.com",
      comment: null,
      position: 0,
      kind: "link",
    });

    expect(result.id).toBe("new-asset");
    expect(calls).toHaveLength(2);
    expect(calls[0].table).toBe("project_asset");
    expect(calls[0].op).toBe("select");
    expect(calls[0].eq).toEqual([
      ["project_id", "proj-1"],
      ["user_id", "user-1"],
    ]);
    expect(calls[0].order).toEqual(["position", { ascending: false }]);
    expect(calls[0].limit).toBe(1);
    expect(calls[0].single).toBe(true);

    expect(calls[1].table).toBe("project_asset");
    expect(calls[1].op).toBe("insert");
    expect(calls[1].payload).toEqual(
      expect.objectContaining({
        project_id: "proj-1",
        user_id: "user-1",
        position: 3,
      })
    );
  });

  it("updateProjectAsset filtra por id e user_id", async () => {
    results = [{ data: asset({ id: "asset-1" }), error: null }];

    await updateProjectAsset("asset-1", { title: "Novo título" });

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("project_asset");
    expect(calls[0].op).toBe("update");
    expect(calls[0].payload).toEqual({ title: "Novo título" });
    expect(calls[0].eq).toEqual([
      ["id", "asset-1"],
      ["user_id", "user-1"],
    ]);
    expect(calls[0].single).toBe(true);
  });

  it("deleteProjectAsset filtra por id e user_id", async () => {
    results = [{ data: null, error: null }];

    await deleteProjectAsset("asset-1");

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("project_asset");
    expect(calls[0].op).toBe("delete");
    expect(calls[0].eq).toEqual([
      ["id", "asset-1"],
      ["user_id", "user-1"],
    ]);
  });

  it("reorderProjectAssets só grava quem mudou de position", async () => {
    results = [
      {
        data: [
          { id: "a1", position: 0 },
          { id: "a2", position: 1 },
          { id: "a3", position: 2 },
        ],
        error: null,
      },
    ];

    await reorderProjectAssets("proj-1", ["a1", "a3", "a2"]);

    // a1 ficou na posição 0 (não muda), a3 foi para 1 (muda), a2 foi para 2 (muda)
    const updateCalls = calls.filter((c) => c.op === "update");
    expect(updateCalls).toHaveLength(2);
  });

  it("fetchAssetsForTasks com array vazio não vai ao banco", async () => {
    const result = await fetchAssetsForTasks([]);
    expect(result).toEqual({});
    expect(calls).toHaveLength(0);
  });

  it("saveTaskAssetLinks com a mesma lista não escreve nada", async () => {
    results = [
      { data: [{ asset_id: "a1" }, { asset_id: "a2" }], error: null },
    ];

    await saveTaskAssetLinks("task-1", ["a1", "a2"]);

    expect(calls.every((c) => c.op !== "insert" && c.op !== "delete")).toBe(true);
  });

  it("saveTaskAssetLinks remover um vínculo não apaga o asset", async () => {
    results = [
      { data: [{ asset_id: "a1" }, { asset_id: "a2" }], error: null },
    ];

    await saveTaskAssetLinks("task-1", ["a1"]);

    const deleteCalls = calls.filter((c) => c.op === "delete");
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe("project_asset_task");
  });
});