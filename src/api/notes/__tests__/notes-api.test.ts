import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNote,
  deleteNote,
  fetchNote,
  fetchNotes,
  fetchNotesMentioning,
  updateNote,
} from "@/api/notes/notes";

/**
 * Mesmo duplo do query builder de `src/api/shopping/__tests__/shopping-api.test.ts`: sem Supabase
 * local, o I/O é verificado gravando a query montada (tabela, filtros `eq`, ordenação, payload).
 * É o que prova, sem navegador, que cada função lê/escreve `note` sempre escopada em `user_id` —
 * o mesmo escopo que a RLS exige — e que erro do PostgREST vira `Error` para o `getErrorMessage`.
 */

interface Call {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  eq: [string, unknown][];
  neq?: [string, unknown];
  ilike?: [string, string];
  order?: [string, { ascending: boolean }];
  single: boolean;
  maybeSingle: boolean;
}

const calls: Call[] = [];
let nextResult: { data: unknown; error: { message: string } | null } = {
  data: [],
  error: null,
};

function makeBuilder(table: string) {
  const call: Call = {
    table,
    op: "select",
    eq: [],
    single: false,
    maybeSingle: false,
  };
  calls.push(call);
  const builder = {
    select: () => builder,
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
    neq(column: string, value: unknown) {
      call.neq = [column, value];
      return builder;
    },
    ilike(column: string, pattern: string) {
      call.ilike = [column, pattern];
      return builder;
    },
    order(column: string, options: { ascending: boolean }) {
      call.order = [column, options];
      return Promise.resolve(nextResult);
    },
    single() {
      call.single = true;
      return Promise.resolve(nextResult);
    },
    maybeSingle() {
      call.maybeSingle = true;
      return Promise.resolve(nextResult);
    },
    then(
      resolve: (value: typeof nextResult) => unknown,
      reject?: (reason: unknown) => unknown
    ) {
      return Promise.resolve(nextResult).then(resolve, reject);
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
  nextResult = { data: [], error: null };
});

function lastCall(): Call {
  return calls[calls.length - 1];
}

describe("api/notes", () => {
  it("fetchNotes lê note do usuário, editada mais recentemente primeiro", async () => {
    const row = { id: "n1", title: "Reforma", content: "", project_id: null };
    nextResult = { data: [row], error: null };

    await expect(fetchNotes()).resolves.toEqual([row]);
    expect(lastCall().table).toBe("note");
    expect(lastCall().eq).toEqual([["user_id", "user-1"]]);
    expect(lastCall().order).toEqual(["updated_at", { ascending: false }]);
  });

  it("fetchNotes com projectId acrescenta o filtro do vínculo com projeto", async () => {
    nextResult = { data: [], error: null };
    await fetchNotes({ projectId: "p1" });
    expect(lastCall().eq).toEqual([
      ["user_id", "user-1"],
      ["project_id", "p1"],
    ]);
  });

  it("fetchNotes sem projeto (null) não filtra por project_id", async () => {
    nextResult = { data: [], error: null };
    await fetchNotes({ projectId: null });
    expect(lastCall().eq).toEqual([["user_id", "user-1"]]);
  });

  it("fetchNotes devolve [] quando o data vem nulo", async () => {
    nextResult = { data: null, error: null };
    await expect(fetchNotes()).resolves.toEqual([]);
  });

  it("fetchNote busca por id + user_id e devolve null quando não acha", async () => {
    nextResult = { data: null, error: null };
    await expect(fetchNote("n1")).resolves.toBeNull();
    expect(lastCall().table).toBe("note");
    expect(lastCall().maybeSingle).toBe(true);
    expect(lastCall().eq).toEqual([
      ["id", "n1"],
      ["user_id", "user-1"],
    ]);
  });

  it("createNote injeta o user_id e normaliza o rascunho antes de gravar", async () => {
    const created = { id: "n1", title: "Sem título" };
    nextResult = { data: created, error: null };

    await expect(
      createNote({ title: "   ", content: "corpo", project_id: "" })
    ).resolves.toEqual(created);
    expect(lastCall().table).toBe("note");
    // Título vazio virou "Sem título" (coluna not null), project_id "" virou null (FK) e o
    // rascunho sem `kind` foi gravado como markdown, o default da coluna (feature 058).
    expect(lastCall().payload).toEqual([
      {
        title: "Sem título",
        content: "corpo",
        project_id: null,
        kind: "markdown",
        canvas_data: null,
        user_id: "user-1",
      },
    ]);
    expect(lastCall().single).toBe(true);
  });

  it("createNote grava o canvas com kind = 'canvas' e o desenho em canvas_data", async () => {
    const created = { id: "n2", title: "Arquitetura" };
    nextResult = { data: created, error: null };
    const canvas_data = { elements: [{ id: "r1", type: "rectangle" }] };

    await createNote({
      title: "Arquitetura",
      content: "",
      project_id: null,
      kind: "canvas",
      canvas_data,
    });

    expect(lastCall().payload).toEqual([
      {
        title: "Arquitetura",
        content: "",
        project_id: null,
        kind: "canvas",
        canvas_data,
        user_id: "user-1",
      },
    ]);
  });

  it("updateNote filtra por id + user_id e carimba updated_at", async () => {
    nextResult = { data: null, error: null };
    await updateNote({ id: "n1", content: "novo corpo" });

    expect(lastCall().op).toBe("update");
    expect(lastCall().eq).toEqual([
      ["id", "n1"],
      ["user_id", "user-1"],
    ]);
    const payload = lastCall().payload as Record<string, string>;
    expect(payload.content).toBe("novo corpo");
    expect(Number.isNaN(Date.parse(payload.updated_at))).toBe(false);
    expect("id" in payload).toBe(false);
  });

  it("updateNote parcial de conteúdo não inventa título", async () => {
    nextResult = { data: null, error: null };
    await updateNote({ id: "n1", content: "só o corpo" });
    expect("title" in (lastCall().payload as object)).toBe(false);
  });

  it("updateNote normaliza o título quando ele vem, e zera project_id vazio", async () => {
    nextResult = { data: null, error: null };
    await updateNote({ id: "n1", title: "  ", project_id: "" });
    const payload = lastCall().payload as Record<string, unknown>;
    expect(payload.title).toBe("Sem título");
    expect(payload.project_id).toBeNull();
  });

  it("updateNote preserva o vínculo quando um projeto de verdade é escolhido", async () => {
    nextResult = { data: null, error: null };
    await updateNote({ id: "n1", project_id: "p1" });
    expect((lastCall().payload as Record<string, unknown>).project_id).toBe("p1");
  });

  it("deleteNote apaga a nota escopada no usuário", async () => {
    nextResult = { data: null, error: null };
    await deleteNote("n1");

    expect(lastCall().op).toBe("delete");
    expect(lastCall().table).toBe("note");
    expect(lastCall().eq).toEqual([
      ["id", "n1"],
      ["user_id", "user-1"],
    ]);
  });

  it("fetchNotesMentioning busca o padrão [[titulo]] no conteúdo, fora a própria nota", async () => {
    const row = { id: "n2", title: "Reforma", content: "ver [[Materiais]]" };
    nextResult = { data: [row], error: null };

    await expect(fetchNotesMentioning("Materiais", "n1")).resolves.toEqual([row]);
    expect(lastCall().table).toBe("note");
    expect(lastCall().eq).toEqual([["user_id", "user-1"]]);
    expect(lastCall().ilike).toEqual(["content", "%[[Materiais]]%"]);
    expect(lastCall().neq).toEqual(["id", "n1"]);
    expect(lastCall().order).toEqual(["updated_at", { ascending: false }]);
  });

  it("fetchNotesMentioning escapa os curingas do LIKE que houver no título", async () => {
    nextResult = { data: [], error: null };
    // Sem escape, um título com `%` casaria com o conteúdo de todas as notas.
    await fetchNotesMentioning("100% do_orçamento");
    expect(lastCall().ilike).toEqual(["content", "%[[100\\% do\\_orçamento]]%"]);
    expect(lastCall().neq).toBeUndefined();
  });

  it("fetchNotesMentioning nem vai ao banco com título vazio", async () => {
    calls.length = 0;
    await expect(fetchNotesMentioning("   ")).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("erro do PostgREST vira Error com a mensagem original", async () => {
    nextResult = { data: null, error: { message: "row level security" } };
    await expect(fetchNotes()).rejects.toThrow("row level security");
    nextResult = { data: null, error: { message: "permission denied" } };
    await expect(deleteNote("n1")).rejects.toThrow("permission denied");
  });
});
