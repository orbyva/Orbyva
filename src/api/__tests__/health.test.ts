import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchHealthMetrics,
  fetchReminderPreferences,
  loadHealthSummary,
  markReminderNotified,
  recordHealthMetric,
  upsertReminderPreference,
} from "@/api/health";
import type { Task } from "@/types/tasks";

/**
 * `loadHealthSummary` (features 060 e 061) contra um Supabase falso que **executa** os filtros em
 * memória — não só registra que foram chamados. É o que prova, sem navegador, que a próxima dose e
 * a próxima consulta escolhidas são mesmo as primeiras pendentes de hoje em diante, e que
 * compromisso de outro usuário, tarefa comum, já concluído e no passado ficam de fora.
 *
 * A 063 acrescenta `health_metric` e `reminder_preference` ao mesmo falso: gravar e ler medições,
 * o upsert da preferência por (`user_id`, `entity_type`) e o comportamento com as migrations ainda
 * não aplicadas no banco remoto.
 */

type Row = Partial<Task> & { user_id: string };

/** Linha genérica das tabelas da 063 — o falso não precisa dos tipos exatos para executar filtros. */
type AnyRow = Record<string, unknown>;

const store = {
  tasks: [] as Row[],
  /** `public.health_metric` (feature 063). */
  health_metric: [] as AnyRow[],
  /** `public.reminder_preference` (feature 063). */
  reminder_preference: [] as AnyRow[],
  /** Quando setado, a próxima query nessa tabela devolve este erro (tabela ainda sem migration). */
  errorByTable: {} as Record<string, string | undefined>,
};

function tableRows(table: string): AnyRow[] {
  if (table === "task") return store.tasks as unknown as AnyRow[];
  if (table === "health_metric") return store.health_metric;
  if (table === "reminder_preference") return store.reminder_preference;
  throw new Error(`tabela inesperada no teste: ${table}`);
}

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

  let rows = [...tableRows(table)];
  /** Setado por insert/upsert: o retorno de `.select().single()` é a linha gravada, não a query. */
  let written: AnyRow | null = null;

  /** Um `ORDER BY a, b` só, como o Postgres faz: a segunda chave desempata a primeira. */
  const sorted = () =>
    [...rows].sort((a, b) => {
      for (const [column, opts] of recorded.order) {
        const dir = opts.ascending === false ? -1 : 1;
        const x = a[column] as string | null;
        const y = b[column] as string | null;
        if (x == null && y == null) continue;
        if (x == null) return opts.nullsFirst === false ? 1 : -1;
        if (y == null) return opts.nullsFirst === false ? -1 : 1;
        if (x !== y) return x < y ? -dir : dir;
      }
      return 0;
    });

  const result = () => {
    const error = store.errorByTable[table];
    if (error) return { data: null, error: { message: error } };
    const limited = recorded.limit ? sorted().slice(0, recorded.limit) : sorted();
    return { data: limited, error: null };
  };

  const builder = {
    select() {
      return builder;
    },
    /** `await query` sem `.single()` — é como `fetchHealthMetrics` e `fetchReminderPreferences` leem. */
    then(
      resolve: (value: { data: AnyRow[] | null; error: { message: string } | null }) => unknown
    ) {
      return Promise.resolve(result()).then(resolve);
    },
    insert(newRows: AnyRow[]) {
      const error = store.errorByTable[table];
      if (error) {
        written = null;
        return builder;
      }
      written = { id: `${table}-${tableRows(table).length + 1}`, ...newRows[0] };
      tableRows(table).push(written);
      return builder;
    },
    /** Upsert por (user_id, entity_type): atualiza a linha existente em vez de duplicar. */
    upsert(newRows: AnyRow[], opts: { onConflict?: string } = {}) {
      const error = store.errorByTable[table];
      if (error) {
        written = null;
        return builder;
      }
      const keys = (opts.onConflict ?? "").split(",").filter(Boolean);
      const incoming = newRows[0]!;
      const existing = tableRows(table).find((row) =>
        keys.every((key) => row[key] === incoming[key])
      );
      if (existing) {
        Object.assign(existing, incoming);
        written = existing;
      } else {
        written = { id: `${table}-${tableRows(table).length + 1}`, ...incoming };
        tableRows(table).push(written);
      }
      return builder;
    },
    single() {
      const error = store.errorByTable[table];
      if (error) return Promise.resolve({ data: null, error: { message: error } });
      if (written) return Promise.resolve({ data: written, error: null });
      const first = sorted()[0];
      return Promise.resolve(
        first
          ? { data: first, error: null }
          : { data: null, error: { message: "no rows" } }
      );
    },
    eq(column: string, value: unknown) {
      recorded.eq.push([column, value]);
      rows = rows.filter((row) => row[column] === value);
      return builder;
    },
    gte(column: string, value: string) {
      recorded.gte.push([column, value]);
      rows = rows.filter((row) => {
        const cell = row[column];
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
      const { data, error } = result();
      return Promise.resolve({ data: data?.[0] ?? null, error });
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
  store.health_metric = [];
  store.reminder_preference = [];
  store.errorByTable = {};
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

  it("sem nada agendado, o resumo vem com os campos vazios", async () => {
    expect(await loadHealthSummary()).toEqual({
      nextMedicationDose: null,
      nextConsultation: null,
      latestMetrics: [],
      reminderPreferences: [],
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

describe("health_metric (feature 063)", () => {
  it("grava a medição escopada no usuário logado, com a observação aparada", async () => {
    const created = await recordHealthMetric({
      metric_type: "weight",
      value: 78.4,
      recorded_date: "2026-08-16",
      notes: "  em jejum  ",
    });

    expect(created.user_id).toBe("user-1");
    expect(created.metric_type).toBe("weight");
    expect(created.value).toBe(78.4);
    expect(created.notes).toBe("em jejum");
    // E a linha ficou mesmo na tabela — a leitura seguinte a encontra.
    expect(store.health_metric).toHaveLength(1);
  });

  it("observação vazia vira null, não string em branco", async () => {
    const created = await recordHealthMetric({
      metric_type: "waist",
      value: 84,
      recorded_date: "2026-08-16",
      notes: "   ",
    });

    expect(created.notes).toBeNull();
  });

  it("lê da mais recente para a mais antiga, só as do próprio usuário", async () => {
    store.health_metric = [
      { id: "a", user_id: "user-1", metric_type: "weight", value: 78.4, recorded_date: "2026-08-10" },
      { id: "b", user_id: "user-1", metric_type: "weight", value: 77.9, recorded_date: "2026-08-16" },
      { id: "c", user_id: "user-2", metric_type: "weight", value: 99, recorded_date: "2026-08-17" },
    ];

    const metrics = await fetchHealthMetrics();

    expect(metrics.map((metric) => metric.id)).toEqual(["b", "a"]);
  });

  it("filtra por tipo quando pedido", async () => {
    store.health_metric = [
      { id: "peso", user_id: "user-1", metric_type: "weight", value: 78, recorded_date: "2026-08-16" },
      { id: "altura", user_id: "user-1", metric_type: "height", value: 176, recorded_date: "2026-01-05" },
    ];

    expect((await fetchHealthMetrics("height")).map((m) => m.id)).toEqual(["altura"]);
  });

  it("migration ainda não aplicada: devolve lista vazia em vez de derrubar o dashboard", async () => {
    store.errorByTable.health_metric =
      'relation "public.health_metric" does not exist';

    await expect(fetchHealthMetrics()).resolves.toEqual([]);
  });
});

describe("reminder_preference (feature 063)", () => {
  it("upsert cria a preferência do usuário logado", async () => {
    const pref = await upsertReminderPreference("water", {
      frequency: "daily",
      time_of_day: "09:00",
      enabled: true,
    });

    expect(pref.user_id).toBe("user-1");
    expect(pref.entity_type).toBe("water");
    expect(store.reminder_preference).toHaveLength(1);
  });

  it("upsert do mesmo entity_type atualiza a linha, não duplica", async () => {
    await upsertReminderPreference("water", { time_of_day: "09:00", enabled: true });
    await upsertReminderPreference("water", { time_of_day: "20:00", enabled: false });

    expect(store.reminder_preference).toHaveLength(1);
    expect(store.reminder_preference[0]!.time_of_day).toBe("20:00");
    expect(store.reminder_preference[0]!.enabled).toBe(false);
  });

  it("entity_type diferente é outra linha", async () => {
    await upsertReminderPreference("water", { enabled: true });
    await upsertReminderPreference("nutrition", { enabled: true });

    expect(store.reminder_preference).toHaveLength(2);
  });

  it("markReminderNotified grava o horário do disparo na própria preferência", async () => {
    await upsertReminderPreference("water", { time_of_day: "09:00", enabled: true });

    const when = new Date(2026, 7, 16, 9, 0, 30);
    const updated = await markReminderNotified("water", when);

    expect(updated.last_notified_at).toBe(when.toISOString());
    // Não é uma tabela de log: o disparo mora na linha da preferência.
    expect(store.reminder_preference).toHaveLength(1);
    expect(store.reminder_preference[0]!.last_notified_at).toBe(when.toISOString());
  });

  it("lê só as preferências do próprio usuário", async () => {
    store.reminder_preference = [
      { id: "minha", user_id: "user-1", entity_type: "water", enabled: true },
      { id: "de-outro", user_id: "user-2", entity_type: "water", enabled: true },
    ];

    expect((await fetchReminderPreferences()).map((p) => p.id)).toEqual(["minha"]);
  });

  it("migration ainda não aplicada: devolve lista vazia", async () => {
    store.errorByTable.reminder_preference =
      'relation "public.reminder_preference" does not exist';

    await expect(fetchReminderPreferences()).resolves.toEqual([]);
  });
});

describe("loadHealthSummary com as tabelas da 063", () => {
  it("traz a janela de métricas e as preferências junto de dose e consulta", async () => {
    store.tasks = [medication({ id: "dose", due_date: "2026-08-17", due_time: "08:00" })];
    store.health_metric = [
      { id: "peso-antigo", user_id: "user-1", metric_type: "weight", value: 78.4, recorded_date: "2026-08-10" },
      { id: "peso-novo", user_id: "user-1", metric_type: "weight", value: 77.9, recorded_date: "2026-08-16" },
    ];
    store.reminder_preference = [
      { id: "agua", user_id: "user-1", entity_type: "water", enabled: true },
    ];

    const summary = await loadHealthSummary();

    expect(summary.nextMedicationDose?.id).toBe("dose");
    // A janela precisa vir com as duas medições: a variação depende da anterior.
    expect(summary.latestMetrics.map((m) => m.id)).toEqual(["peso-novo", "peso-antigo"]);
    expect(summary.reminderPreferences.map((p) => p.id)).toEqual(["agua"]);
  });

  it("tabelas ainda sem migration não derrubam o resumo", async () => {
    store.errorByTable.health_metric = 'relation "public.health_metric" does not exist';
    store.errorByTable.reminder_preference =
      'relation "public.reminder_preference" does not exist';
    store.tasks = [medication({ id: "dose", due_date: "2026-08-17", due_time: "08:00" })];

    const summary = await loadHealthSummary();

    expect(summary.nextMedicationDose?.id).toBe("dose");
    expect(summary.latestMetrics).toEqual([]);
    expect(summary.reminderPreferences).toEqual([]);
  });
});
