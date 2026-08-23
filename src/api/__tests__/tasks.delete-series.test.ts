import { beforeEach, describe, expect, it, vi } from "vitest";
import { countTaskSeries, deleteTaskSeries } from "@/api/tasks";

/**
 * Feature 075 — o escopo da exclusão é resolvido **no servidor**.
 *
 * O Supabase falso abaixo guarda linhas de verdade e **executa** os filtros (`eq`, `or`, `gte`,
 * `is`, `neq`), então cada assertiva olha o estado final da tabela — quem sobrou e quem saiu —, não
 * a query montada. É o que prova, sem navegador e sem banco, as três coisas que a feature promete:
 *
 * 1. apagar a série de uma ocorrência alcança a origem e as irmãs;
 * 2. apagar as doses de um tratamento alcança a **união** `id = origem OR recurrence_origin_id =
 *    origem OR medication_id = <med>` (a origem backfillada da 074 é série e dose ao mesmo tempo);
 * 3. o escopo **não** depende da lista carregada no cliente — nada aqui recebe um array de tarefas.
 */

type Row = Record<string, unknown> & { id: string };

const { store } = vi.hoisted(() => ({
  store: { rows: [] as Row[], error: null as string | null, deletes: 0 },
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@/lib/supabase", () => {
  function matchesOr(row: Row, expression: string): boolean {
    return expression.split(",").some((clause) => {
      const [column, op, value] = clause.split(".");
      if (op !== "eq") throw new Error(`operador não suportado no or(): ${op}`);
      return row[column] === value;
    });
  }

  function from(table: string) {
    if (table !== "task") throw new Error(`tabela inesperada: ${table}`);
    let deleting = false;
    const predicates: ((row: Row) => boolean)[] = [];

    const selected = () => store.rows.filter((row) => predicates.every((p) => p(row)));

    const builder = {
      select() {
        return builder;
      },
      delete() {
        deleting = true;
        store.deletes += 1;
        return builder;
      },
      eq(column: string, value: unknown) {
        predicates.push((row) => row[column] === value);
        return builder;
      },
      neq(column: string, value: unknown) {
        predicates.push((row) => row[column] !== value);
        return builder;
      },
      is(column: string, value: unknown) {
        if (value !== null) throw new Error("is() só é usado com null neste código");
        predicates.push((row) => row[column] == null);
        return builder;
      },
      gte(column: string, value: string) {
        predicates.push((row) => typeof row[column] === "string" && (row[column] as string) >= value);
        return builder;
      },
      or(expression: string) {
        predicates.push((row) => matchesOr(row, expression));
        return builder;
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        if (store.error) {
          return Promise.resolve({ count: null, data: null, error: { message: store.error } }).then(
            resolve,
            reject
          );
        }
        const hit = selected();
        if (deleting) {
          store.rows = store.rows.filter((row) => !hit.includes(row));
          return Promise.resolve({ count: null, data: null, error: null }).then(resolve, reject);
        }
        return Promise.resolve({ count: hit.length, data: null, error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  return { supabase: { from } };
});

function row(overrides: Partial<Row> & { id: string }): Row {
  return {
    user_id: "user-1",
    status: "todo",
    completed_at: null,
    due_date: null,
    recurrence_rule: null,
    recurrence_origin_id: null,
    linked_recurring_id: null,
    medication_id: null,
    ...overrides,
  };
}

const ids = () => store.rows.map((r) => r.id);

beforeEach(() => {
  vi.useFakeTimers();
  // Hoje é 17/08/2026 — tudo antes disso é passado, tudo depois é futuro.
  vi.setSystemTime(new Date(2026, 7, 17, 9, 0, 0));
  store.rows = [];
  store.error = null;
  store.deletes = 0;
});

describe("deleteTaskSeries — recorrência simples", () => {
  /** Série de três ocorrências + uma série vizinha que não pode ser tocada. */
  function serie() {
    return [
      row({ id: "origem", recurrence_rule: { frequency: "weekly", interval: 1 }, due_date: "2026-08-01" }),
      row({ id: "oco-1", recurrence_origin_id: "origem", due_date: "2026-08-08", status: "done", completed_at: "2026-08-08T10:00:00Z" }),
      row({ id: "oco-2", recurrence_origin_id: "origem", due_date: "2026-08-15" }),
      row({ id: "vizinha", recurrence_rule: { frequency: "daily", interval: 1 }, due_date: "2026-08-01" }),
      row({ id: "vizinha-oco", recurrence_origin_id: "vizinha", due_date: "2026-08-02" }),
      row({ id: "avulsa", due_date: "2026-08-10" }),
    ];
  }

  it("apagar a série a partir de uma ocorrência alcança a origem e as irmãs", async () => {
    store.rows = serie();

    const apagadas = await deleteTaskSeries(
      { id: "oco-2", recurrence_origin_id: "origem" },
      { mode: "series" }
    );

    expect(apagadas).toBe(3);
    expect(ids()).toEqual(["vizinha", "vizinha-oco", "avulsa"]);
  });

  it("apagar a partir da origem alcança as ocorrências, inclusive as já concluídas", async () => {
    store.rows = serie();

    await deleteTaskSeries(
      { id: "origem", recurrence_rule: { frequency: "weekly", interval: 1 } },
      { mode: "series" }
    );

    // "Todas as ocorrências" inclui `oco-1`, que estava concluída — é o contrato da feature 028.
    expect(ids()).toEqual(["vizinha", "vizinha-oco", "avulsa"]);
  });

  it("'apagar só esta' numa ocorrência não encosta na série", async () => {
    store.rows = serie();

    const apagadas = await deleteTaskSeries(
      { id: "oco-2", recurrence_origin_id: "origem" },
      { mode: "single" }
    );

    expect(apagadas).toBe(1);
    expect(ids()).toEqual(["origem", "oco-1", "vizinha", "vizinha-oco", "avulsa"]);
  });

  it("o escopo não depende da lista carregada no cliente", async () => {
    // A regressão do bug do filtro: `findSeriesTasks` filtrava o array já recortado por
    // projeto/tag/status da tela. Aqui a função só recebe **uma** tarefa — não existe array para
    // filtrar —, então nenhum filtro de tela consegue encolher o que vai ser apagado.
    store.rows = serie();

    await deleteTaskSeries({ id: "oco-1", recurrence_origin_id: "origem" }, { mode: "series" });

    expect(ids()).toEqual(["vizinha", "vizinha-oco", "avulsa"]);
  });

  it("parcela de Recorrência Financeira degrada para exclusão única", async () => {
    store.rows = [
      row({ id: "template", linked_recurring_id: "rec-1" }),
      row({ id: "parcela-1", recurrence_origin_id: "template", linked_recurring_id: "rec-1" }),
      row({ id: "parcela-2", recurrence_origin_id: "template", linked_recurring_id: "rec-1" }),
    ];

    await deleteTaskSeries(
      { id: "parcela-2", recurrence_origin_id: "template", linked_recurring_id: "rec-1" },
      { mode: "series" }
    );

    expect(ids()).toEqual(["template", "parcela-1"]);
  });
});

describe("deleteTaskSeries — doses de medicação", () => {
  /**
   * O cenário da "SEMTRI": origem backfillada (série **e** dose), uma ocorrência antiga da 049 que o
   * backfill marcou, doses novas da 064 no passado e no futuro, e um segundo tratamento intacto.
   */
  function tratamento() {
    return [
      row({
        id: "origem-med",
        recurrence_rule: { frequency: "daily", interval: 1 },
        medication_id: "med-1",
        due_date: "2026-08-10",
      }),
      row({ id: "oco-legada", recurrence_origin_id: "origem-med", medication_id: "med-1", due_date: "2026-08-11" }),
      row({ id: "dose-passada", medication_id: "med-1", due_date: "2026-08-15" }),
      row({
        id: "dose-tomada",
        medication_id: "med-1",
        due_date: "2026-08-16",
        status: "done",
        completed_at: "2026-08-16T08:05:00Z",
      }),
      row({ id: "dose-hoje", medication_id: "med-1", due_date: "2026-08-17" }),
      row({ id: "dose-futura", medication_id: "med-1", due_date: "2026-08-20" }),
      row({
        id: "dose-futura-tomada",
        medication_id: "med-1",
        due_date: "2026-08-21",
        status: "done",
        completed_at: "2026-08-21T08:05:00Z",
      }),
      row({ id: "outro-tratamento", medication_id: "med-2", due_date: "2026-08-20" }),
      row({ id: "avulsa", due_date: "2026-08-20" }),
    ];
  }

  it("apagar todas as doses alcança a união série + tratamento, e só o tratamento certo", async () => {
    store.rows = tratamento();

    const apagadas = await deleteTaskSeries(
      { id: "dose-hoje", medication_id: "med-1" },
      { mode: "all-doses", includeCompleted: true }
    );

    // Sete linhas do med-1: a origem, a ocorrência legada e as cinco doses.
    expect(apagadas).toBe(7);
    expect(ids()).toEqual(["outro-tratamento", "avulsa"]);
  });

  it("sem 'incluir as tomadas', o histórico de adesão fica de pé", async () => {
    store.rows = tratamento();

    const apagadas = await deleteTaskSeries(
      { id: "dose-hoje", medication_id: "med-1" },
      { mode: "all-doses" }
    );

    expect(apagadas).toBe(5);
    expect(ids()).toEqual(["dose-tomada", "dose-futura-tomada", "outro-tratamento", "avulsa"]);
  });

  it("'encerrar o tratamento' não toca no passado nem no que já foi tomado", async () => {
    store.rows = tratamento();

    const apagadas = await deleteTaskSeries(
      { id: "dose-hoje", medication_id: "med-1" },
      { mode: "end-treatment" }
    );

    // Saem só `dose-hoje` (hoje conta como futuro: o dia ainda não acabou) e `dose-futura`.
    expect(apagadas).toBe(2);
    expect(ids()).toEqual([
      "origem-med",
      "oco-legada",
      "dose-passada",
      "dose-tomada",
      "dose-futura-tomada",
      "outro-tratamento",
      "avulsa",
    ]);
  });

  it("a partir da origem backfillada o escopo é o mesmo — ela é série e dose ao mesmo tempo", async () => {
    store.rows = tratamento();

    await deleteTaskSeries(
      {
        id: "origem-med",
        recurrence_rule: { frequency: "daily", interval: 1 },
        medication_id: "med-1",
      },
      { mode: "all-doses", includeCompleted: true }
    );

    expect(ids()).toEqual(["outro-tratamento", "avulsa"]);
  });

  it("uma dose pura não arrasta a série de ninguém (não tem origem para resolver)", async () => {
    store.rows = [
      row({ id: "dose", medication_id: "med-1", due_date: "2026-08-20" }),
      // Mesmo id de série de outra tarefa qualquer: nada aqui pode entrar pelo lado da recorrência.
      row({ id: "serie-alheia", recurrence_origin_id: "dose", due_date: "2026-08-20" }),
    ];

    await deleteTaskSeries({ id: "dose", medication_id: "med-1" }, { mode: "all-doses" });

    expect(ids()).toEqual(["serie-alheia"]);
  });

  it("'apagar só esta dose' apaga uma linha e deixa o resto do tratamento", async () => {
    store.rows = tratamento();

    const apagadas = await deleteTaskSeries(
      { id: "dose-hoje", medication_id: "med-1" },
      { mode: "single" }
    );

    expect(apagadas).toBe(1);
    expect(ids()).not.toContain("dose-hoje");
    expect(ids()).toHaveLength(8);
  });
});

describe("countTaskSeries", () => {
  it("conta exatamente o que a exclusão apagaria, sem apagar nada", async () => {
    store.rows = [
      row({ id: "origem", recurrence_rule: { frequency: "daily", interval: 1 } }),
      row({ id: "oco-1", recurrence_origin_id: "origem" }),
      row({ id: "oco-2", recurrence_origin_id: "origem" }),
      row({ id: "avulsa" }),
    ];

    const total = await countTaskSeries(
      { id: "oco-1", recurrence_origin_id: "origem" },
      { mode: "series" }
    );

    expect(total).toBe(3);
    expect(store.deletes).toBe(0);
    expect(ids()).toHaveLength(4);
  });

  it("o número mostrado é o mesmo que sai — contagem e exclusão usam os mesmos filtros", async () => {
    store.rows = [
      row({ id: "dose-passada", medication_id: "med-1", due_date: "2026-08-10" }),
      row({ id: "dose-futura", medication_id: "med-1", due_date: "2026-08-20" }),
      row({
        id: "dose-futura-tomada",
        medication_id: "med-1",
        due_date: "2026-08-21",
        status: "done",
        completed_at: "2026-08-21T08:00:00Z",
      }),
    ];
    const dose = { id: "dose-futura", medication_id: "med-1" };

    const prometido = await countTaskSeries(dose, { mode: "end-treatment" });
    const apagadas = await deleteTaskSeries(dose, { mode: "end-treatment" });

    expect(prometido).toBe(1);
    expect(apagadas).toBe(prometido);
  });

  it("erro na contagem sobe para o chamador em vez de virar 0", async () => {
    store.rows = [row({ id: "avulsa" })];
    store.error = "permission denied for table task";

    await expect(countTaskSeries({ id: "avulsa" }, { mode: "single" })).rejects.toThrow(
      "permission denied"
    );
  });

  it("erro na exclusão sobe e nada é apagado", async () => {
    store.rows = [row({ id: "origem", recurrence_rule: { frequency: "daily", interval: 1 } })];
    store.error = "permission denied for table task";

    await expect(
      deleteTaskSeries({ id: "origem", recurrence_rule: { frequency: "daily", interval: 1 } }, { mode: "series" })
    ).rejects.toThrow("permission denied");
    expect(ids()).toEqual(["origem"]);
  });
});
