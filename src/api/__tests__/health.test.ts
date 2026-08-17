import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadHealthSummary } from "@/api/health";
import type { Task } from "@/types/tasks";

/**
 * `loadHealthSummary` (feature 060) contra um Supabase falso que **executa** os filtros em memória
 * — não só registra que foram chamados. É o que prova, sem navegador, que a próxima dose escolhida
 * é mesmo a primeira pendente de hoje em diante, e que dose de outro usuário, tarefa comum,
 * dose já concluída e dose no passado ficam de fora.
 */

type Row = Partial<Task> & { user_id: string };

const store = { tasks: [] as Row[] };
/** O que a última consulta pediu — para provar o escopo por usuário e o `limit 1`. */
const lastQuery = {
  table: "",
  eq: [] as [string, unknown][],
  gte: [] as [string, unknown][],
  order: [] as [string, { ascending?: boolean; nullsFirst?: boolean }][],
  limit: 0,
};

function makeBuilder(table: string) {
  lastQuery.table = table;
  lastQuery.eq = [];
  lastQuery.gte = [];
  lastQuery.order = [];
  lastQuery.limit = 0;

  let rows = [...store.tasks];

  const builder = {
    select() {
      return builder;
    },
    eq(column: string, value: unknown) {
      lastQuery.eq.push([column, value]);
      rows = rows.filter(
        (row) => (row as Record<string, unknown>)[column] === value
      );
      return builder;
    },
    gte(column: string, value: string) {
      lastQuery.gte.push([column, value]);
      rows = rows.filter((row) => {
        const cell = (row as Record<string, unknown>)[column];
        return typeof cell === "string" && cell >= value;
      });
      return builder;
    },
    order(
      column: string,
      opts: { ascending?: boolean; nullsFirst?: boolean } = {}
    ) {
      lastQuery.order.push([column, opts]);
      return builder;
    },
    limit(n: number) {
      lastQuery.limit = n;
      return builder;
    },
    maybeSingle() {
      // Um `ORDER BY a, b` só, como o Postgres faz: a segunda chave desempata a primeira, não
      // reordena tudo de novo.
      const sorted = [...rows].sort((a, b) => {
        for (const [column, opts] of lastQuery.order) {
          const dir = opts.ascending === false ? -1 : 1;
          const x = (a as Record<string, unknown>)[column] as string | null;
          const y = (b as Record<string, unknown>)[column] as string | null;
          if (x == null && y == null) continue;
          if (x == null) return opts.nullsFirst === false ? 1 : -1;
          if (y == null) return opts.nullsFirst === false ? -1 : 1;
          if (x !== y) return x < y ? -dir : dir;
        }
        return 0;
      });
      const limited = lastQuery.limit ? sorted.slice(0, lastQuery.limit) : sorted;
      return Promise.resolve({ data: limited[0] ?? null, error: null });
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

/** Hoje é 16/08/2026 na hora local — o `gte` da consulta usa a data local, não UTC. */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 16, 9, 0, 0));
  store.tasks = [];
});

function medication(row: Partial<Task>): Row {
  return {
    user_id: "user-1",
    status: "todo",
    is_medication: true,
    ...row,
  };
}

describe("loadHealthSummary", () => {
  it("consulta a tabela task escopada no usuário, só medicação pendente de hoje em diante", async () => {
    await loadHealthSummary();

    expect(lastQuery.table).toBe("task");
    expect(lastQuery.eq).toEqual([
      ["user_id", "user-1"],
      ["is_medication", true],
      ["status", "todo"],
    ]);
    expect(lastQuery.gte).toEqual([["due_date", "2026-08-16"]]);
    expect(lastQuery.order.map(([column]) => column)).toEqual([
      "due_date",
      "due_time",
    ]);
    expect(lastQuery.limit).toBe(1);
  });

  it("sem nenhuma medicação agendada, o resumo vem com a próxima dose nula", async () => {
    expect(await loadHealthSummary()).toEqual({ nextMedicationDose: null });
  });

  it("devolve a dose mais próxima, com título, data e horário", async () => {
    store.tasks = [
      medication({
        id: "t2",
        title: "Losartana",
        due_date: "2026-08-18",
        due_time: "08:00",
      }),
      medication({
        id: "t1",
        title: "Vitamina D",
        due_date: "2026-08-16",
        due_time: "20:00",
      }),
    ];

    const { nextMedicationDose } = await loadHealthSummary();

    expect(nextMedicationDose?.id).toBe("t1");
    expect(nextMedicationDose?.title).toBe("Vitamina D");
    expect(nextMedicationDose?.due_date).toBe("2026-08-16");
    expect(nextMedicationDose?.due_time).toBe("20:00");
  });

  it("no mesmo dia, o horário mais cedo vem primeiro e dose sem horário fica por último", async () => {
    store.tasks = [
      medication({ id: "sem-hora", due_date: "2026-08-16", due_time: null }),
      medication({ id: "noite", due_date: "2026-08-16", due_time: "22:00" }),
      medication({ id: "manha", due_date: "2026-08-16", due_time: "07:30" }),
    ];

    expect((await loadHealthSummary()).nextMedicationDose?.id).toBe("manha");
  });

  it("ignora dose de ontem, dose já tomada, tarefa comum e dose de outro usuário", async () => {
    store.tasks = [
      medication({ id: "ontem", due_date: "2026-08-15", due_time: "08:00" }),
      medication({
        id: "tomada",
        status: "done",
        due_date: "2026-08-16",
        due_time: "08:00",
      }),
      medication({
        id: "tarefa-comum",
        is_medication: false,
        due_date: "2026-08-16",
        due_time: "08:00",
      }),
      medication({
        id: "de-outro",
        user_id: "user-2",
        due_date: "2026-08-16",
        due_time: "08:00",
      }),
      medication({ id: "minha", due_date: "2026-08-17", due_time: "09:00" }),
    ];

    expect((await loadHealthSummary()).nextMedicationDose?.id).toBe("minha");
  });
});
