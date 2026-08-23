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
    recurring: [] as Record<string, unknown>[],
    /** Índices únicos já ocupados — ver `uniqueKeyOf`. */
    keys: new Set<string>(),
    seq: 0,
  },
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

// `materializeLinkedInstances` (séries vindas da Recorrência Financeira) consulta
// `recurring_transaction`; o Supabase falso abaixo só conhece `task`, então a leitura vem daqui.
vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactionsByIds: vi.fn(async () => store.recurring),
}));

/**
 * Chave dos dois índices únicos parciais que a migration da feature 074 cria em `public.task`:
 * `(medication_id, due_date, dose_time)` e `(recurrence_origin_id, due_date)` com
 * `linked_recurring_id is null`. `null` = a linha não é coberta por índice nenhum (parcela de
 * Recorrência Financeira, tarefa avulsa) e pode repetir à vontade.
 */
function uniqueKeyOf(row: Record<string, unknown>): string | null {
  if (row.medication_id) return `med:${row.medication_id}|${row.due_date}|${row.dose_time ?? ""}`;
  if (row.recurrence_origin_id && !row.linked_recurring_id) {
    return `occ:${row.recurrence_origin_id}|${row.due_date}`;
  }
  return null;
}

vi.mock("@/lib/supabase", () => {
  function from(table: string) {
    if (table !== "task") throw new Error(`tabela inesperada: ${table}`);

    /**
     * Grava as linhas aplicando os índices únicos como o Postgres aplicaria. `ignoreDuplicates`
     * é o `on conflict do nothing`: a linha repetida some em silêncio em vez de derrubar a
     * chamada — é o que faz duas `fetchTasks()` concorrentes virarem uma materialização só.
     */
    function write(rows: Record<string, unknown>[], ignoreDuplicates: boolean) {
      store.inserted.push(...rows);
      const created: Task[] = [];
      for (const row of rows) {
        const key = uniqueKeyOf(row);
        if (key && store.keys.has(key)) {
          if (ignoreDuplicates) continue;
          return {
            select: () =>
              Promise.resolve({
                data: null,
                error: {
                  message: `duplicate key value violates unique constraint (${key})`,
                },
              }),
          };
        }
        if (key) store.keys.add(key);
        const persisted = { ...row, id: `gen-${++store.seq}` } as unknown as Task;
        store.rows.push(persisted);
        created.push(persisted);
      }
      return { select: () => Promise.resolve({ data: created, error: null }) };
    }

    const builder = {
      select: () => builder,
      eq: () => builder,
      // `[...store.rows]` de propósito: a leitura é um instantâneo, como no banco. Sem a cópia, uma
      // segunda `fetchTasks()` concorrente enxergaria as linhas que a primeira acabou de inserir e
      // a corrida do mecanismo 3 nunca aconteceria no teste.
      order: () => Promise.resolve({ data: [...store.rows], error: null }),
      insert: (rows: Record<string, unknown>[]) => write(rows, false),
      upsert: (rows: Record<string, unknown>[], options?: { ignoreDuplicates?: boolean }) =>
        write(rows, options?.ignoreDuplicates === true),
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
  store.recurring = [];
  store.keys = new Set<string>();
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

  it("série pontual (feature 070) gera ocorrências pontuais, sem contaminar as outras flags", async () => {
    store.rows = [
      origin({ id: "lencol", title: "Trocar lençol", is_quick: true }),
      origin({ id: "reuniao", title: "Reunião mensal" }),
    ];

    const tasks = await fetchTasks();

    const pontuais = store.inserted.filter((row) => row.recurrence_origin_id === "lencol");
    const comuns = store.inserted.filter((row) => row.recurrence_origin_id === "reuniao");
    expect(pontuais.map((row) => row.due_date)).toEqual(["2026-07-10", "2026-08-10"]);
    for (const row of pontuais) {
      expect(row.is_quick).toBe(true);
      // Pontual não é medicação nem consulta — as flags continuam independentes.
      expect(row.is_medication).toBe(false);
      expect(row.is_consultation).toBe(false);
    }
    // Série comum não vira bolinha por tabela.
    expect(comuns).toHaveLength(2);
    for (const row of comuns) {
      expect(row.is_quick).toBe(false);
    }

    // Origem + 2 ocorrências de cada série, e só a série pontual sai pontual pro calendário.
    expect(tasks.filter((t) => t.is_quick)).toHaveLength(3);
  });

  it("dose pontual: is_quick e is_medication viajam juntas para as ocorrências (pré-requisito da 071)", async () => {
    store.rows = [
      origin({ id: "losartana", title: "Losartana", is_medication: true, is_quick: true }),
    ];

    await fetchTasks();

    expect(store.inserted).toHaveLength(2);
    for (const row of store.inserted) {
      expect(row.is_medication).toBe(true);
      expect(row.is_quick).toBe(true);
    }
  });

  it("ocorrência nasce com o ícone da origem (preset, imagem ou nenhum)", async () => {
    // Feature 073: o ícone é propriedade da série. Antes desta feature a materialização não
    // copiava `icon_key`/`icon_url`, então a ocorrência real nascia sem ícone enquanto a
    // ocorrência virtual do mesmo dia na Agenda (spread da origem) aparecia com ele.
    store.rows = [
      origin({ id: "preset", title: "Academia", icon_key: "dumbbell", icon_url: null }),
      origin({
        id: "imagem",
        title: "Aula de violão",
        icon_key: null,
        icon_url: "https://cdn.example/user-1/imagem.png",
      }),
      origin({ id: "sem-icone", title: "Reunião mensal" }),
    ];

    await fetchTasks();

    const presets = store.inserted.filter((row) => row.recurrence_origin_id === "preset");
    const imagens = store.inserted.filter((row) => row.recurrence_origin_id === "imagem");
    const semIcone = store.inserted.filter((row) => row.recurrence_origin_id === "sem-icone");
    expect(presets).toHaveLength(2);
    expect(imagens).toHaveLength(2);
    expect(semIcone).toHaveLength(2);
    for (const row of presets) {
      expect(row.icon_key).toBe("dumbbell");
      expect(row.icon_url).toBeNull();
    }
    for (const row of imagens) {
      expect(row.icon_url).toBe("https://cdn.example/user-1/imagem.png");
      expect(row.icon_key).toBeNull();
    }
    for (const row of semIcone) {
      expect(row.icon_key).toBeNull();
      expect(row.icon_url).toBeNull();
    }
  });

  it("parcela vinculada à Recorrência Financeira também nasce com o ícone do template", async () => {
    // Feature 073: `materializeLinkedInstances` copia seu próprio subconjunto de campos e tinha o
    // mesmo buraco de `materializeRecurringInstances`.
    store.rows = [
      origin({
        id: "template",
        title: "Internet",
        recurrence_rule: null,
        due_date: null,
        linked_recurring_id: "rec-1",
        linked_installment_number: null,
        icon_key: "wifi",
        icon_url: null,
      }),
    ];
    store.recurring = [
      {
        id: "rec-1",
        status: true,
        payment_start_date: "2026-06-05",
        created_at: "2026-06-01T00:00:00Z",
        due_day: 5,
        installment_count: 3,
        validity: null,
        frequency: "Mensal",
        paid_parcels: [],
      },
    ];

    await fetchTasks();

    expect(store.inserted).toHaveLength(3);
    for (const row of store.inserted) {
      expect(row.linked_recurring_id).toBe("rec-1");
      expect(row.recurrence_origin_id).toBe("template");
      expect(row.icon_key).toBe("wifi");
      expect(row.icon_url).toBeNull();
    }
  });

  /**
   * Feature 074, mecanismo 3 — `fetchTasks` é uma leitura que **escreve**: um `select *` seguido de
   * até três passes de `insert`, com deduplicação só em memória. Duas chamadas concorrentes (a
   * `TaskList` monta a `AgendaGrid` dentro da aba "agenda", e o `<StrictMode>` duplica efeitos em
   * dev) leem o mesmo "antes", calculam o mesmo `missing` e escrevem as duas.
   *
   * O conserto é em duas camadas, e o Supabase falso acima modela as duas: o índice único no banco
   * (migration desta feature) e o `on conflict do nothing` no cliente, para a corrida virar no-op em
   * vez de erro vermelho na tela.
   */
  describe("duas fetchTasks() concorrentes (mecanismo 3)", () => {
    it("materializam um conjunto só de ocorrências, sem erro de chave duplicada", async () => {
      store.rows = [origin({ id: "consulta-origem", is_consultation: true })];

      await Promise.all([fetchTasks(), fetchTasks()]);

      // As duas leram o mesmo "antes" e tentaram inserir 10/07 e 10/08 cada uma...
      expect(store.inserted).toHaveLength(4);
      // ...e o banco ficou com uma linha por (série, dia).
      const materializadas = store.rows.filter((row) => row.recurrence_origin_id === "consulta-origem");
      expect(materializadas.map((row) => row.due_date).sort()).toEqual([
        "2026-07-10",
        "2026-08-10",
      ]);
    });

    it("a corrida não deixa a chamada estourar para o usuário", async () => {
      store.rows = [origin({ id: "consulta-origem", is_consultation: true })];

      // A promessa **resolve**: uma dose/ocorrência já criada por outra aba não pode virar toast de
      // erro na agenda.
      await expect(Promise.all([fetchTasks(), fetchTasks()])).resolves.toHaveLength(2);
    });

    it("parcelas de Recorrência Financeira do mesmo dia continuam podendo coexistir", async () => {
      // O índice único de ocorrência exclui `linked_recurring_id not null` de propósito: a chave da
      // parcela é `linked_installment_number`, e duas parcelas podem cair no mesmo `due_date`.
      store.rows = [
        origin({
          id: "template",
          title: "Internet",
          recurrence_rule: null,
          due_date: null,
          linked_recurring_id: "rec-1",
          linked_installment_number: null,
        }),
      ];
      store.recurring = [
        {
          id: "rec-1",
          status: true,
          payment_start_date: "2026-06-05",
          created_at: "2026-06-01T00:00:00Z",
          due_day: 5,
          installment_count: 3,
          validity: null,
          frequency: "Mensal",
          paid_parcels: [],
        },
      ];

      await fetchTasks();

      const parcelas = store.rows.filter((row) => row.linked_installment_number != null);
      expect(parcelas).toHaveLength(3);
    });
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
