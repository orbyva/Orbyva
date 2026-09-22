import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchNotesMentioningTask } from "@/api/notes/notes";
import { fetchTasksMentioningTask } from "@/api/tasks/tasks";

/**
 * Feature 106 — as duas consultas que alimentam "Referenciada em": quem cita esta tarefa numa
 * **nota** (`note.content`) e quem cita numa **outra tarefa** (`task.description`).
 *
 * Mesmo duplo do query builder de `src/api/notes/__tests__/notes-api.test.ts`: sem Supabase local,
 * o I/O é verificado gravando a query montada (tabela, `eq`, `neq`, `ilike`, ordenação). É o que
 * prova, sem navegador, as três coisas que a feature promete deste lado:
 *
 * 1. o `ilike` é montado com o **esquema junto do id** (`%orbyva-task:<uuid>%`) — só o id casaria
 *    um uuid solto no meio de qualquer texto;
 * 2. as duas consultas são escopadas em `user_id` (o mesmo escopo que a RLS exige), e a de tarefa
 *    exclui a própria tarefa com `neq`;
 * 3. erro do PostgREST vira `Error` com a mensagem original, para o toast da seção.
 */

interface Call {
  table: string;
  select?: string;
  eq: [string, unknown][];
  neq?: [string, unknown];
  ilike?: [string, string];
  order?: [string, { ascending: boolean }];
}

const calls: Call[] = [];
let nextResult: { data: unknown; error: { message: string } | null } = {
  data: [],
  error: null,
};

function makeBuilder(table: string) {
  const call: Call = { table, eq: [] };
  calls.push(call);
  const builder = {
    select(columns?: string) {
      call.select = columns;
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

const TASK_ID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  calls.length = 0;
  nextResult = { data: [], error: null };
});

function lastCall(): Call {
  return calls[calls.length - 1];
}

describe("fetchNotesMentioningTask", () => {
  it("prefiltra notas pelo esquema junto do id, escopadas no usuário", async () => {
    const row = {
      id: "n2",
      title: "Reforma",
      content: `ver [painel](orbyva-task:${TASK_ID})`,
    };
    nextResult = { data: [row], error: null };

    await expect(fetchNotesMentioningTask(TASK_ID)).resolves.toEqual([row]);
    expect(lastCall().table).toBe("note");
    expect(lastCall().eq).toEqual([["user_id", "user-1"]]);
    // O esquema **junto** do id: `%<uuid>%` sozinho casaria um id solto em qualquer texto.
    expect(lastCall().ilike).toEqual(["content", `%orbyva-task:${TASK_ID}%`]);
    expect(lastCall().order).toEqual(["updated_at", { ascending: false }]);
  });

  it("escapa os curingas do LIKE em vez de confiar no formato do id", async () => {
    nextResult = { data: [], error: null };
    await fetchNotesMentioningTask("100%_x");
    expect(lastCall().ilike).toEqual(["content", "%orbyva-task:100\\%\\_x%"]);
  });

  it("nem vai ao banco com id vazio", async () => {
    calls.length = 0;
    await expect(fetchNotesMentioningTask("   ")).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("devolve [] quando o data vem nulo", async () => {
    nextResult = { data: null, error: null };
    await expect(fetchNotesMentioningTask(TASK_ID)).resolves.toEqual([]);
  });

  it("erro do PostgREST vira Error com a mensagem original", async () => {
    nextResult = { data: null, error: { message: "row level security" } };
    await expect(fetchNotesMentioningTask(TASK_ID)).rejects.toThrow(
      "row level security"
    );
  });
});

describe("fetchTasksMentioningTask", () => {
  it("prefiltra descrições pelo esquema junto do id e tira a própria tarefa", async () => {
    const row = {
      id: "t2",
      title: "Preparar a reunião",
      description: `depende de [painel](orbyva-task:${TASK_ID})`,
    };
    nextResult = { data: [row], error: null };

    await expect(fetchTasksMentioningTask(TASK_ID)).resolves.toEqual([row]);
    expect(lastCall().table).toBe("task");
    expect(lastCall().eq).toEqual([["user_id", "user-1"]]);
    // A própria tarefa referenciando a si mesma é ruído, não menção.
    expect(lastCall().neq).toEqual(["id", TASK_ID]);
    expect(lastCall().ilike).toEqual([
      "description",
      `%orbyva-task:${TASK_ID}%`,
    ]);
    expect(lastCall().order).toEqual(["updated_at", { ascending: false }]);
  });

  it("escapa os curingas do LIKE em vez de confiar no formato do id", async () => {
    nextResult = { data: [], error: null };
    await fetchTasksMentioningTask("100%_x");
    expect(lastCall().ilike).toEqual([
      "description",
      "%orbyva-task:100\\%\\_x%",
    ]);
  });

  it("nem vai ao banco com id vazio", async () => {
    calls.length = 0;
    await expect(fetchTasksMentioningTask("   ")).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("devolve [] quando o data vem nulo", async () => {
    nextResult = { data: null, error: null };
    await expect(fetchTasksMentioningTask(TASK_ID)).resolves.toEqual([]);
  });

  it("erro do PostgREST vira Error com a mensagem original", async () => {
    nextResult = { data: null, error: { message: "permission denied" } };
    await expect(fetchTasksMentioningTask(TASK_ID)).rejects.toThrow(
      "permission denied"
    );
  });
});
