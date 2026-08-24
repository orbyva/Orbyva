import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchExternalLinksForTask,
  fetchExternalLinksForTasks,
  saveExternalLinksForTask,
} from "@/api/tasks/taskExternalLinks";
import type { TaskExternalLink } from "@/types/tasks";

/**
 * Mesmo duplo do query builder de `src/api/notes/__tests__/noteLinks-api.test.ts`: sem Supabase
 * local, o I/O é verificado gravando a query montada (tabela, filtros, ordenação, payload). É o que
 * prova, sem navegador, que todo acesso a `task_external_link` é escopado em `user_id` — o mesmo
 * escopo que a RLS exige e que o índice `(user_id, task_id)` cobre — e que a gravação em bloco
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

function link(over: Partial<TaskExternalLink> & { url: string }): TaskExternalLink {
  return {
    id: `id-${over.url}`,
    user_id: "user-1",
    task_id: "t1",
    comment: null,
    position: 0,
    ...over,
  };
}

describe("api/taskExternalLinks", () => {
  it("fetchExternalLinksForTasks agrupa por tarefa numa consulta só, escopada no usuário", async () => {
    const a = link({ url: "https://github.com/o/r/issues/1", task_id: "t1", position: 0 });
    const b = link({ url: "https://docs.google.com/x", task_id: "t1", position: 1 });
    const c = link({ url: "https://figma.com/y", task_id: "t2", position: 0 });
    results = [{ data: [a, b, c], error: null }];

    await expect(fetchExternalLinksForTasks(["t1", "t2", "t1"])).resolves.toEqual({
      t1: [a, b],
      t2: [c],
    });

    // Uma consulta basta: ao contrário de `fetchNotesLinkedToMany`, não há segunda tabela para
    // resolver — o link inteiro mora na própria linha.
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("task_external_link");
    expect(calls[0].eq).toEqual([["user_id", "user-1"]]);
    // Ids repetidos entram uma vez só.
    expect(calls[0].in).toEqual(["task_id", ["t1", "t2"]]);
    expect(calls[0].order).toEqual(["position", { ascending: true }]);
  });

  it("tarefa sem link nenhum sai do mapa sem chave", async () => {
    const only = link({ url: "https://exemplo.com", task_id: "t1" });
    results = [{ data: [only], error: null }];

    const map = await fetchExternalLinksForTasks(["t1", "t2"]);
    expect(map).toEqual({ t1: [only] });
    expect("t2" in map).toBe(false);
    expect(map.t2 ?? []).toEqual([]);
  });

  it("fetchExternalLinksForTasks sem id nenhum nem consulta o banco", async () => {
    await expect(fetchExternalLinksForTasks([])).resolves.toEqual({});
    expect(calls).toHaveLength(0);
  });

  it("fetchExternalLinksForTask delega para o lote e devolve só os da tarefa", async () => {
    const mine = link({ url: "https://exemplo.com/a", task_id: "t1" });
    results = [{ data: [mine], error: null }];

    await expect(fetchExternalLinksForTask("t1")).resolves.toEqual([mine]);
    expect(calls).toHaveLength(1);
    expect(calls[0].in).toEqual(["task_id", ["t1"]]);
  });

  it("fetchExternalLinksForTask devolve [] quando a tarefa não tem link", async () => {
    results = [{ data: [], error: null }];
    await expect(fetchExternalLinksForTask("t1")).resolves.toEqual([]);
  });

  it("saveExternalLinksForTask apaga só o que saiu, insere só o que entrou e não reescreve o que não mudou", async () => {
    const fica = link({ url: "https://fica.com", position: 0, comment: "importante" });
    const sai = link({ url: "https://sai.com", position: 1, id: "id-sai" });
    results = [
      // 1) leitura do estado atual
      { data: [fica, sai], error: null },
      // 2) delete   3) insert
      { data: null, error: null },
      { data: null, error: null },
      // 4) releitura final
      { data: [fica], error: null },
    ];

    await saveExternalLinksForTask("t1", [
      { url: "https://fica.com", comment: "importante", position: 0 },
      { url: "https://entra.com", comment: "novo", position: 1 },
    ]);

    const [, del, ins, reread] = calls;
    expect(del.op).toBe("delete");
    expect(del.eq).toEqual([["user_id", "user-1"]]);
    expect(del.in).toEqual(["id", ["id-sai"]]);

    expect(ins.op).toBe("insert");
    expect(ins.payload).toEqual([
      {
        user_id: "user-1",
        task_id: "t1",
        url: "https://entra.com",
        comment: "novo",
        position: 1,
      },
    ]);

    // O link que ficou igual não gerou update nenhum: só leitura, delete, insert e releitura.
    expect(calls.filter((c) => c.op === "update")).toEqual([]);
    expect(calls).toHaveLength(4);
    expect(reread.table).toBe("task_external_link");
  });

  it("saveExternalLinksForTask atualiza comment e position de quem ficou, uma linha por vez e escopado no usuário", async () => {
    const primeiro = link({ url: "https://a.com", position: 0, id: "id-a", comment: null });
    const segundo = link({ url: "https://b.com", position: 1, id: "id-b", comment: "velho" });
    results = [
      { data: [primeiro, segundo], error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [], error: null },
    ];

    // Inverte a ordem e reescreve o comentário do segundo.
    await saveExternalLinksForTask("t1", [
      { url: "https://b.com", comment: "novo comentário", position: 0 },
      { url: "https://a.com", comment: null, position: 1 },
    ]);

    const updates = calls.filter((c) => c.op === "update");
    expect(updates).toHaveLength(2);
    expect(updates[0].payload).toEqual({ comment: "novo comentário", position: 0 });
    expect(updates[0].eq).toEqual([
      ["id", "id-b"],
      ["user_id", "user-1"],
    ]);
    expect(updates[1].payload).toEqual({ comment: null, position: 1 });
    expect(updates[1].eq).toEqual([
      ["id", "id-a"],
      ["user_id", "user-1"],
    ]);
    // Nada entrou nem saiu: só os dois updates entre a leitura e a releitura.
    expect(calls.filter((c) => c.op === "insert" || c.op === "delete")).toEqual([]);
  });

  it("saveExternalLinksForTask grava comentário vazio como null e apara espaços do comentário", async () => {
    results = [
      { data: [], error: null },
      { data: null, error: null },
      { data: [], error: null },
    ];

    await saveExternalLinksForTask("t1", [
      { url: "https://a.com", comment: "   ", position: 0 },
      { url: "https://b.com", comment: "  vale a pena  ", position: 1 },
    ]);

    const insert = calls.find((c) => c.op === "insert");
    expect(insert?.payload).toEqual([
      { user_id: "user-1", task_id: "t1", url: "https://a.com", comment: null, position: 0 },
      {
        user_id: "user-1",
        task_id: "t1",
        url: "https://b.com",
        comment: "vale a pena",
        position: 1,
      },
    ]);
  });

  it("saveExternalLinksForTask com lista vazia apaga tudo e não insere nada", async () => {
    const um = link({ url: "https://a.com", id: "id-a" });
    const dois = link({ url: "https://b.com", id: "id-b" });
    results = [
      { data: [um, dois], error: null },
      { data: null, error: null },
      { data: [], error: null },
    ];

    await expect(saveExternalLinksForTask("t1", [])).resolves.toEqual([]);
    const del = calls.find((c) => c.op === "delete");
    expect(del?.in).toEqual(["id", ["id-a", "id-b"]]);
    expect(calls.filter((c) => c.op === "insert")).toEqual([]);
  });

  it("saveExternalLinksForTask renumera a position pela ordem da lista, ignorando a que veio no draft", async () => {
    results = [
      { data: [], error: null },
      { data: null, error: null },
      { data: [], error: null },
    ];

    await saveExternalLinksForTask("t1", [
      { url: "https://a.com", comment: null, position: 42 },
      { url: "https://b.com", comment: null, position: 7 },
    ]);

    const insert = calls.find((c) => c.op === "insert");
    expect((insert?.payload as { position: number }[]).map((row) => row.position)).toEqual([0, 1]);
  });

  it("todo acesso a task_external_link é escopado em user_id", async () => {
    const antigo = link({ url: "https://sai.com", id: "id-sai" });
    results = [
      { data: [antigo], error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [], error: null },
    ];

    await saveExternalLinksForTask("t1", [
      { url: "https://entra.com", comment: null, position: 0 },
    ]);

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.table).toBe("task_external_link");
      // O insert leva o `user_id` no payload (o `with check` da RLS é sobre a linha gravada);
      // leitura, delete e update levam no filtro.
      if (call.op === "insert") {
        for (const row of call.payload as { user_id: string }[]) {
          expect(row.user_id).toBe("user-1");
        }
      } else {
        expect(call.eq).toContainEqual(["user_id", "user-1"]);
      }
    }
  });

  it("erro do PostgREST vira Error com a mensagem original, na leitura e na gravação", async () => {
    results = [{ data: null, error: { message: "row level security" } }];
    await expect(fetchExternalLinksForTasks(["t1"])).rejects.toThrow("row level security");

    results = [
      { data: [link({ url: "https://sai.com", id: "id-sai" })], error: null },
      { data: null, error: { message: "delete falhou" } },
    ];
    await expect(saveExternalLinksForTask("t1", [])).rejects.toThrow("delete falhou");

    results = [
      { data: [], error: null },
      { data: null, error: { message: "duplicate key value" } },
    ];
    await expect(
      saveExternalLinksForTask("t1", [{ url: "https://a.com", comment: null, position: 0 }])
    ).rejects.toThrow("duplicate key value");

    results = [
      { data: [link({ url: "https://a.com", id: "id-a", position: 0 })], error: null },
      { data: null, error: { message: "update falhou" } },
    ];
    await expect(
      saveExternalLinksForTask("t1", [{ url: "https://a.com", comment: "novo", position: 0 }])
    ).rejects.toThrow("update falhou");
  });
});
