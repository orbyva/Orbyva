import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchHealthHabitsToday } from "@/api/health";
import type { Habit, HabitLog } from "@/types/habits";

/**
 * `fetchHealthHabitsToday` (feature 062) contra um Supabase falso que **executa** os filtros em
 * memória — não só registra que foram chamados. É o que prova, sem navegador, que a seção "Hoje"
 * do Health Dashboard lista só os hábitos com `is_health` do usuário logado, que o check-in
 * marcado é o de hoje (data local, não UTC) e que log de ontem, log desmarcado e hábito comum
 * ficam de fora.
 */

type HabitRow = Partial<Habit> & { user_id: string; id: string };
type LogRow = Partial<HabitLog> & { habit_id: string; date: string; completed: boolean };

const store = {
  habits: [] as HabitRow[],
  logs: [] as LogRow[],
  /** Mensagem devolvida pela consulta de hábitos — simula migration ainda não aplicada. */
  habitError: null as string | null,
};

const queries: { table: string; eq: [string, unknown][]; in: [string, unknown[]][] }[] = [];

function makeBuilder(table: string) {
  const recorded = { table, eq: [] as [string, unknown][], in: [] as [string, unknown[]][] };
  queries.push(recorded);

  let rows: Record<string, unknown>[] =
    table === "habit" ? [...store.habits] : [...store.logs];

  const result = () => {
    if (table === "habit" && store.habitError) {
      return { data: null, error: { message: store.habitError } };
    }
    return { data: rows, error: null };
  };

  const builder = {
    select() {
      return builder;
    },
    eq(column: string, value: unknown) {
      recorded.eq.push([column, value]);
      rows = rows.filter((row) => row[column] === value);
      return builder;
    },
    in(column: string, values: unknown[]) {
      recorded.in.push([column, values]);
      rows = rows.filter((row) => values.includes(row[column]));
      return builder;
    },
    order(column: string, opts: { ascending?: boolean } = {}) {
      const dir = opts.ascending === false ? -1 : 1;
      rows = [...rows].sort((a, b) =>
        String(a[column] ?? "") < String(b[column] ?? "") ? -dir : dir
      );
      return builder;
    },
    then(resolve: (value: ReturnType<typeof result>) => unknown) {
      return Promise.resolve(result()).then(resolve);
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

function healthHabit(row: Partial<HabitRow> & { id: string }): HabitRow {
  return {
    user_id: "user-1",
    name: "Beber água",
    frequency: "daily",
    target_per_week: 7,
    is_health: true,
    created_at: "2026-08-01T00:00:00Z",
    ...row,
  };
}

/** Hoje é 16/08/2026 na hora local — o filtro de log usa a data local, não UTC. */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 16, 9, 0, 0));
  store.habits = [];
  store.logs = [];
  store.habitError = null;
  queries.length = 0;
});

describe("fetchHealthHabitsToday", () => {
  it("consulta habit escopado no usuário e filtrado por is_health", async () => {
    store.habits = [healthHabit({ id: "h1" })];

    await fetchHealthHabitsToday();

    const habitQuery = queries.find((q) => q.table === "habit")!;
    expect(habitQuery.eq).toEqual([
      ["user_id", "user-1"],
      ["is_health", true],
    ]);
  });

  it("sem hábito de saúde, devolve lista vazia e nem consulta os logs", async () => {
    expect(await fetchHealthHabitsToday()).toEqual([]);
    expect(queries.some((q) => q.table === "habit_log")).toBe(false);
  });

  it("marca doneToday pelo log de hoje e busca só os logs dos hábitos de saúde", async () => {
    store.habits = [
      healthHabit({ id: "agua", name: "Beber água", created_at: "2026-08-01T00:00:00Z" }),
      healthHabit({ id: "frutas", name: "Comer frutas", created_at: "2026-08-02T00:00:00Z" }),
    ];
    store.logs = [{ habit_id: "agua", date: "2026-08-16", completed: true }];

    const result = await fetchHealthHabitsToday();

    expect(result.map((r) => [r.habit.name, r.doneToday])).toEqual([
      ["Beber água", true],
      ["Comer frutas", false],
    ]);

    const logQuery = queries.find((q) => q.table === "habit_log")!;
    expect(logQuery.in).toEqual([["habit_id", ["agua", "frutas"]]]);
    expect(logQuery.eq).toEqual([["date", "2026-08-16"]]);
  });

  it("log de ontem ou desmarcado não conta como feito hoje", async () => {
    store.habits = [healthHabit({ id: "agua" })];
    store.logs = [
      { habit_id: "agua", date: "2026-08-15", completed: true },
      { habit_id: "agua", date: "2026-08-16", completed: false },
    ];

    expect((await fetchHealthHabitsToday())[0]!.doneToday).toBe(false);
  });

  it("hábito comum e hábito de saúde de outro usuário ficam de fora", async () => {
    store.habits = [
      healthHabit({ id: "meu" }),
      healthHabit({ id: "comum", is_health: false }),
      healthHabit({ id: "de-outro", user_id: "user-2" }),
    ];

    const result = await fetchHealthHabitsToday();

    expect(result).toHaveLength(1);
    expect(result[0]!.habit.id).toBe("meu");
  });

  it("com a migration ainda não aplicada, devolve vazio em vez de derrubar o dashboard", async () => {
    store.habitError = `column habit.is_health does not exist`;

    expect(await fetchHealthHabitsToday()).toEqual([]);
  });

  it("erro real (não a coluna faltando) continua estourando", async () => {
    store.habitError = "Failed to fetch";

    await expect(fetchHealthHabitsToday()).rejects.toThrow("Failed to fetch");
  });
});
