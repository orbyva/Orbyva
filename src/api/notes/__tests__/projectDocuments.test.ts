import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  countProjectDocuments,
  fetchProjectDocuments,
} from "@/api/notes/projectDocuments";

/**
 * Feature 105 — o I/O da aba "Documentos". Mesmo duplo do query builder de `notes-api.test.ts`:
 * sem Supabase local, o que se verifica é a consulta montada (tabela, colunas, filtros).
 *
 * Duas decisões que só um teste segura, porque uma regressão as desfaz sem quebrar nada visível:
 * (1) **nenhuma** consulta manda a lista de ids de tarefa na URL — é o que faria um projeto com
 * centenas de tarefas estourar o limite de URL do servidor; (2) a contagem nunca pede `*`.
 */

interface Call {
  table: string;
  select?: string;
  eq: [string, unknown][];
  in?: [string, unknown[]];
  order?: [string, { ascending: boolean }];
}

const calls: Call[] = [];
/** Resultado de cada consulta, na ordem em que ela é **montada** (posição em `calls`). */
let results: { data: unknown; error?: { message: string } | null }[] = [];

function makeBuilder(table: string) {
  const call: Call = { table, eq: [] };
  const index = calls.push(call) - 1;
  const resolve = () =>
    Promise.resolve(results[index] ?? { data: [], error: null });
  const builder = {
    select(columns?: string) {
      call.select = columns;
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
      return resolve();
    },
    then(
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) {
      return resolve().then(onFulfilled, onRejected);
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

const note = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Nota ${id}`,
  content: "",
  project_id: null,
  kind: "markdown",
  canvas_data: null,
  updated_at: "2026-08-20T10:00:00.000Z",
  ...extra,
});

/** As três consultas de origem: notas do projeto, tarefas do projeto, vínculos do usuário. */
function seedSources(options: {
  notes?: unknown[];
  tasks?: unknown[];
  links?: unknown[];
  linked?: unknown[];
}) {
  results = [
    { data: options.notes ?? [], error: null },
    { data: options.tasks ?? [], error: null },
    { data: options.links ?? [], error: null },
    { data: options.linked ?? [], error: null },
  ];
}

describe("api/notes/projectDocuments", () => {
  it("busca as três origens e devolve a união com a origem anexada", async () => {
    seedSources({
      notes: [note("n1", { project_id: "p1" })],
      tasks: [{ id: "t1" }, { id: "t2" }],
      links: [
        { note_id: "c1", entity_type: "task", entity_id: "t1", label: "Trocar a fiação" },
        { note_id: "n2", entity_type: "project", entity_id: "p1", label: null },
      ],
      linked: [note("c1", { kind: "canvas" }), note("n2")],
    });

    const documents = await fetchProjectDocuments("p1");

    expect(documents.map((d) => d.id).sort()).toEqual(["c1", "n1", "n2"]);
    expect(documents.find((d) => d.id === "c1")?.taskLabel).toBe("Trocar a fiação");
    expect(documents.find((d) => d.id === "c1")?.sources).toEqual(["task"]);
    expect(documents.find((d) => d.id === "n1")?.sources).toEqual(["project"]);
    expect(documents.find((d) => d.id === "n2")?.sources).toEqual(["link"]);
  });

  it("as três consultas de origem são note (do projeto), task (do projeto) e note_link", async () => {
    seedSources({});
    await fetchProjectDocuments("p1");

    const [notes, tasks, links] = calls;
    expect(notes.table).toBe("note");
    expect(notes.eq).toEqual([
      ["user_id", "user-1"],
      ["project_id", "p1"],
    ]);
    expect(tasks.table).toBe("task");
    expect(tasks.select).toBe("id");
    expect(tasks.eq).toEqual([
      ["user_id", "user-1"],
      ["project_id", "p1"],
    ]);
    expect(links.table).toBe("note_link");
    // Só os dois tipos que põem um documento num projeto — o resto do union não interessa aqui.
    expect(links.in).toEqual(["entity_type", ["task", "project"]]);
  });

  /**
   * A decisão de URL da feature 105, e o que uma regressão desfaz sem querer: cruzar os ids de
   * tarefa em memória, nunca mandá-los na query string. Um `.in("entity_id", taskIds)` com algumas
   * centenas de tarefas vira uma URL de GET de dezenas de KB.
   */
  it("nenhuma consulta manda a lista de ids de tarefa em .in(\"entity_id\", …)", async () => {
    seedSources({
      tasks: Array.from({ length: 300 }, (_, i) => ({ id: `t${i}` })),
      links: [{ note_id: "n1", entity_type: "task", entity_id: "t7", label: null }],
      linked: [note("n1")],
    });

    await fetchProjectDocuments("p1");

    expect(calls.some((call) => call.in?.[0] === "entity_id")).toBe(false);
    // O cruzamento aconteceu mesmo assim: a nota da tarefa t7 está na lista.
    const inQueries = calls.filter((call) => call.in);
    expect(inQueries.map((call) => call.in?.[0])).toEqual(["entity_type", "id"]);
  });

  it("todas as consultas filtram por user_id — inclusive a que busca por ids vindos do vínculo", async () => {
    seedSources({
      tasks: [{ id: "t1" }],
      links: [{ note_id: "n1", entity_type: "task", entity_id: "t1", label: null }],
      linked: [note("n1")],
    });

    await fetchProjectDocuments("p1");

    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(call.eq).toContainEqual(["user_id", "user-1"]);
    }
    expect(calls[3].table).toBe("note");
    expect(calls[3].in).toEqual(["id", ["n1"]]);
  });

  it("a quarta consulta não acontece quando não sobra nota nenhuma para buscar", async () => {
    // Vínculos existem, mas nenhum é deste projeto: nada a buscar por id.
    seedSources({
      tasks: [{ id: "t1" }],
      links: [
        { note_id: "n9", entity_type: "task", entity_id: "t-de-outro", label: null },
        { note_id: "n8", entity_type: "project", entity_id: "p2", label: null },
      ],
    });

    await expect(fetchProjectDocuments("p1")).resolves.toEqual([]);
    expect(calls).toHaveLength(3);
  });

  it("nota que já veio pelo project_id não é buscada de novo", async () => {
    seedSources({
      notes: [note("n1", { project_id: "p1" })],
      tasks: [{ id: "t1" }],
      links: [{ note_id: "n1", entity_type: "task", entity_id: "t1", label: "Tarefa" }],
    });

    const documents = await fetchProjectDocuments("p1");

    expect(calls).toHaveLength(3);
    expect(documents).toHaveLength(1);
    expect([...documents[0].sources].sort()).toEqual(["project", "task"]);
  });

  it("erro do PostgREST em qualquer origem vira Error com a mensagem original", async () => {
    results = [{ data: null, error: { message: "row level security" } }];
    await expect(fetchProjectDocuments("p1")).rejects.toThrow("row level security");

    calls.length = 0;
    results = [
      { data: [], error: null },
      { data: null, error: { message: "task denied" } },
    ];
    await expect(fetchProjectDocuments("p1")).rejects.toThrow("task denied");

    calls.length = 0;
    results = [
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: { message: "link denied" } },
    ];
    await expect(fetchProjectDocuments("p1")).rejects.toThrow("link denied");

    calls.length = 0;
    results = [
      { data: [], error: null },
      { data: [{ id: "t1" }], error: null },
      {
        data: [{ note_id: "n1", entity_type: "task", entity_id: "t1", label: null }],
        error: null,
      },
      { data: null, error: { message: "note denied" } },
    ];
    await expect(fetchProjectDocuments("p1")).rejects.toThrow("note denied");
  });
});

describe("countProjectDocuments", () => {
  it("conta a união, não só o project_id", async () => {
    seedSources({
      notes: [{ id: "n1" }],
      tasks: [{ id: "t1" }],
      links: [
        { note_id: "c1", entity_type: "task", entity_id: "t1" },
        { note_id: "n2", entity_type: "project", entity_id: "p1" },
        // Vínculo de outro projeto: fora da conta.
        { note_id: "n7", entity_type: "project", entity_id: "p2" },
      ],
      linked: [{ id: "c1" }, { id: "n2" }],
    });

    await expect(countProjectDocuments("p1")).resolves.toBe(3);
  });

  it("nota que chega pelas duas portas conta uma vez só", async () => {
    seedSources({
      notes: [{ id: "n1" }],
      tasks: [{ id: "t1" }],
      links: [{ note_id: "n1", entity_type: "task", entity_id: "t1" }],
    });

    await expect(countProjectDocuments("p1")).resolves.toBe(1);
    // E nem foi buscar: a nota já tinha vindo pelo `project_id`.
    expect(calls).toHaveLength(3);
  });

  it("vínculo para nota apagada (ou escondida pela RLS) não infla o número", async () => {
    seedSources({
      notes: [{ id: "n1" }],
      tasks: [{ id: "t1" }],
      links: [{ note_id: "n-sumida", entity_type: "task", entity_id: "t1" }],
      linked: [],
    });

    await expect(countProjectDocuments("p1")).resolves.toBe(1);
  });

  /** A decisão de custo: contar a união não pode virar "trazer tudo e medir o array". */
  it("nenhuma das consultas da contagem pede `*`", async () => {
    seedSources({
      notes: [{ id: "n1" }],
      tasks: [{ id: "t1" }],
      links: [{ note_id: "c1", entity_type: "task", entity_id: "t1" }],
      linked: [{ id: "c1" }],
    });

    await countProjectDocuments("p1");

    expect(calls).toHaveLength(4);
    expect(calls.map((call) => call.select)).toEqual([
      "id",
      "id",
      "note_id, entity_type, entity_id",
      "id",
    ]);
    expect(calls.some((call) => call.select === "*")).toBe(false);
    expect(calls.some((call) => call.select === undefined)).toBe(false);
  });

  it("projeto sem documento nenhum devolve 0", async () => {
    seedSources({});
    await expect(countProjectDocuments("p1")).resolves.toBe(0);
  });

  it("erro do PostgREST na contagem também vira Error", async () => {
    results = [{ data: null, error: { message: "sem permissão" } }];
    await expect(countProjectDocuments("p1")).rejects.toThrow("sem permissão");
  });
});
