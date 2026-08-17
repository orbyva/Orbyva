import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMedication,
  createMedicationWithDoses,
  deactivateMedication,
  fetchDosesSince,
  fetchMedications,
  updateMedication,
} from "@/api/health/medications";

/**
 * CRUD dos tratamentos (feature 064) contra um Supabase falso que **executa** os filtros e guarda o
 * que foi gravado — não só registra que foi chamado.
 *
 * O caso que mais importa aqui é o de encerrar: um tratamento encerrado tem de parar de gerar doses
 * **sem apagar nada**. Apagar a linha zeraria `task.medication_id` (`on delete set null`) em todas
 * as doses passadas e levaria junto o histórico e a adesão do período.
 */

type AnyRow = Record<string, unknown>;

const { store } = vi.hoisted(() => ({
  store: {
    medication: [] as AnyRow[],
    task: [] as AnyRow[],
    /** Quando setado, a próxima query nessa tabela devolve este erro. */
    errorByTable: {} as Record<string, string | undefined>,
    /** `delete()` chamado alguma vez — nenhuma operação desta feature pode apagar tratamento. */
    deletes: 0,
    seq: 0,
  },
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@/lib/supabase", () => {
  function tableRows(table: string): AnyRow[] {
    if (table === "medication") return store.medication;
    if (table === "task") return store.task;
    throw new Error(`tabela inesperada no teste: ${table}`);
  }

  function makeBuilder(table: string) {
    let rows = [...tableRows(table)];
    let written: AnyRow | null = null;
    /** Linhas do último `insert` — o `.select()` encadeado depois dele devolve elas, não a query. */
    let insertedRows: AnyRow[] | null = null;
    let patch: AnyRow | null = null;
    const order: [string, { ascending?: boolean; nullsFirst?: boolean }][] = [];

    const sorted = () =>
      [...rows].sort((a, b) => {
        for (const [column, opts] of order) {
          const dir = opts.ascending === false ? -1 : 1;
          const x = a[column] as string | null;
          const y = b[column] as string | null;
          if (x == null || y == null) continue;
          if (x !== y) return x < y ? -dir : dir;
        }
        return 0;
      });

    const result = () => {
      const error = store.errorByTable[table];
      if (error) return { data: null, error: { message: error } };
      if (insertedRows) return { data: insertedRows, error: null };
      return { data: sorted(), error: null };
    };

    const builder = {
      select: () => builder,
      order(column: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
        order.push([column, opts]);
        return builder;
      },
      eq(column: string, value: unknown) {
        rows = rows.filter((row) => row[column] === value);
        // O update só é aplicado depois dos filtros — é `update ... where`.
        if (patch) {
          for (const row of rows) Object.assign(row, patch);
        }
        return builder;
      },
      not(column: string, operator: string, value: unknown) {
        if (operator !== "is" || value !== null) throw new Error("not() inesperado");
        rows = rows.filter((row) => row[column] != null);
        return builder;
      },
      gte(column: string, value: string) {
        rows = rows.filter((row) => {
          const cell = row[column];
          return typeof cell === "string" && cell >= value;
        });
        return builder;
      },
      insert(newRows: AnyRow[]) {
        const error = store.errorByTable[table];
        if (error) return builder;
        insertedRows = newRows.map((row) => ({ id: `${table}-${++store.seq}`, ...row }));
        tableRows(table).push(...insertedRows);
        written = insertedRows[0] ?? null;
        return builder;
      },
      update(fields: AnyRow) {
        patch = fields;
        return builder;
      },
      delete() {
        store.deletes += 1;
        return builder;
      },
      single() {
        const error = store.errorByTable[table];
        if (error) return Promise.resolve({ data: null, error: { message: error } });
        return Promise.resolve({ data: written ?? sorted()[0] ?? null, error: null });
      },
      maybeSingle() {
        const { data, error } = result();
        return Promise.resolve({ data: data?.[0] ?? null, error });
      },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve(result()).then(resolve);
      },
    };
    return builder;
  }

  return { supabase: { from: (table: string) => makeBuilder(table) } };
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 17, 9, 0, 0));
  store.medication = [];
  store.task = [];
  store.errorByTable = {};
  store.deletes = 0;
  store.seq = 0;
});

describe("createMedication", () => {
  it("grava escopado no usuário logado, com horários normalizados, deduplicados e ordenados", async () => {
    await createMedication({
      name: "  Losartana  ",
      dose_amount: 2,
      dose_unit: " comprimidos ",
      instructions: "  ",
      times: ["20:00:00", "08:00", "20:00"],
      interval_days: 1,
      started_on: "2026-08-17",
      ended_on: null,
    });

    expect(store.medication).toHaveLength(1);
    expect(store.medication[0]).toMatchObject({
      user_id: "user-1",
      name: "Losartana",
      dose_unit: "comprimidos",
      // Instrução em branco vira null, não string vazia.
      instructions: null,
      times: ["08:00", "20:00"],
      active: true,
    });
  });

  it("interval_days nunca desce abaixo de 1 (0 geraria laço infinito na materialização)", async () => {
    await createMedication({
      name: "Losartana",
      times: ["08:00"],
      interval_days: 0,
      started_on: "2026-08-17",
    });

    expect(store.medication[0].interval_days).toBe(1);
  });
});

describe("createMedicationWithDoses", () => {
  it("cria o tratamento e já materializa as doses vencidas", async () => {
    await createMedicationWithDoses({
      name: "Losartana",
      times: ["08:00", "20:00"],
      interval_days: 1,
      started_on: "2026-08-16",
    });

    expect(store.medication).toHaveLength(1);
    // 16/08 (08:00 e 20:00) e 17/08 (08:00 e 20:00) — hoje é 17/08 09:00, mas a dose das 20:00 de
    // hoje já é materializada: o calendário mostra o dia inteiro.
    expect(store.task.map((row) => `${row.due_date} ${row.dose_time}`)).toEqual([
      "2026-08-16 08:00",
      "2026-08-16 20:00",
      "2026-08-17 08:00",
      "2026-08-17 20:00",
    ]);
    for (const row of store.task) {
      expect(row.is_medication).toBe(true);
      expect(row.medication_id).toBe(store.medication[0].id);
    }
  });
});

describe("deactivateMedication", () => {
  it("encerra sem apagar: active vira false, ended_on vira hoje e o histórico fica", async () => {
    store.medication = [
      { id: "med-1", user_id: "user-1", name: "Losartana", active: true, ended_on: null },
    ];
    store.task = [
      {
        id: "dose-antiga",
        user_id: "user-1",
        medication_id: "med-1",
        due_date: "2026-08-10",
        status: "done",
        completed_at: "2026-08-10T08:05:00Z",
      },
    ];

    await deactivateMedication("med-1");

    expect(store.medication[0]).toMatchObject({
      active: false,
      ended_on: "2026-08-17",
    });
    // Nada foi apagado — nem o tratamento, nem a dose já tomada.
    expect(store.deletes).toBe(0);
    expect(store.medication).toHaveLength(1);
    expect(store.task[0].completed_at).toBe("2026-08-10T08:05:00Z");
  });

  it("tratamento que já tinha término programado mantém a data original", async () => {
    store.medication = [
      {
        id: "med-1",
        user_id: "user-1",
        name: "Amoxicilina",
        active: true,
        ended_on: "2026-08-20",
      },
    ];

    await deactivateMedication("med-1");

    expect(store.medication[0].ended_on).toBe("2026-08-20");
    expect(store.medication[0].active).toBe(false);
  });
});

describe("updateMedication", () => {
  it("normaliza horários e clampa interval_days também na edição", async () => {
    store.medication = [
      { id: "med-1", user_id: "user-1", name: "Losartana", times: ["08:00"], interval_days: 1 },
    ];

    await updateMedication({
      id: "med-1",
      name: "  Losartana 50mg ",
      times: ["20:00:00", "08:00:00"],
      interval_days: 0,
    });

    expect(store.medication[0]).toMatchObject({
      name: "Losartana 50mg",
      times: ["08:00", "20:00"],
      interval_days: 1,
    });
  });
});

describe("fetchMedications e fetchDosesSince — migration ainda não aplicada", () => {
  it("relação ausente devolve lista vazia em vez de derrubar a tela", async () => {
    store.errorByTable.medication = 'relation "public.medication" does not exist';
    store.errorByTable.task = 'column task.medication_id does not exist';

    expect(await fetchMedications()).toEqual([]);
    expect(await fetchDosesSince("2026-07-17")).toEqual([]);
  });

  it("erro que não é de relação ausente continua estourando", async () => {
    store.errorByTable.medication = "permission denied for table";

    await expect(fetchMedications()).rejects.toThrow("permission denied");
  });
});
