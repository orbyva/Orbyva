import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMedication,
  createMedicationWithDoses,
  deactivateMedication,
  endMedicationAndDeleteFutureDoses,
  EndMedicationError,
  fetchDosesSince,
  fetchMedications,
  materializeAllMedicationDoses,
  updateMedication,
} from "@/api/health/medications";
import { deleteTaskSeries, fetchTasks } from "@/api/tasks";
import type { Task } from "@/types/tasks";

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
    /** `delete()` chamado: a remoção acontece quando a query é aguardada, já com os filtros. */
    let deleting = false;
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

    /** `select(..., { count: "exact", head: true })` — a contagem de escopo da feature 075. */
    let counting = false;

    const result = () => {
      const error = store.errorByTable[table];
      if (error) return { data: null, count: null, error: { message: error } };
      if (insertedRows) return { data: insertedRows, count: null, error: null };
      return { data: sorted(), count: counting ? rows.length : null, error: null };
    };

    const builder = {
      select: (_columns?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count) counting = true;
        return builder;
      },
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
      /** `or("id.eq.x,recurrence_origin_id.eq.x,medication_id.eq.y")` — a união da feature 075. */
      or(expression: string) {
        rows = rows.filter((row) =>
          expression.split(",").some((clause) => {
            const [column, op, value] = clause.split(".");
            if (op !== "eq") throw new Error(`operador não suportado no or(): ${op}`);
            return row[column] === value;
          })
        );
        return builder;
      },
      neq(column: string, value: unknown) {
        rows = rows.filter((row) => row[column] !== value);
        return builder;
      },
      is(column: string, value: unknown) {
        if (value !== null) throw new Error("is() só é usado com null neste código");
        rows = rows.filter((row) => row[column] == null);
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
      /**
       * Feature 074: as materializações escrevem por `upsert(..., { ignoreDuplicates: true })` —
       * `on conflict do nothing`. Sem duplicata na tabela falsa, é o mesmo que `insert`; a
       * semântica do conflito é coberta em `tasks.recurring-materialization.test.ts` (cliente) e
       * em `supabase/tests/task_dedupe_doses/run.sh` (banco).
       */
      upsert(newRows: AnyRow[]) {
        return builder.insert(newRows);
      },
      update(fields: AnyRow) {
        patch = fields;
        return builder;
      },
      in(column: string, values: unknown[]) {
        rows = rows.filter((row) => values.includes(row[column]));
        return builder;
      },
      delete() {
        store.deletes += 1;
        deleting = true;
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
        if (deleting) {
          deleting = false;
          const error = store.errorByTable[table];
          if (error) return Promise.resolve({ data: null, error: { message: error } }).then(resolve);
          const alvo = tableRows(table);
          for (const row of rows) {
            const at = alvo.indexOf(row);
            if (at >= 0) alvo.splice(at, 1);
          }
          return Promise.resolve({ data: null, error: null }).then(resolve);
        }
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

  it("a carga de tarefas seguinte não recria as doses que a criação já materializou", async () => {
    // Feature 074: `createMedicationWithDoses` chama a materialização com `existingDoses: []`. Isso
    // é correto por construção (o tratamento acabou de nascer, não há dose apontando pra ele), e o
    // que prova que não é fonte de duplicata é justamente a passada seguinte: ela lê as doses do
    // banco e não escreve nada.
    await createMedicationWithDoses({
      name: "Losartana",
      times: ["08:00", "20:00"],
      interval_days: 1,
      started_on: "2026-08-16",
    });
    const criadas = store.task.map((row) => row.id);
    expect(criadas).toHaveLength(4);

    await materializeAllMedicationDoses("user-1", store.task as unknown as Task[]);

    expect(store.task.map((row) => row.id)).toEqual(criadas);
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

  /**
   * Feature 074, mecanismo 2 — a duplicação de **linha**. Até aqui `updateMedication` era um UPDATE
   * seco: trocar 08:00 por 09:00 deixava as doses futuras das 08:00 no calendário e a materialização
   * criava as das 09:00 ao lado.
   */
  describe("reconciliação das doses (feature 074)", () => {
    /** Hoje é 17/08/2026 09:00 (relógio fake do `beforeEach`). */
    function seedTratamento(doses: AnyRow[]) {
      store.medication = [
        {
          id: "med-1",
          user_id: "user-1",
          name: "Losartana",
          times: ["08:00"],
          interval_days: 1,
          started_on: "2026-08-10",
          ended_on: null,
          active: true,
        },
      ];
      store.task = doses.map((dose) => ({
        user_id: "user-1",
        medication_id: "med-1",
        status: "todo",
        completed_at: null,
        dose_time: "08:00",
        ...dose,
      }));
    }

    it("trocar o horário apaga as doses futuras do horário antigo", async () => {
      seedTratamento([
        { id: "futura-1", due_date: "2026-08-18" },
        { id: "futura-2", due_date: "2026-08-19" },
      ]);

      await updateMedication({ id: "med-1", times: ["09:00"] });

      expect(store.task).toEqual([]);
      expect(store.deletes).toBe(1);
    });

    it("não toca no passado, na dose de hoje, nem na dose futura já tomada", async () => {
      seedTratamento([
        { id: "passada", due_date: "2026-08-16" },
        { id: "hoje", due_date: "2026-08-17" },
        { id: "futura-tomada", due_date: "2026-08-18", status: "done" },
        { id: "futura-pendente", due_date: "2026-08-19" },
      ]);

      await updateMedication({ id: "med-1", times: ["09:00"] });

      expect(store.task.map((row) => row.id)).toEqual([
        "passada",
        "hoje",
        "futura-tomada",
      ]);
    });

    it("edição que não mexe no cronograma não apaga nada (nem chama delete)", async () => {
      seedTratamento([
        { id: "futura-1", due_date: "2026-08-18" },
        { id: "futura-2", due_date: "2026-08-19" },
      ]);

      await updateMedication({ id: "med-1", name: "Losartana 50mg" });

      expect(store.task.map((row) => row.id)).toEqual(["futura-1", "futura-2"]);
      expect(store.deletes).toBe(0);
    });

    it("encurtar `ended_on` apaga só as doses que ficaram fora da janela", async () => {
      seedTratamento([
        { id: "dentro", due_date: "2026-08-18" },
        { id: "no-limite", due_date: "2026-08-19" },
        { id: "fora", due_date: "2026-08-20" },
      ]);

      await updateMedication({ id: "med-1", ended_on: "2026-08-19" });

      expect(store.task.map((row) => row.id)).toEqual(["dentro", "no-limite"]);
    });

    it("falha na reconciliação sobe para quem chamou, em vez de deixar dose fantasma", async () => {
      seedTratamento([{ id: "futura-1", due_date: "2026-08-18" }]);
      store.errorByTable.task = "permission denied for table task";

      await expect(updateMedication({ id: "med-1", times: ["09:00"] })).rejects.toThrow(
        "permission denied"
      );
    });
  });
});

/**
 * Feature 075 — o cerne do "i'm unable to delete it".
 *
 * As duas primeiras assertivas são o par que explica o bug e a correção, e usam a `fetchTasks` de
 * verdade (o Supabase falso aqui executa filtros, então a carga seguinte enxerga exatamente o que
 * sobrou na tabela): com o tratamento **ativo**, a dose apagada **volta** na carga seguinte; com o
 * tratamento **encerrado**, não volta.
 */
describe("endMedicationAndDeleteFutureDoses", () => {
  /** Hoje é 17/08/2026 09:00 (relógio fake do `beforeEach`). */
  function seedTratamentoComDoses() {
    store.medication = [
      {
        id: "med-1",
        user_id: "user-1",
        name: "SEMTRI",
        times: ["08:00"],
        interval_days: 1,
        started_on: "2026-08-15",
        ended_on: null,
        active: true,
        dose_amount: null,
        dose_unit: null,
        instructions: null,
      },
    ];
    store.task = [
      { id: "dose-15", due_date: "2026-08-15", status: "done", completed_at: "2026-08-15T08:05:00Z" },
      { id: "dose-16", due_date: "2026-08-16" },
      { id: "dose-17", due_date: "2026-08-17" },
    ].map((dose) => ({
      user_id: "user-1",
      medication_id: "med-1",
      title: "SEMTRI",
      dose_time: "08:00",
      due_time: "08:00",
      is_medication: true,
      status: "todo",
      completed_at: null,
      recurrence_rule: null,
      recurrence_origin_id: null,
      ...dose,
    }));
  }

  const doseDeHoje = { id: "dose-17", medication_id: "med-1" };

  it("com o tratamento ativo, apagar a dose não resolve — ela volta na carga seguinte", async () => {
    seedTratamentoComDoses();

    await deleteTaskSeries(doseDeHoje, { mode: "single" });
    expect(store.task.map((row) => row.due_date)).toEqual(["2026-08-15", "2026-08-16"]);

    await fetchTasks();

    // `materializeAllMedicationDoses` recalcula desde `started_on` e recria a dose de 17/08.
    expect(store.task.map((row) => row.due_date)).toEqual([
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
    ]);
  });

  it("encerrando o tratamento junto, a dose some e **não** volta", async () => {
    seedTratamentoComDoses();

    const apagadas = await endMedicationAndDeleteFutureDoses(doseDeHoje);

    expect(apagadas).toBe(1);
    expect(store.medication[0]).toMatchObject({ active: false, ended_on: "2026-08-17" });
    expect(store.task.map((row) => row.id)).toEqual(["dose-15", "dose-16"]);

    await fetchTasks();

    expect(store.task.map((row) => row.id)).toEqual(["dose-15", "dose-16"]);
  });

  it("não apaga o passado nem a dose já tomada — o histórico de adesão fica inteiro", async () => {
    seedTratamentoComDoses();

    await endMedicationAndDeleteFutureDoses(doseDeHoje);

    expect(store.task.find((row) => row.id === "dose-15")).toMatchObject({
      status: "done",
      completed_at: "2026-08-15T08:05:00Z",
    });
    // A `medication` continua existindo: apagá-la zeraria `medication_id` das doses passadas
    // (`on delete set null`) e levaria a adesão junto (decisão da feature 064).
    expect(store.medication).toHaveLength(1);
  });

  it("falha ao encerrar não apaga nada, e o erro diz em que etapa parou", async () => {
    seedTratamentoComDoses();
    store.errorByTable.medication = "permission denied for table medication";

    const error = await endMedicationAndDeleteFutureDoses(doseDeHoje).catch((e) => e);

    expect(error).toBeInstanceOf(EndMedicationError);
    expect(error.stage).toBe("deactivate");
    expect(error.message).toContain("Nenhuma dose foi apagada");
    expect(store.task).toHaveLength(3);
  });

  it("falha ao apagar depois de encerrar é reportada como estado parcial, não como 'nada aconteceu'", async () => {
    seedTratamentoComDoses();
    store.errorByTable.task = "permission denied for table task";

    const error = await endMedicationAndDeleteFutureDoses(doseDeHoje).catch((e) => e);

    expect(error).toBeInstanceOf(EndMedicationError);
    expect(error.stage).toBe("delete");
    expect(error.message).toContain("tratamento foi encerrado");
    // O encerramento **valeu** — é o que impede as doses de voltarem numa segunda tentativa.
    expect(store.medication[0].active).toBe(false);
  });

  it("tarefa sem tratamento não encerra nada", async () => {
    store.medication = [];
    store.task = [{ id: "avulsa", user_id: "user-1", medication_id: null }];

    await expect(endMedicationAndDeleteFutureDoses({ id: "avulsa" })).rejects.toThrow(
      "não pertence a um tratamento"
    );
    expect(store.deletes).toBe(0);
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
