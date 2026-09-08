import { describe, expect, it } from "vitest";
import { collapseRecurringSeries } from "@/domain/tasks/agenda";
import { groupTaskSeries, taskSeriesGroupKey } from "@/domain/tasks/series";
import type { Task } from "@/types/tasks";

/**
 * Feature 101 — a agregação "uma linha por série" da página `/tasks/recurrences`.
 *
 * O caso que mais importa aqui é o do tratamento **backfillado** (049→064): a origem tem
 * `recurrence_rule` **e** `medication_id`, as doses não têm nenhum dos dois campos de série. Se a
 * chave delegasse a `taskSeriesKey` antes de olhar `medication_id`, o mesmo tratamento viraria uma
 * série de uma linha só + N tarefas avulsas.
 */

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Tarefa",
    status: "todo",
    tag_ids: [],
    due_date: null,
    due_time: null,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    ...overrides,
  };
}

describe("taskSeriesGroupKey", () => {
  it("recorrência simples: origem e ocorrências caem na mesma chave simple:<origem>", () => {
    const origin = makeTask({
      id: "orig-1",
      recurrence_rule: { frequency: "weekly", interval: 1 },
    });
    const occurrence = makeTask({ id: "occ-1", recurrence_origin_id: "orig-1" });
    expect(taskSeriesGroupKey(origin)).toBe("simple:orig-1");
    expect(taskSeriesGroupKey(occurrence)).toBe("simple:orig-1");
  });

  it("vínculo financeiro vira linked:<recorrência>", () => {
    expect(taskSeriesGroupKey(makeTask({ id: "t1", linked_recurring_id: "rec-7" }))).toBe(
      "linked:rec-7"
    );
  });

  it("medicação vence a delegação: a origem backfillada (regra + medication_id) cai em medication:<id>", () => {
    const origin = makeTask({
      id: "orig-med",
      medication_id: "med-1",
      is_medication: true,
      // O backfill 049→064 **preserva** a regra na origem — é justamente o que faria a delegação
      // ingênua devolver `simple:orig-med`.
      recurrence_rule: { frequency: "daily", interval: 1 },
    });
    expect(taskSeriesGroupKey(origin)).toBe("medication:med-1");
  });

  it("a dose materializada (só medication_id, sem regra nem origem) cai na MESMA chave da origem", () => {
    const origin = makeTask({
      id: "orig-med",
      medication_id: "med-1",
      recurrence_rule: { frequency: "daily", interval: 1 },
    });
    const dose = makeTask({ id: "dose-1", medication_id: "med-1" });
    expect(taskSeriesGroupKey(dose)).toBe(taskSeriesGroupKey(origin));
  });

  it("medicação vinculada a uma Recorrência Financeira ainda agrupa por tratamento", () => {
    // `medication_id` é testado antes de tudo, inclusive do vínculo financeiro: o tratamento é a
    // identidade mais forte da linha.
    expect(
      taskSeriesGroupKey(makeTask({ id: "t2", medication_id: "med-2", linked_recurring_id: "rec-1" }))
    ).toBe("medication:med-2");
  });

  it("tarefa sem recorrência nenhuma não tem chave", () => {
    expect(taskSeriesGroupKey(makeTask({ id: "avulsa" }))).toBeNull();
  });
});

describe("groupTaskSeries — agrupamento", () => {
  /** Uma base com os três `kind` de série ao mesmo tempo, mais duas tarefas avulsas. */
  function mixedBase(): Task[] {
    return [
      // simple: origem + 2 ocorrências
      makeTask({
        id: "orig-simple",
        title: "Regar as plantas",
        recurrence_rule: { frequency: "weekly", interval: 1 },
        due_date: "2026-09-01",
      }),
      makeTask({ id: "s-occ-1", recurrence_origin_id: "orig-simple", due_date: "2026-09-08" }),
      makeTask({ id: "s-occ-2", recurrence_origin_id: "orig-simple", due_date: "2026-09-15" }),
      // linked: 3 parcelas da mesma Recorrência Financeira
      makeTask({ id: "l-1", title: "Aluguel", linked_recurring_id: "rec-1", due_date: "2026-09-05" }),
      makeTask({ id: "l-2", title: "Aluguel", linked_recurring_id: "rec-1", due_date: "2026-10-05" }),
      makeTask({ id: "l-3", title: "Aluguel", linked_recurring_id: "rec-1", due_date: "2026-11-05" }),
      // medication: origem backfillada (regra + medication_id) + 2 doses sem campo de série
      makeTask({
        id: "orig-med",
        title: "Losartana",
        medication_id: "med-1",
        is_medication: true,
        recurrence_rule: { frequency: "daily", interval: 1 },
        due_date: "2026-09-02",
      }),
      makeTask({ id: "dose-1", title: "Losartana", medication_id: "med-1", due_date: "2026-09-03" }),
      makeTask({ id: "dose-2", title: "Losartana", medication_id: "med-1", due_date: "2026-09-04" }),
      // avulsas
      makeTask({ id: "avulsa-1", title: "Comprar pão", due_date: "2026-09-03" }),
      makeTask({ id: "avulsa-2", title: "Ligar pro dentista" }),
    ];
  }

  it("devolve exatamente três séries — uma por kind — e nenhuma linha para as tarefas avulsas", () => {
    const series = groupTaskSeries(mixedBase());
    expect(series).toHaveLength(3);
    expect(series.map((s) => s.kind).sort()).toEqual(["linked", "medication", "simple"]);
    const allIds = series.flatMap((s) => s.tasks.map((t) => t.id));
    expect(allIds).not.toContain("avulsa-1");
    expect(allIds).not.toContain("avulsa-2");
  });

  it("cada série reúne todas as suas ocorrências, com a origem certa", () => {
    const byKey = new Map(groupTaskSeries(mixedBase()).map((s) => [s.key, s]));

    const simple = byKey.get("simple:orig-simple")!;
    expect(simple.kind).toBe("simple");
    expect(simple.origin.id).toBe("orig-simple");
    expect(simple.tasks.map((t) => t.id)).toEqual(["orig-simple", "s-occ-1", "s-occ-2"]);
    expect(simple.occurrenceCount).toBe(3);

    const linked = byKey.get("linked:rec-1")!;
    expect(linked.kind).toBe("linked");
    // Série financeira não tem regra em tarefa nenhuma: a origem é a primeira parcela.
    expect(linked.origin.id).toBe("l-1");
    expect(linked.occurrenceCount).toBe(3);
  });

  it("a origem de medicação backfillada cai no MESMO grupo das doses, não numa série própria", () => {
    // É o caso que a decisão da feature chama de armadilha: a origem tem `recurrence_rule` **e**
    // `medication_id`; as doses não têm nenhum dos dois campos de série. Delegando primeiro a
    // `taskSeriesKey`, a origem viraria `simple:orig-med` e as doses, tarefas avulsas.
    const series = groupTaskSeries(mixedBase());
    expect(series.map((s) => s.key)).not.toContain("simple:orig-med");

    const medication = series.find((s) => s.kind === "medication")!;
    expect(medication.key).toBe("medication:med-1");
    expect(medication.tasks.map((t) => t.id)).toEqual(["orig-med", "dose-1", "dose-2"]);
    expect(medication.occurrenceCount).toBe(3);
    expect(medication.origin.id).toBe("orig-med");
  });

  it("base sem série nenhuma devolve lista vazia", () => {
    expect(
      groupTaskSeries([makeTask({ id: "a" }), makeTask({ id: "b", due_date: "2026-09-01" })])
    ).toEqual([]);
  });
});

describe("groupTaskSeries — ordenação e contrato de pureza", () => {
  it("ativas primeiro por próxima ocorrência asc; encerradas depois, por última ocorrência desc", () => {
    const series = groupTaskSeries([
      // Encerrada antiga.
      makeTask({ id: "a1", recurrence_origin_id: "a", due_date: "2026-01-10", status: "done" }),
      makeTask({ id: "a", recurrence_rule: { frequency: "daily", interval: 1 }, due_date: "2026-01-05", status: "done" }),
      // Ativa, próxima em 2026-09-01.
      makeTask({ id: "b", recurrence_rule: { frequency: "weekly", interval: 1 }, due_date: "2026-09-01" }),
      // Encerrada recente.
      makeTask({ id: "c", recurrence_rule: { frequency: "daily", interval: 1 }, due_date: "2026-06-30", status: "done" }),
      // Ativa, próxima em 2026-08-20 — deve vir antes de "b".
      makeTask({ id: "d", recurrence_rule: { frequency: "monthly", interval: 1 }, due_date: "2026-08-20" }),
    ]);

    expect(series.map((s) => s.key)).toEqual([
      "simple:d", // ativa, 2026-08-20
      "simple:b", // ativa, 2026-09-01
      "simple:c", // encerrada, última em 2026-06-30
      "simple:a", // encerrada, última em 2026-01-10
    ]);
    expect(series.map((s) => s.active)).toEqual([true, true, false, false]);
  });

  it("não muta a entrada — nem a ordem do array, nem as tarefas", () => {
    const input = [
      makeTask({ id: "z", recurrence_rule: { frequency: "daily", interval: 1 }, due_date: "2026-09-09" }),
      makeTask({ id: "y", recurrence_origin_id: "z", due_date: "2026-03-03" }),
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    groupTaskSeries(input);
    expect(input).toEqual(snapshot);
    expect(input.map((t) => t.id)).toEqual(["z", "y"]);
  });

  it("a origem é a linha que carrega a recurrence_rule, não a de menor prazo", () => {
    const [serie] = groupTaskSeries([
      makeTask({ id: "occ", recurrence_origin_id: "orig", due_date: "2026-01-01" }),
      makeTask({
        id: "orig",
        recurrence_rule: { frequency: "daily", interval: 1 },
        due_date: "2026-05-05",
      }),
    ]);
    expect(serie.origin.id).toBe("orig");
    // ...mas as ocorrências saem em ordem de prazo, independente de quem é a origem.
    expect(serie.tasks.map((t) => t.id)).toEqual(["occ", "orig"]);
  });
});

/** O barril `@/domain/tasks` é o que as páginas importam — se `series.ts` não estiver lá, a tela
 * não compila. Este teste é a prova de que a reexportação existe (e não colide com `agenda.ts`). */
describe("barril @/domain/tasks", () => {
  it("reexporta groupTaskSeries e taskSeriesGroupKey, e eles são os mesmos de series.ts", async () => {
    const barrel = await import("@/domain/tasks");
    expect(barrel.groupTaskSeries).toBe(groupTaskSeries);
    expect(barrel.taskSeriesGroupKey).toBe(taskSeriesGroupKey);
    expect(typeof barrel.taskSeriesKey).toBe("function");
    expect(
      barrel.groupTaskSeries([
        makeTask({ id: "b1", recurrence_rule: { frequency: "daily", interval: 1 }, due_date: "2026-09-01" }),
      ])
    ).toHaveLength(1);
  });
});

/**
 * A divergência **proposital** em relação a `collapseRecurringSeries` (`agenda.ts`), que é a razão
 * de esta função existir: lá, série sem ocorrência em aberto some da lista inteira; aqui ela fica,
 * marcada `active: false`. Uma recorrência com `count`/`until` esgotados é literalmente invisível
 * no app fora desta tela.
 */
describe("groupTaskSeries — série encerrada não some", () => {
  const finished = [
    makeTask({
      id: "orig-fim",
      title: "Fisioterapia",
      recurrence_rule: { frequency: "weekly", interval: 1, count: 3 },
      due_date: "2026-02-02",
      status: "done",
    }),
    makeTask({ id: "fim-2", recurrence_origin_id: "orig-fim", due_date: "2026-02-09", status: "done" }),
    makeTask({ id: "fim-3", recurrence_origin_id: "orig-fim", due_date: "2026-02-16", status: "done" }),
  ];

  it("todas as ocorrências concluídas: a série continua na saída, com active: false", () => {
    const series = groupTaskSeries(finished);
    expect(series).toHaveLength(1);
    expect(series[0].key).toBe("simple:orig-fim");
    expect(series[0].active).toBe(false);
    expect(series[0].nextOpen).toBeNull();
    expect(series[0].lastOccurrence?.id).toBe("fim-3");
    expect(series[0].doneCount).toBe(3);
    expect(series[0].occurrenceCount).toBe(3);
  });

  it("collapseRecurringSeries descarta a mesma série — é a diferença que justifica a função nova", () => {
    expect(collapseRecurringSeries(finished)).toEqual([]);
    expect(groupTaskSeries(finished)).toHaveLength(1);
  });

  it("uma única ocorrência em aberto no meio de concluídas já mantém a série ativa", () => {
    const [serie] = groupTaskSeries([
      ...finished,
      makeTask({ id: "fim-4", recurrence_origin_id: "orig-fim", due_date: "2026-02-23" }),
    ]);
    expect(serie.active).toBe(true);
    expect(serie.nextOpen?.id).toBe("fim-4");
    expect(serie.doneCount).toBe(3);
    expect(serie.occurrenceCount).toBe(4);
  });

  it("tratamento encerrado (doses todas tomadas) também sobrevive como série encerrada", () => {
    const [serie] = groupTaskSeries([
      makeTask({ id: "m-1", medication_id: "med-9", due_date: "2026-01-01", status: "done" }),
      makeTask({ id: "m-2", medication_id: "med-9", due_date: "2026-01-02", status: "done" }),
    ]);
    expect(serie.key).toBe("medication:med-9");
    expect(serie.active).toBe(false);
    expect(serie.kind).toBe("medication");
  });
});

describe("groupTaskSeries — bordas", () => {
  it("entrada vazia devolve lista vazia", () => {
    expect(groupTaskSeries([])).toEqual([]);
  });

  it("série de uma ocorrência só: a origem é ela mesma, e ela é nextOpen e lastOccurrence", () => {
    const [serie] = groupTaskSeries([
      makeTask({
        id: "solo",
        recurrence_rule: { frequency: "monthly", interval: 1, count: 1 },
        due_date: "2026-12-01",
      }),
    ]);
    expect(serie.occurrenceCount).toBe(1);
    expect(serie.doneCount).toBe(0);
    expect(serie.origin.id).toBe("solo");
    expect(serie.nextOpen?.id).toBe("solo");
    expect(serie.lastOccurrence?.id).toBe("solo");
    expect(serie.active).toBe(true);
  });

  it("ocorrência sem due_date vai para o fim da série e não vira a lastOccurrence", () => {
    const [serie] = groupTaskSeries([
      makeTask({ id: "sem-prazo", recurrence_origin_id: "o", due_date: null }),
      makeTask({ id: "o", recurrence_rule: { frequency: "daily", interval: 1 }, due_date: "2026-03-01" }),
      makeTask({ id: "o2", recurrence_origin_id: "o", due_date: "2026-03-02" }),
    ]);
    expect(serie.tasks.map((t) => t.id)).toEqual(["o", "o2", "sem-prazo"]);
    // A "última ocorrência" é a de maior prazo — uma linha sem prazo não diz até onde a série foi.
    expect(serie.lastOccurrence?.id).toBe("o2");
    expect(serie.occurrenceCount).toBe(3);
  });

  it("série inteira sem prazo nenhum ainda tem lastOccurrence (a única informação que há)", () => {
    const [serie] = groupTaskSeries([
      makeTask({ id: "np", recurrence_rule: { frequency: "daily", interval: 1 }, due_date: null }),
      makeTask({ id: "np2", recurrence_origin_id: "np", due_date: null }),
    ]);
    expect(serie.lastOccurrence).not.toBeNull();
    expect(serie.occurrenceCount).toBe(2);
    expect(serie.active).toBe(true);
  });

  it("contagens: occurrenceCount é o total real e doneCount só as concluídas", () => {
    const [serie] = groupTaskSeries([
      makeTask({ id: "c", recurrence_rule: { frequency: "daily", interval: 1 }, due_date: "2026-04-01", status: "done" }),
      makeTask({ id: "c2", recurrence_origin_id: "c", due_date: "2026-04-02", status: "done" }),
      makeTask({ id: "c3", recurrence_origin_id: "c", due_date: "2026-04-03", status: "doing" }),
      makeTask({ id: "c4", recurrence_origin_id: "c", due_date: "2026-04-04" }),
    ]);
    expect(serie.occurrenceCount).toBe(4);
    expect(serie.doneCount).toBe(2);
    // "doing" não é "done": a próxima em aberto é ela, não a de prazo mais longe.
    expect(serie.nextOpen?.id).toBe("c3");
    expect(serie.lastOccurrence?.id).toBe("c4");
  });

  it("ativas e encerradas misturadas saem nos dois blocos, cada um com sua ordem", () => {
    const series = groupTaskSeries([
      makeTask({ id: "fim-a", recurrence_rule: { frequency: "daily", interval: 1 }, due_date: "2026-05-01", status: "done" }),
      makeTask({ id: "viva-a", recurrence_rule: { frequency: "daily", interval: 1 }, due_date: "2026-10-10" }),
      makeTask({ id: "fim-b", recurrence_rule: { frequency: "daily", interval: 1 }, due_date: "2026-07-01", status: "done" }),
      makeTask({ id: "viva-b", recurrence_rule: { frequency: "daily", interval: 1 }, due_date: "2026-09-09" }),
    ]);
    expect(series.map((s) => s.key)).toEqual([
      "simple:viva-b", // ativa, 2026-09-09
      "simple:viva-a", // ativa, 2026-10-10
      "simple:fim-b", // encerrada, 2026-07-01 (mais recente)
      "simple:fim-a", // encerrada, 2026-05-01
    ]);
  });

  it("série ativa sem prazo nenhum fica depois das ativas com prazo, mas antes das encerradas", () => {
    const series = groupTaskSeries([
      makeTask({ id: "fim", recurrence_rule: { frequency: "daily", interval: 1 }, due_date: "2026-06-01", status: "done" }),
      makeTask({ id: "sem", recurrence_rule: { frequency: "daily", interval: 1 }, due_date: null }),
      makeTask({ id: "com", recurrence_rule: { frequency: "daily", interval: 1 }, due_date: "2026-09-01" }),
    ]);
    expect(series.map((s) => s.key)).toEqual(["simple:com", "simple:sem", "simple:fim"]);
  });
});
