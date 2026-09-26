import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateTasksSortOrder } from "@/api/tasks";

/**
 * Feature 082 — a reordenação do painel "Por prioridade" é gravada com **uma escrita só** para a
 * faixa inteira, e escopada ao dono.
 *
 * O Supabase falso abaixo guarda linhas de verdade e executa os filtros (`in`, `eq`), então cada
 * assertiva olha o estado final da tabela e a contagem de escritas — não a query montada. É o que
 * prova, sem navegador e sem banco, as três coisas que a feature promete aqui:
 *
 * 1. N tarefas renumeradas custam **um** `upsert` (não N `updateTask`);
 * 2. id alheio/inexistente não vira linha nova nem reordena nada;
 * 3. erro do banco sobe para o chamador (é ele quem reverte a ordem otimista e mostra o toast).
 */

type Row = Record<string, unknown> & { id: string };

const { store } = vi.hoisted(() => ({
  store: {
    rows: [] as Row[],
    readError: null as string | null,
    writeError: null as string | null,
    upserts: 0,
    selects: 0,
    lastUpsert: null as Row[] | null,
  },
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@/lib/supabase", () => {
  function from(table: string) {
    if (table !== "task") throw new Error(`tabela inesperada: ${table}`);
    const predicates: ((row: Row) => boolean)[] = [];
    let columns = "*";

    const builder = {
      select(cols?: string) {
        store.selects += 1;
        columns = cols ?? "*";
        return builder;
      },
      upsert(rows: Row[], options?: { onConflict?: string }) {
        store.upserts += 1;
        store.lastUpsert = rows;
        if (options?.onConflict !== "id") {
          throw new Error(`onConflict inesperado: ${String(options?.onConflict)}`);
        }
        if (store.writeError) {
          return Promise.resolve({ data: null, error: { message: store.writeError } });
        }
        for (const incoming of rows) {
          const existing = store.rows.find((row) => row.id === incoming.id);
          // Um upsert de verdade **insere** quando não acha o id: é exatamente o acidente que a
          // implementação precisa evitar, então o falso reproduz isso em vez de ignorar.
          if (existing) Object.assign(existing, incoming);
          else store.rows.push({ ...incoming });
        }
        return Promise.resolve({ data: null, error: null });
      },
      eq(column: string, value: unknown) {
        predicates.push((row) => row[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        predicates.push((row) => values.includes(row[column]));
        return builder;
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        if (store.readError) {
          return Promise.resolve({ data: null, error: { message: store.readError } }).then(
            resolve,
            reject
          );
        }
        const hit = store.rows.filter((row) => predicates.every((p) => p(row)));
        const projected = hit.map((row) => {
          if (columns === "*") return { ...row };
          const out: Row = { id: row.id };
          for (const col of columns.split(",").map((c) => c.trim())) out[col] = row[col];
          return out;
        });
        return Promise.resolve({ data: projected, error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  return { supabase: { from } };
});

function seed() {
  store.rows = [
    { id: "a", user_id: "user-1", title: "Assinar contrato", priority: "high", sort_order: 0 },
    { id: "b", user_id: "user-1", title: "Ligar para o cliente", priority: "high", sort_order: 0 },
    { id: "c", user_id: "user-1", title: "Revisar proposta", priority: "high", sort_order: 0 },
    { id: "alheia", user_id: "user-2", title: "Tarefa do vizinho", priority: "high", sort_order: 0 },
  ];
  store.readError = null;
  store.writeError = null;
  store.upserts = 0;
  store.selects = 0;
  store.lastUpsert = null;
}

function orderOf(ids: string[]): number[] {
  return ids.map((id) => store.rows.find((row) => row.id === id)?.sort_order as number);
}

describe("updateTasksSortOrder", () => {
  beforeEach(() => {
    seed();
    vi.clearAllMocks();
  });

  it("grava a faixa inteira numa escrita só", async () => {
    await updateTasksSortOrder([
      { id: "b", sort_order: 0 },
      { id: "a", sort_order: 1 },
      { id: "c", sort_order: 2 },
    ]);

    expect(store.upserts).toBe(1);
    expect(orderOf(["b", "a", "c"])).toEqual([0, 1, 2]);
    expect(store.rows).toHaveLength(4); // nada de linha nova
  });

  it("carimba updated_at e o dono em cada linha do lote", async () => {
    await updateTasksSortOrder([
      { id: "a", sort_order: 0 },
      { id: "b", sort_order: 1 },
    ]);

    expect(store.lastUpsert).toHaveLength(2);
    for (const row of store.lastUpsert ?? []) {
      expect(row.user_id).toBe("user-1");
      expect(typeof row.updated_at).toBe("string");
      // `title` é `not null` sem default: sem ele o upsert estouraria antes do `on conflict`.
      expect(row.title).toBeTruthy();
    }
    // Um único carimbo para o lote inteiro — a faixa foi reordenada num gesto só.
    const stamps = new Set((store.lastUpsert ?? []).map((row) => row.updated_at));
    expect(stamps.size).toBe(1);
  });

  it("lista vazia não chama o banco", async () => {
    await updateTasksSortOrder([]);
    expect(store.selects).toBe(0);
    expect(store.upserts).toBe(0);
  });

  it("id de outro usuário não reordena nada nem vira linha nova", async () => {
    await updateTasksSortOrder([{ id: "alheia", sort_order: 5 }]);

    expect(store.upserts).toBe(0);
    expect(store.rows).toHaveLength(4);
    expect(orderOf(["alheia"])).toEqual([0]);
  });

  it("id inexistente é descartado, e o resto do lote grava normalmente", async () => {
    await updateTasksSortOrder([
      { id: "a", sort_order: 0 },
      { id: "fantasma", sort_order: 1 },
    ]);

    expect(store.upserts).toBe(1);
    expect(store.rows).toHaveLength(4);
    expect((store.lastUpsert ?? []).map((row) => row.id)).toEqual(["a"]);
  });

  it("erro de escrita sobe para o chamador (é ele quem reverte a ordem otimista)", async () => {
    store.writeError = "permission denied";
    await expect(
      updateTasksSortOrder([
        { id: "a", sort_order: 1 },
        { id: "b", sort_order: 0 },
      ])
    ).rejects.toThrow("permission denied");
  });

  it("erro de leitura também sobe, sem tentar escrever", async () => {
    store.readError = "connection lost";
    await expect(updateTasksSortOrder([{ id: "a", sort_order: 1 }])).rejects.toThrow(
      "connection lost"
    );
    expect(store.upserts).toBe(0);
  });
});
