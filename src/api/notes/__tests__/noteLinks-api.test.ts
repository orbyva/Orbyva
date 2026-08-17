import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addNoteLink,
  fetchLinksForNote,
  fetchNotesLinkedTo,
  removeNoteLink,
} from "@/api/notes/noteLinks";

/**
 * Mesmo duplo do query builder de `notes-api.test.ts`/`shopping-api.test.ts`: sem Supabase local, o
 * I/O é verificado gravando a query montada (tabela, filtros, ordenação, payload). É o que prova,
 * sem navegador, que todo acesso a `note_link` é escopado em `user_id` — o mesmo escopo que a RLS
 * exige e que os índices `(user_id, …)` cobrem — e que erro do PostgREST vira `Error`.
 */

interface Call {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  select?: string;
  payload?: unknown;
  eq: [string, unknown][];
  in?: [string, unknown[]];
  order?: [string, { ascending: boolean }];
  single: boolean;
}

const calls: Call[] = [];
/** Resultado por tabela, na ordem em que a tabela é consultada (fetchNotesLinkedTo faz duas). */
let results: { data: unknown; error: { message: string } | null }[] = [];

function nextResult() {
  return results.length > 1
    ? (results.shift() as { data: unknown; error: { message: string } | null })
    : results[0];
}

function makeBuilder(table: string) {
  const call: Call = { table, op: "select", eq: [], single: false };
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
      return Promise.resolve(nextResult());
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

function lastCall(): Call {
  return calls[calls.length - 1];
}

describe("api/noteLinks", () => {
  it("fetchLinksForNote lê note_link da nota, escopado no usuário e em ordem de criação", async () => {
    const row = {
      id: "l1",
      note_id: "n1",
      entity_type: "goal",
      entity_id: "g1",
      label: "Reformar a casa",
    };
    results = [{ data: [row], error: null }];

    await expect(fetchLinksForNote("n1")).resolves.toEqual([row]);
    expect(lastCall().table).toBe("note_link");
    expect(lastCall().eq).toEqual([
      ["user_id", "user-1"],
      ["note_id", "n1"],
    ]);
    expect(lastCall().order).toEqual(["created_at", { ascending: true }]);
  });

  it("fetchLinksForNote devolve [] quando o data vem nulo", async () => {
    results = [{ data: null, error: null }];
    await expect(fetchLinksForNote("n1")).resolves.toEqual([]);
  });

  it("fetchNotesLinkedTo consulta o vínculo pela entidade e depois busca as notas pelos ids", async () => {
    const note = { id: "n1", title: "Materiais", content: "", project_id: null };
    results = [
      { data: [{ note_id: "n1" }, { note_id: "n2" }], error: null },
      { data: [note], error: null },
    ];

    await expect(fetchNotesLinkedTo("goal", "g1")).resolves.toEqual([note]);

    const [linkQuery, noteQuery] = calls;
    expect(linkQuery.table).toBe("note_link");
    expect(linkQuery.select).toBe("note_id");
    expect(linkQuery.eq).toEqual([
      ["user_id", "user-1"],
      ["entity_type", "goal"],
      ["entity_id", "g1"],
    ]);
    // A segunda consulta é escopada no usuário também: id vindo do vínculo não é passe livre.
    expect(noteQuery.table).toBe("note");
    expect(noteQuery.eq).toEqual([["user_id", "user-1"]]);
    expect(noteQuery.in).toEqual(["id", ["n1", "n2"]]);
    expect(noteQuery.order).toEqual(["updated_at", { ascending: false }]);
  });

  it("fetchNotesLinkedTo sem vínculo nenhum nem vai buscar notas", async () => {
    results = [{ data: [], error: null }];
    await expect(fetchNotesLinkedTo("goal", "g1")).resolves.toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("fetchNotesLinkedTo não repete id quando duas linhas apontam para a mesma nota", async () => {
    results = [
      { data: [{ note_id: "n1" }, { note_id: "n1" }], error: null },
      { data: [], error: null },
    ];
    await fetchNotesLinkedTo("book", "b1");
    expect(calls[1].in).toEqual(["id", ["n1"]]);
  });

  it("addNoteLink injeta o user_id e devolve a linha criada", async () => {
    const created = {
      id: "l1",
      note_id: "n1",
      entity_type: "trip",
      entity_id: "t1",
      label: "Chile",
    };
    results = [{ data: created, error: null }];

    await expect(
      addNoteLink({
        note_id: "n1",
        entity_type: "trip",
        entity_id: "t1",
        label: "  Chile  ",
      })
    ).resolves.toEqual(created);

    expect(lastCall().table).toBe("note_link");
    expect(lastCall().op).toBe("insert");
    expect(lastCall().payload).toEqual([
      {
        note_id: "n1",
        entity_type: "trip",
        entity_id: "t1",
        // Rótulo sem espaço sobrando.
        label: "Chile",
        user_id: "user-1",
      },
    ]);
    expect(lastCall().single).toBe(true);
  });

  it("addNoteLink com rótulo vazio grava null, não string vazia", async () => {
    results = [{ data: {}, error: null }];
    await addNoteLink({
      note_id: "n1",
      entity_type: "habit",
      entity_id: "h1",
      label: "   ",
    });
    expect((lastCall().payload as { label: unknown }[])[0].label).toBeNull();

    results = [{ data: {}, error: null }];
    await addNoteLink({ note_id: "n1", entity_type: "habit", entity_id: "h2" });
    expect((lastCall().payload as { label: unknown }[])[0].label).toBeNull();
  });

  it("removeNoteLink apaga o vínculo escopado no usuário", async () => {
    results = [{ data: null, error: null }];
    await removeNoteLink("l1");

    expect(lastCall().op).toBe("delete");
    expect(lastCall().table).toBe("note_link");
    expect(lastCall().eq).toEqual([
      ["id", "l1"],
      ["user_id", "user-1"],
    ]);
  });

  it("erro do PostgREST vira Error com a mensagem original, nas quatro funções", async () => {
    results = [{ data: null, error: { message: "row level security" } }];
    await expect(fetchLinksForNote("n1")).rejects.toThrow("row level security");

    results = [{ data: null, error: { message: "permission denied" } }];
    await expect(fetchNotesLinkedTo("goal", "g1")).rejects.toThrow("permission denied");

    results = [{ data: null, error: { message: "duplicate key value" } }];
    await expect(
      addNoteLink({ note_id: "n1", entity_type: "goal", entity_id: "g1" })
    ).rejects.toThrow("duplicate key value");

    results = [{ data: null, error: { message: "no rows" } }];
    await expect(removeNoteLink("l1")).rejects.toThrow("no rows");
  });

  it("erro ao buscar as notas da consulta reversa também sobe", async () => {
    results = [
      { data: [{ note_id: "n1" }], error: null },
      { data: null, error: { message: "boom" } },
    ];
    await expect(fetchNotesLinkedTo("movie", "m1")).rejects.toThrow("boom");
  });
});
