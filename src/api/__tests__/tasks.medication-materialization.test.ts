import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchTasks } from "@/api/tasks";
import type { Medication } from "@/types/health";
import type { Task } from "@/types/tasks";

/**
 * Materialização de doses (feature 064) dentro de `fetchTasks`, contra um Supabase falso que guarda
 * as linhas realmente enviadas no `insert`.
 *
 * O risco de primeira classe desta feature é a **dupla materialização**: enquanto `medication_id` e
 * `recurrence_rule` coexistirem numa mesma origem — e coexistem de propósito, porque o backfill
 * preserva a regra —, os dois caminhos podem gerar dose para o mesmo dia. Aqui isso é testado
 * diretamente: uma origem migrada pelo backfill (com regra E `medication_id`) tem de sair de
 * `materializeRecurringInstances` e ser materializada só por `materializeMedicationDoses`.
 */

const { store } = vi.hoisted(() => ({
  store: {
    tasks: [] as Task[],
    medications: [] as Medication[],
    /** Linhas passadas para `insert` em `task` — o artefato que as assertivas inspecionam. */
    inserted: [] as Record<string, unknown>[],
    /** Quando setado, `from("medication")` devolve este erro (migration ainda não aplicada). */
    medicationError: null as string | null,
    seq: 0,
  },
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@/lib/supabase", () => {
  function from(table: string) {
    if (table === "medication") {
      // Como o builder real do supabase-js: encadeável **e** thenable — `fetchMedications`
      // acrescenta `.eq("active", true)` depois do `.order()`, o que quebraria um fake que
      // devolvesse uma Promise crua no `order`.
      const result = () =>
        store.medicationError
          ? { data: null, error: { message: store.medicationError } }
          : { data: store.medications, error: null };
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        then: (
          resolve: (value: unknown) => unknown,
          reject?: (reason: unknown) => unknown
        ) => Promise.resolve(result()).then(resolve, reject),
      };
      return builder;
    }
    if (table !== "task") throw new Error(`tabela inesperada: ${table}`);
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => Promise.resolve({ data: store.tasks, error: null }),
      insert: write,
      // Feature 074: as três materializações escrevem por `upsert(..., ignoreDuplicates)` —
      // `on conflict do nothing`. Sem duplicata no cenário, é a mesma coisa que `insert`.
      upsert: write,
    };

    function write(rows: Record<string, unknown>[]) {
      store.inserted.push(...rows);
      const created = rows.map((row) => ({
        ...row,
        id: `gen-${++store.seq}`,
      })) as unknown as Task[];
      return { select: () => Promise.resolve({ data: created, error: null }) };
    }
    return builder;
  }
  return { supabase: { from } };
});

function medication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: "med-1",
    user_id: "user-1",
    name: "Losartana",
    dose_amount: 2,
    dose_unit: "comprimidos",
    instructions: "em jejum",
    times: ["08:00:00"],
    interval_days: 1,
    started_on: "2026-08-14",
    ended_on: null,
    active: true,
    ...overrides,
  };
}

function task(overrides: Partial<Task>): Task {
  return {
    id: "t-1",
    user_id: "user-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Tarefa",
    status: "todo",
    tag_ids: [],
    due_date: "2026-08-14",
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    ...overrides,
  } as Task;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 16, 9, 0, 0)); // 16/08/2026
  store.tasks = [];
  store.medications = [];
  store.inserted = [];
  store.medicationError = null;
  store.seq = 0;
});

describe("materializeMedicationDoses dentro de fetchTasks", () => {
  it("gera duas doses por dia quando o tratamento tem dois horários", async () => {
    store.medications = [
      medication({ times: ["08:00:00", "20:00:00"], started_on: "2026-08-15" }),
    ];

    const tasks = await fetchTasks();

    expect(
      store.inserted.map((row) => `${row.due_date} ${row.dose_time}`)
    ).toEqual([
      "2026-08-15 08:00",
      "2026-08-15 20:00",
      "2026-08-16 08:00",
      "2026-08-16 20:00",
    ]);
    for (const row of store.inserted) {
      expect(row.is_medication).toBe(true);
      expect(row.medication_id).toBe("med-1");
      // Título com posologia, de `formatDoseTitle`.
      expect(row.title).toBe("Losartana 2 comprimidos");
      expect(row.description).toBe("em jejum");
      // `due_time` continua preenchido: é o que a Agenda e `isDoseLate` (049) leem.
      expect(row.due_time).toBe(row.dose_time);
      expect(row.recurrence_rule).toBeNull();
      // Feature 071/072: a dose nasce pontual (`is_quick` + `estimated_duration: 0`) e com o
      // ícone de comprimido — a Agenda a desenha como bolinha marcável em vez de bloco de 30 min.
      expect(row.is_quick).toBe(true);
      expect(row.icon_key).toBe("pill");
      expect(row.estimated_duration).toBe(0);
    }
    expect(tasks).toHaveLength(4);
  });

  // Feature 071: garante que os dois campos novos valem para **toda** dose materializada, não só
  // para o caminho de dois horários acima — inclusive quando o tratamento tem cadência espaçada.
  it("toda dose materializada nasce pontual (is_quick) e com icon_key 'pill'", async () => {
    store.medications = [medication({ interval_days: 2, started_on: "2026-08-12" })];

    await fetchTasks();

    expect(store.inserted.length).toBeGreaterThan(0);
    expect(
      store.inserted.every((row) => row.is_quick === true && row.icon_key === "pill")
    ).toBe(true);
  });

  it("respeita interval_days: a cada 2 dias, não todo dia", async () => {
    store.medications = [medication({ interval_days: 2, started_on: "2026-08-12" })];

    await fetchTasks();

    expect(store.inserted.map((row) => row.due_date)).toEqual([
      "2026-08-12",
      "2026-08-14",
      "2026-08-16",
    ]);
  });

  it("tratamento encerrado (active = false) não gera dose nova", async () => {
    // `fetchMedications(true)` filtra por `active` no banco; aqui o falso devolve o que houver,
    // então o tratamento inativo chega e quem tem de barrá-lo é `computeMissingDoses`.
    store.medications = [medication({ active: false })];

    await fetchTasks();

    expect(store.inserted).toHaveLength(0);
  });

  it("dose já materializada não é recriada, mesmo com dose_time em HH:MM:SS", async () => {
    store.medications = [medication({ started_on: "2026-08-15" })];
    store.tasks = [
      task({
        id: "dose-existente",
        due_date: "2026-08-15",
        due_time: "08:00:00",
        dose_time: "08:00:00",
        is_medication: true,
        medication_id: "med-1",
      }),
    ];

    await fetchTasks();

    expect(store.inserted.map((row) => row.due_date)).toEqual(["2026-08-16"]);
  });
});

describe("dupla materialização — o risco de primeira classe da 064", () => {
  it("origem migrada pelo backfill (regra + medication_id) NÃO é materializada pela recorrência", async () => {
    // Exatamente o que o backfill deixa: a origem mantém `recurrence_rule` (registro do que a
    // série era) e ganha `medication_id`.
    store.tasks = [
      task({
        id: "origem-migrada",
        title: "Losartana",
        due_date: "2026-08-14",
        due_time: "08:00",
        dose_time: "08:00",
        recurrence_rule: { frequency: "daily", interval: 1, time: "08:00" },
        is_medication: true,
        medication_id: "med-1",
      }),
    ];
    store.medications = [medication({ started_on: "2026-08-14" })];

    await fetchTasks();

    // Um único caminho gerou doses: 15 e 16 (a 14 já existe como a própria origem). Se
    // `materializeRecurringInstances` também tivesse rodado, cada data apareceria duas vezes.
    const dates = store.inserted.map((row) => row.due_date);
    expect(dates).toEqual(["2026-08-15", "2026-08-16"]);
    expect(new Set(dates).size).toBe(dates.length);
    // E nenhuma linha veio pelo caminho da recorrência (que grava `recurrence_origin_id`).
    expect(
      store.inserted.filter((row) => row.recurrence_origin_id === "origem-migrada")
    ).toHaveLength(0);
    for (const row of store.inserted) {
      expect(row.medication_id).toBe("med-1");
    }
  });

  it("série recorrente comum continua sendo materializada normalmente (não-regressão)", async () => {
    store.tasks = [
      task({
        id: "comum",
        title: "Reunião diária",
        due_date: "2026-08-14",
        recurrence_rule: { frequency: "daily", interval: 1, time: "15:00" },
      }),
    ];

    await fetchTasks();

    expect(store.inserted.map((row) => row.due_date)).toEqual([
      "2026-08-15",
      "2026-08-16",
    ]);
    for (const row of store.inserted) {
      expect(row.recurrence_origin_id).toBe("comum");
    }
  });

  it("medicação da 049 ainda não migrada (sem medication_id) continua materializando pela recorrência", async () => {
    store.tasks = [
      task({
        id: "049",
        title: "Losartana",
        due_date: "2026-08-14",
        recurrence_rule: { frequency: "daily", interval: 1, time: "08:00" },
        is_medication: true,
      }),
    ];

    await fetchTasks();

    expect(store.inserted.map((row) => row.due_date)).toEqual([
      "2026-08-15",
      "2026-08-16",
    ]);
    for (const row of store.inserted) {
      expect(row.is_medication).toBe(true);
      expect(row.recurrence_origin_id).toBe("049");
    }
  });
});

describe("migration da 064 ainda não aplicada no banco remoto", () => {
  it("erro de relação ausente em `medication` não derruba fetchTasks", async () => {
    store.medicationError =
      'relation "public.medication" does not exist';
    store.tasks = [task({ id: "avulsa", title: "Comprar pão" })];

    const tasks = await fetchTasks();

    expect(tasks).toHaveLength(1);
    expect(store.inserted).toHaveLength(0);
  });
});
