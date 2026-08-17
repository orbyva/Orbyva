import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHabit, updateHabit } from "@/api/habits";
import type { HabitCreateRequest } from "@/types/habits";

/**
 * `is_health` (feature 062) atravessando a camada de API: um hábito de saúde é um `habit` comum
 * com a flag ligada, então o que se prova aqui é que a flag chega ao payload do insert/update com
 * o valor certo — e que o hábito comum continua nascendo com `false`, sem depender do default da
 * coluna. O Supabase falso registra os payloads em vez de só contar chamadas.
 */

type Recorded = {
  table: string;
  op: "insert" | "update";
  payload: Record<string, unknown>;
  eq: [string, unknown][];
};

const store = {
  calls: [] as Recorded[],
  /** Mensagem de erro devolvida pelo primeiro insert — simula migration ainda não aplicada. */
  insertError: null as string | null,
};

function makeBuilder(table: string) {
  let current: Recorded | null = null;

  const builder = {
    insert(rows: Record<string, unknown>[]) {
      current = { table, op: "insert", payload: rows[0]!, eq: [] };
      store.calls.push(current);
      return builder;
    },
    update(payload: Record<string, unknown>) {
      current = { table, op: "update", payload, eq: [] };
      store.calls.push(current);
      return {
        eq(column: string, value: unknown) {
          current!.eq.push([column, value]);
          return this;
        },
        then(resolve: (value: { error: null }) => unknown) {
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
    },
    select() {
      return builder;
    },
    single() {
      // Erro só no primeiro insert: é assim que o fallback de `createHabit` é exercitado.
      if (store.insertError && store.calls.filter((c) => c.op === "insert").length === 1) {
        return Promise.resolve({ data: null, error: { message: store.insertError } });
      }
      return Promise.resolve({
        data: { id: "h1", ...current!.payload },
        error: null,
      });
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

const draft = (over: Partial<HabitCreateRequest> = {}): HabitCreateRequest => ({
  name: "Beber água",
  description: "",
  frequency: "daily",
  target_per_week: 7,
  kind: "build",
  goal_id: null,
  goal_increment: null,
  color: null,
  ...over,
});

beforeEach(() => {
  store.calls = [];
  store.insertError = null;
});

describe("createHabit — is_health (feature 062)", () => {
  it("grava is_health = true quando o hábito vem do atalho de saúde", async () => {
    const created = await createHabit(draft({ is_health: true }));

    const insert = store.calls.find((c) => c.op === "insert")!;
    expect(insert.table).toBe("habit");
    expect(insert.payload.is_health).toBe(true);
    expect(insert.payload.user_id).toBe("user-1");
    expect(insert.payload.name).toBe("Beber água");
    expect(created.is_health).toBe(true);
  });

  it("hábito comum nasce com is_health = false explícito, sem depender do default da coluna", async () => {
    await createHabit(draft({ name: "Ler 20 páginas" }));

    const insert = store.calls.find((c) => c.op === "insert")!;
    expect(insert.payload).toHaveProperty("is_health", false);
  });

  it("com a migration ainda não aplicada, cai no fallback e salva o mínimo em vez de estourar", async () => {
    store.insertError = `column "is_health" of relation "habit" does not exist`;

    const created = await createHabit(draft({ is_health: true }));

    const inserts = store.calls.filter((c) => c.op === "insert");
    expect(inserts).toHaveLength(2);
    expect(inserts[1]!.payload).not.toHaveProperty("is_health");
    expect(created.name).toBe("Beber água");
  });
});

describe("updateHabit — is_health (feature 062)", () => {
  it("propaga is_health no update, escopado no dono", async () => {
    await updateHabit({ id: "h1", is_health: true });

    const update = store.calls.find((c) => c.op === "update")!;
    expect(update.table).toBe("habit");
    expect(update.payload.is_health).toBe(true);
    expect(update.eq).toEqual([
      ["id", "h1"],
      ["user_id", "user-1"],
    ]);
  });

  it("update que não fala de saúde não mexe na flag", async () => {
    await updateHabit({ id: "h1", name: "Comer frutas" });

    const update = store.calls.find((c) => c.op === "update")!;
    expect(update.payload).not.toHaveProperty("is_health");
    expect(update.payload.name).toBe("Comer frutas");
  });
});
