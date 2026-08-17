import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadHealthSummary } from "@/api/health";
import type { Task } from "@/types/tasks";

/**
 * `loadHealthSummary` (features 060 e 061) contra um Supabase falso que **executa** os filtros em
 * memória — não só registra que foram chamados. É o que prova, sem navegador, que a próxima dose e
 * a próxima consulta escolhidas são mesmo as primeiras pendentes de hoje em diante, e que
 * compromisso de outro usuário, tarefa comum, já concluído e no passado ficam de fora.
 */

type Row = Partial<Task> & { user_id: string };

const store = { tasks: [] as Row[] };

interface RecordedQuery {
  table: string;
  eq: [string, unknown][];
  gte: [string, unknown][];
  order: [string, { ascending?: boolean; nullsFirst?: boolean }][];
  limit: number;
}

/** Uma entrada por chamada a `supabase.from()` — a 061 faz duas (medicação e consulta). */
const queries: RecordedQuery[] = [];

function makeBuilder(table: string) {
  const recorded: RecordedQuery = { table, eq: [], gte: [], order: [], limit: 0 };
  queries.push(recorded);

  let rows = [...store.tasks];

  const builder = {
    select() {
      return builder;
    },
    eq(column: string, value: unknown) {
      recorded.eq.push([column, value]);
      rows = rows.filter(
        (row) => (row as Record<string, unknown>)[column] === value
      );
      return builder;
    },
    gte(column: string, value: string) {
      recorded.gte.push([column, value]);
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
      recorded.order.push([column, opts]);
      return builder;
    },
    limit(n: number) {
      recorded.limit = n;
      return builder;
    },
    maybeSingle() {
      // Um `ORDER BY a, b` só, como o Postgres faz: a segunda chave desempata a primeira, não
      // reordena tudo de novo.
      const sorted = [...rows].sort((a, b) => {
        for (const [column, opts] of recorded.order) {
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
      const limited = recorded.limit ? sorted.slice(0, recorded.limit) : sorted;
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
  queries.length = 0;
});

function queryFor(flag: "is_medication" | "is_consultation"): RecordedQuery {
  const found = queries.find((q) => q.eq.some(([column]) => column === flag));
  if (!found) throw new Error(`nenhuma consulta filtrou por ${flag}`);
  return found;
}

function medication(row: Partial<Task>): Row {
  return {
    user_id: "user-1",
    status: "todo",
    is_medication: true,
    ...row,
  };
}

function consultation(row: Partial<Task>): Row {
  return {
    user_id: "user-1",
    status: "todo",
    is_consultation: true,
    ...row,
  };
}

describe("loadHealthSummary", () => {
  it("consulta a tabela task escopada no usuário, só medicação pendente de hoje em diante", async () => {
    await loadHealthSummary();

    const query = queryFor("is_medication");
    expect(query.table).toBe("task");
    expect(query.eq).toEqual([
      ["user_id", "user-1"],
      ["is_medication", true],
      ["status", "todo"],
    ]);
    expect(query.gte).toEqual([["due_date", "2026-08-16"]]);
    expect(query.order.map(([column]) => column)).toEqual([
      "due_date",
      "due_time",
    ]);
    expect(query.limit).toBe(1);
  });

  it("consulta médica usa a mesma consulta, trocando só a flag (feature 061)", async () => {
    await loadHealthSummary();

    const query = queryFor("is_consultation");
    expect(query.table).toBe("task");
    expect(query.eq).toEqual([
      ["user_id", "user-1"],
      ["is_consultation", true],
      ["status", "todo"],
    ]);
    expect(query.gte).toEqual([["due_date", "2026-08-16"]]);
    expect(query.order.map(([column]) => column)).toEqual([
      "due_date",
      "due_time",
    ]);
    expect(query.limit).toBe(1);
  });

  it("sem nada agendado, o resumo vem com os dois campos nulos", async () => {
    expect(await loadHealthSummary()).toEqual({
      nextMedicationDose: null,
      nextConsultation: null,
    });
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

  it("devolve a consulta mais próxima, com o especialista no título", async () => {
    store.tasks = [
      consultation({
        id: "c2",
        title: "Dermatologista — Dra. Costa",
        due_date: "2026-10-02",
        due_time: "09:00",
      }),
      consultation({
        id: "c1",
        title: "Cardiologista — Dr. Silva",
        due_date: "2026-09-10",
        due_time: "14:30",
      }),
    ];

    const { nextConsultation } = await loadHealthSummary();

    expect(nextConsultation?.id).toBe("c1");
    expect(nextConsultation?.title).toBe("Cardiologista — Dr. Silva");
    expect(nextConsultation?.due_date).toBe("2026-09-10");
    expect(nextConsultation?.due_time).toBe("14:30");
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

  it("ignora consulta passada, já comparecida e de outro usuário", async () => {
    store.tasks = [
      consultation({ id: "passada", due_date: "2026-08-15", due_time: "10:00" }),
      consultation({
        id: "compareceu",
        status: "done",
        due_date: "2026-08-20",
        due_time: "10:00",
      }),
      consultation({
        id: "de-outro",
        user_id: "user-2",
        due_date: "2026-08-21",
        due_time: "10:00",
      }),
      consultation({ id: "minha", due_date: "2026-08-25", due_time: "10:00" }),
    ];

    expect((await loadHealthSummary()).nextConsultation?.id).toBe("minha");
  });

  it("medicação e consulta não se misturam: cada campo vê só a sua flag", async () => {
    store.tasks = [
      medication({ id: "dose", due_date: "2026-08-17", due_time: "08:00" }),
      consultation({ id: "consulta", due_date: "2026-09-10", due_time: "14:30" }),
    ];

    const summary = await loadHealthSummary();

    expect(summary.nextMedicationDose?.id).toBe("dose");
    expect(summary.nextConsultation?.id).toBe("consulta");
  });
});
