import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNoteFolder,
  deleteNoteFolder,
  fetchNoteFolders,
  updateNoteFolder,
} from "@/api/notes/folders";
import type { NoteFolder } from "@/types/notes";

/**
 * Mesmo duplo do query builder de `notes-api.test.ts`. `deleteNoteFolder` faz várias idas ao
 * banco (listar, reparentar filhos, apagar), então cada `from()` consome o próximo item da fila
 * `results`.
 */

interface Call {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  eq: [string, unknown][];
  order?: [string, { ascending: boolean }];
  single: boolean;
}

const calls: Call[] = [];
let results: { data: unknown; error: { message: string } | null }[] = [];

function takeResult() {
  return results.length > 0
    ? results.shift()!
    : { data: null, error: null };
}

function makeBuilder(table: string) {
  const call: Call = {
    table,
    op: "select",
    eq: [],
    single: false,
  };
  calls.push(call);
  const builder = {
    select() {
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
    order(column: string, options: { ascending: boolean }) {
      call.order = [column, options];
      return Promise.resolve(takeResult());
    },
    single() {
      call.single = true;
      return Promise.resolve(takeResult());
    },
    then(
      resolve: (value: ReturnType<typeof takeResult>) => unknown,
      reject?: (reason: unknown) => unknown
    ) {
      return Promise.resolve(takeResult()).then(resolve, reject);
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
  results = [];
});

function lastCall(): Call {
  return calls[calls.length - 1];
}

const raiz: NoteFolder = {
  id: "a",
  name: "Casa",
  parent_id: null,
  project_id: null,
  tag_id: null,
};
const filha: NoteFolder = {
  id: "b",
  name: "Obra",
  parent_id: "a",
  project_id: null,
  tag_id: null,
};
const neta: NoteFolder = {
  id: "c",
  name: "Banheiro",
  parent_id: "b",
  project_id: null,
  tag_id: null,
};

describe("api/notes/folders", () => {
  it("fetchNoteFolders lê note_folder do usuário, por nome", async () => {
    results = [{ data: [raiz], error: null }];
    await expect(fetchNoteFolders()).resolves.toEqual([raiz]);
    expect(lastCall().table).toBe("note_folder");
    expect(lastCall().eq).toEqual([["user_id", "user-1"]]);
    expect(lastCall().order).toEqual(["name", { ascending: true }]);
  });

  it("fetchNoteFolders devolve [] quando o data vem nulo", async () => {
    results = [{ data: null, error: null }];
    await expect(fetchNoteFolders()).resolves.toEqual([]);
  });

  it("createNoteFolder injeta user_id e normaliza o rascunho", async () => {
    const created = { ...raiz, name: "Nova" };
    results = [
      { data: [], error: null },
      { data: created, error: null },
    ];
    await expect(
      createNoteFolder({
        name: "  Nova  ",
        parent_id: "",
        project_id: "",
        tag_id: "",
      })
    ).resolves.toEqual(created);
    const insert = calls.find((c) => c.op === "insert");
    expect(insert?.payload).toEqual([
      {
        name: "Nova",
        parent_id: null,
        project_id: null,
        tag_id: null,
        user_id: "user-1",
      },
    ]);
    expect(insert?.single).toBe(true);
  });

  it("createNoteFolder recusa um quarto nível", async () => {
    results = [{ data: [raiz, filha, neta], error: null }];
    await expect(
      createNoteFolder({
        name: "Azulejo",
        parent_id: "c",
        project_id: null,
        tag_id: null,
      })
    ).rejects.toThrow("A pasta não pode ter mais de 3 níveis.");
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("createNoteFolder recusa nome vazio sem ir ao insert", async () => {
    await expect(
      createNoteFolder({
        name: "   ",
        parent_id: null,
        project_id: null,
        tag_id: null,
      })
    ).rejects.toThrow("A pasta precisa de um nome.");
    expect(calls).toHaveLength(0);
  });

  it("updateNoteFolder recusa ciclo / teto antes de gravar", async () => {
    results = [{ data: [raiz, filha, neta], error: null }];
    await expect(
      updateNoteFolder({ id: "a", parent_id: "c" })
    ).rejects.toThrow("Essa mudança deixaria a pasta com mais de 3 níveis.");
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });

  it("updateNoteFolder grava o patch escopado no usuário", async () => {
    results = [
      { data: [raiz, filha], error: null },
      { data: null, error: null },
    ];
    await updateNoteFolder({ id: "b", name: "  Reforma  ", project_id: "p1" });
    const update = calls.find((c) => c.op === "update");
    expect(update?.payload).toEqual({
      name: "Reforma",
      project_id: "p1",
    });
    expect(update?.eq).toEqual([
      ["id", "b"],
      ["user_id", "user-1"],
    ]);
  });

  it("deleteNoteFolder reparenta os filhos antes de apagar", async () => {
    results = [
      { data: [raiz, filha, neta], error: null },
      { data: null, error: null },
      { data: null, error: null },
    ];
    await deleteNoteFolder("b");
    const ops = calls.map((c) => c.op);
    expect(ops).toEqual(["select", "update", "delete"]);
    expect(calls[1].payload).toEqual({ parent_id: "a" });
    expect(calls[1].eq).toEqual([
      ["id", "c"],
      ["user_id", "user-1"],
    ]);
    expect(calls[2].eq).toEqual([
      ["id", "b"],
      ["user_id", "user-1"],
    ]);
  });

  it("erro do PostgREST vira Error com a mensagem original", async () => {
    results = [{ data: null, error: { message: "row level security" } }];
    await expect(fetchNoteFolders()).rejects.toThrow("row level security");
  });
});
