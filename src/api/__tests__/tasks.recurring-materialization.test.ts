import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchTasks } from "@/api/tasks";
import type { Task } from "@/types/tasks";

/**
 * `materializeRecurringInstances` (dentro de `fetchTasks`) contra um Supabase falso que guarda as
 * linhas realmente enviadas no `insert`. É o que prova, sem navegador e sem banco, que uma consulta
 * médica recorrente (feature 061) gera ocorrências com `is_consultation: true` — a materialização
 * só copia um subconjunto dos campos da origem, então a flag precisa estar na lista explicitamente,
 * senão cada ocorrência nasceria como tarefa comum e sumiria do histórico da série.
 *
 * Cobre junto a não-regressão da 049: `is_medication` continua propagando, e as duas flags são
 * independentes.
 */

const { store } = vi.hoisted(() => ({
  store: {
    rows: [] as Task[],
    /** Linhas passadas para `insert` — o artefato que a assertiva inspeciona. */
    inserted: [] as Record<string, unknown>[],
    seq: 0,
  },
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@/lib/supabase", () => {
  function from(table: string) {
    if (table !== "task") throw new Error(`tabela inesperada: ${table}`);
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => Promise.resolve({ data: store.rows, error: null }),
      insert(rows: Record<string, unknown>[]) {
        store.inserted.push(...rows);
        const created = rows.map((row) => ({
          ...row,
          id: `gen-${++store.seq}`,
        })) as unknown as Task[];
        return { select: () => Promise.resolve({ data: created, error: null }) };
      },
    };
    return builder;
  }
  return { supabase: { from } };
});

function origin(overrides: Partial<Task>): Task {
  return {
    id: "origin",
    user_id: "user-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Série",
    status: "todo",
    tag_ids: [],
    due_date: "2026-06-10",
    recurrence_rule: { frequency: "monthly", interval: 1, time: "14:30" },
    linked_recurring_id: null,
    linked_installment_number: null,
    ...overrides,
  } as Task;
}

beforeEach(() => {
  vi.useFakeTimers();
  // Três meses depois da origem: 07/07, 10/08 e 10/09 ainda não; 10/07 e 10/08 sim.
  vi.setSystemTime(new Date(2026, 7, 16, 9, 0, 0));
  store.rows = [];
  store.inserted = [];
  store.seq = 0;
});

describe("materializeRecurringInstances — propagação de flags", () => {
  it("consulta mensal gera as ocorrências que faltam, todas com is_consultation", async () => {
    store.rows = [
      origin({
        id: "consulta-origem",
        title: "Cardiologista — Dr. Silva",
        is_consultation: true,
      }),
    ];

    const tasks = await fetchTasks();

    // 10/06 é a origem; faltavam 10/07 e 10/08 até hoje (16/08).
    expect(store.inserted.map((row) => row.due_date)).toEqual([
      "2026-07-10",
      "2026-08-10",
    ]);
    for (const row of store.inserted) {
      expect(row.is_consultation).toBe(true);
      expect(row.recurrence_origin_id).toBe("consulta-origem");
      expect(row.title).toBe("Cardiologista — Dr. Silva");
      // Horário da regra vira o horário da ocorrência — é o que põe a consulta na hora certa
      // da grade do calendário geral.
      expect(row.due_time).toBe("14:30");
      expect(row.status).toBe("todo");
    }

    // E as ocorrências criadas voltam junto com a origem, prontas pro calendário.
    expect(tasks).toHaveLength(3);
    expect(tasks.filter((t) => t.is_consultation)).toHaveLength(3);
  });

  it("não marca como consulta uma série comum nem uma medicação (flags independentes)", async () => {
    store.rows = [
      origin({ id: "comum", title: "Reunião mensal" }),
      origin({ id: "remedio", title: "Losartana", is_medication: true }),
    ];

    await fetchTasks();

    const comuns = store.inserted.filter((row) => row.recurrence_origin_id === "comum");
    const doses = store.inserted.filter((row) => row.recurrence_origin_id === "remedio");
    expect(comuns).toHaveLength(2);
    expect(doses).toHaveLength(2);
    for (const row of comuns) {
      expect(row.is_consultation).toBe(false);
      expect(row.is_medication).toBe(false);
    }
    for (const row of doses) {
      expect(row.is_medication).toBe(true);
      expect(row.is_consultation).toBe(false);
    }
  });

  it("ocorrência já materializada não é recriada", async () => {
    store.rows = [
      origin({ id: "consulta-origem", is_consultation: true }),
      {
        ...origin({}),
        id: "ja-existe",
        recurrence_origin_id: "consulta-origem",
        recurrence_rule: null,
        due_date: "2026-07-10",
        is_consultation: true,
      },
    ];

    await fetchTasks();

    expect(store.inserted.map((row) => row.due_date)).toEqual(["2026-08-10"]);
  });
});
