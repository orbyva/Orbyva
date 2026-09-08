import { describe, expect, it } from "vitest";
import {
  AGENDA_BUCKET_ORDER,
  bucketForDueDate,
  collapseRecurringSeries,
  DUE_DATE_SHORTCUTS,
  dueDateForShortcut,
  filterTasksByStatusView,
  findSeriesTasks,
  groupTasksByAgendaBucket,
  isMedicationDoseTask,
  isRecurringTask,
  isSimpleRecurringTask,
  sortTasksByCompletedAtDesc,
  taskSeriesKey,
} from "@/domain/tasks/agenda";

const TODAY = "2026-08-06"; // quinta-feira

describe("bucketForDueDate", () => {
  it("sem prazo cai em no_date", () => {
    expect(bucketForDueDate(null, TODAY)).toBe("no_date");
  });

  it("prazo no passado é overdue", () => {
    expect(bucketForDueDate("2026-08-05", TODAY)).toBe("overdue");
  });

  it("prazo hoje é today", () => {
    expect(bucketForDueDate(TODAY, TODAY)).toBe("today");
  });

  it("prazo no resto da semana civil é this_week", () => {
    expect(bucketForDueDate("2026-08-08", TODAY)).toBe("this_week"); // sábado
  });

  it("prazo além da semana mas dentro do mês é this_month", () => {
    expect(bucketForDueDate("2026-08-20", TODAY)).toBe("this_month");
  });

  it("prazo no próximo mês é later", () => {
    expect(bucketForDueDate("2026-09-01", TODAY)).toBe("later");
  });
});

describe("groupTasksByAgendaBucket", () => {
  it("agrupa em todos os buckets, mantendo os vazios", () => {
    const groups = groupTasksByAgendaBucket(
      [{ due_date: "2026-08-05" }, { due_date: TODAY }, { due_date: null }],
      TODAY
    );
    expect(groups.overdue).toHaveLength(1);
    expect(groups.today).toHaveLength(1);
    expect(groups.no_date).toHaveLength(1);
    expect(groups.this_week).toHaveLength(0);
  });
});

type Row = {
  id: string;
  due_date: string | null;
  status: string;
  recurrence_rule: unknown;
  recurrence_origin_id: string | null;
  linked_recurring_id: string | null;
  medication_id?: string | null;
};

function task(overrides: Partial<Row> & { id: string }): Row {
  return {
    due_date: null,
    status: "todo",
    recurrence_rule: null,
    recurrence_origin_id: null,
    linked_recurring_id: null,
    medication_id: null,
    ...overrides,
  };
}

/** Feature 101: `taskSeriesKey` deixou de ser privado — a página "Tarefas recorrentes" agrupa por
 * ela. Estes casos fixam o contrato agora que ele é público (e são os mesmos que
 * `collapseRecurringSeries`/`findSeriesTasks` já dependiam implicitamente). */
describe("taskSeriesKey", () => {
  it("vínculo com Recorrência Financeira ganha a chave linked:<id>", () => {
    expect(taskSeriesKey(task({ id: "t1", linked_recurring_id: "rec-9" }))).toBe("linked:rec-9");
  });

  it("ocorrência materializada aponta para a origem em simple:<origem>", () => {
    expect(taskSeriesKey(task({ id: "t2", recurrence_origin_id: "orig-1" }))).toBe("simple:orig-1");
  });

  it("a tarefa-origem (dona da regra) é a própria chave simple:<id>", () => {
    expect(
      taskSeriesKey(task({ id: "orig-1", recurrence_rule: { frequency: "daily", interval: 1 } }))
    ).toBe("simple:orig-1");
  });

  it("origem e ocorrência caem na MESMA chave — é o que faz as telas concordarem", () => {
    const origin = task({ id: "orig-1", recurrence_rule: { frequency: "daily", interval: 1 } });
    const occurrence = task({ id: "t3", recurrence_origin_id: "orig-1" });
    expect(taskSeriesKey(occurrence)).toBe(taskSeriesKey(origin));
  });

  it("tarefa avulsa não tem série", () => {
    expect(taskSeriesKey(task({ id: "t4" }))).toBeNull();
  });

  it("não conhece medicação: a dose materializada (só medication_id) cai em null", () => {
    // É exatamente a lacuna que `taskSeriesGroupKey` (series.ts) fecha.
    expect(taskSeriesKey(task({ id: "dose-1", medication_id: "med-1" }))).toBeNull();
  });
});

describe("collapseRecurringSeries", () => {
  it("tarefas não recorrentes passam direto", () => {
    const tasks = [task({ id: "1" }), task({ id: "2" })];
    expect(collapseRecurringSeries(tasks).map((t) => t.id)).toEqual(["1", "2"]);
  });

  it("colapsa série simples na próxima ocorrência em aberto", () => {
    const origin = task({
      id: "origin",
      due_date: "2026-08-01",
      recurrence_rule: { frequency: "weekly", interval: 1 },
      status: "done",
    });
    const child1 = task({
      id: "child1",
      due_date: "2026-08-08",
      recurrence_origin_id: "origin",
      status: "done",
    });
    const child2 = task({
      id: "child2",
      due_date: "2026-08-15",
      recurrence_origin_id: "origin",
      status: "todo",
    });
    const result = collapseRecurringSeries([origin, child1, child2]);
    expect(result.map((t) => t.id)).toEqual(["child2"]);
  });

  it("série vinculada a Recorrência Financeira usa a parcela em aberto mais próxima", () => {
    const inst1 = task({
      id: "p1",
      due_date: "2026-08-10",
      linked_recurring_id: "rec1",
      status: "done",
    });
    const inst2 = task({
      id: "p2",
      due_date: "2026-09-10",
      linked_recurring_id: "rec1",
      status: "todo",
    });
    const inst3 = task({
      id: "p3",
      due_date: "2026-10-10",
      linked_recurring_id: "rec1",
      status: "todo",
    });
    const result = collapseRecurringSeries([inst1, inst2, inst3]);
    expect(result.map((t) => t.id)).toEqual(["p2"]);
  });

  it("série totalmente concluída some da lista", () => {
    const origin = task({
      id: "origin",
      due_date: "2026-08-01",
      recurrence_rule: { frequency: "daily", interval: 1 },
      status: "done",
    });
    const child = task({
      id: "child",
      due_date: "2026-08-02",
      recurrence_origin_id: "origin",
      status: "done",
    });
    expect(collapseRecurringSeries([origin, child])).toEqual([]);
  });
});

describe("findSeriesTasks", () => {
  it("retorna a própria tarefa quando não é recorrente", () => {
    const solo = task({ id: "solo" });
    expect(findSeriesTasks([solo], solo)).toEqual([solo]);
  });

  it("retorna todas as ocorrências da série, ordenadas por prazo", () => {
    const origin = task({
      id: "origin",
      due_date: "2026-08-01",
      recurrence_rule: { frequency: "weekly", interval: 1 },
      status: "done",
    });
    const child1 = task({
      id: "child1",
      due_date: "2026-08-15",
      recurrence_origin_id: "origin",
      status: "todo",
    });
    const child2 = task({
      id: "child2",
      due_date: "2026-08-08",
      recurrence_origin_id: "origin",
      status: "done",
    });
    const other = task({ id: "other", recurrence_origin_id: "another-origin" });
    const result = findSeriesTasks([origin, child1, child2, other], child1);
    expect(result.map((t) => t.id)).toEqual(["origin", "child2", "child1"]);
  });
});

describe("filterTasksByStatusView", () => {
  const tasks = [
    { status: "todo" },
    { status: "doing" },
    { status: "done" },
    { status: "done" },
  ];

  it("pending mantém só status !== done", () => {
    expect(filterTasksByStatusView(tasks, "pending")).toHaveLength(2);
  });

  it("done mantém só status === done", () => {
    expect(filterTasksByStatusView(tasks, "done")).toHaveLength(2);
  });

  it("all não filtra nada", () => {
    expect(filterTasksByStatusView(tasks, "all")).toHaveLength(4);
  });
});

describe("sortTasksByCompletedAtDesc", () => {
  it("ordena por completed_at desc, mais recente primeiro", () => {
    const tasks = [
      { id: "a", completed_at: "2026-08-01T10:00:00Z" },
      { id: "b", completed_at: "2026-08-05T10:00:00Z" },
      { id: "c", completed_at: "2026-08-03T10:00:00Z" },
    ];
    expect(sortTasksByCompletedAtDesc(tasks).map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("tarefas sem completed_at vão pro fim", () => {
    const tasks = [
      { id: "a", completed_at: null },
      { id: "b", completed_at: "2026-08-05T10:00:00Z" },
    ];
    expect(sortTasksByCompletedAtDesc(tasks).map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("isRecurringTask", () => {
  it("detecta recorrência simples, vínculo financeiro e instância materializada", () => {
    expect(isRecurringTask(task({ id: "1", recurrence_rule: { frequency: "daily", interval: 1 } }))).toBe(
      true
    );
    expect(isRecurringTask(task({ id: "2", recurrence_origin_id: "origin" }))).toBe(true);
    expect(isRecurringTask(task({ id: "3", linked_recurring_id: "rec1" }))).toBe(true);
    expect(isRecurringTask(task({ id: "4" }))).toBe(false);
  });
});

describe("isSimpleRecurringTask", () => {
  it("true para origem de recorrência simples (recurrence_rule)", () => {
    expect(
      isSimpleRecurringTask(
        task({ id: "1", recurrence_rule: { frequency: "daily", interval: 1 } })
      )
    ).toBe(true);
  });

  it("true para ocorrência materializada de recorrência simples (recurrence_origin_id)", () => {
    expect(isSimpleRecurringTask(task({ id: "2", recurrence_origin_id: "origin" }))).toBe(true);
  });

  it("false para tarefa vinculada a Recorrência Financeira, mesmo com recurrence_origin_id", () => {
    expect(
      isSimpleRecurringTask(
        task({ id: "3", recurrence_origin_id: "template", linked_recurring_id: "rec1" })
      )
    ).toBe(false);
    expect(isSimpleRecurringTask(task({ id: "4", linked_recurring_id: "rec1" }))).toBe(false);
  });

  it("false para tarefa comum, sem nenhuma recorrência", () => {
    expect(isSimpleRecurringTask(task({ id: "5" }))).toBe(false);
  });

  /**
   * Feature 075. O backfill 049→064 preserva a `recurrence_rule` da origem da medicação e grava
   * `medication_id` nela — antes desta feature ela caía como "recorrência simples" e o dialog
   * oferecia um "excluir todas as ocorrências" que só alcançava `recurrence_origin_id`, deixando
   * para trás todas as doses de `materializeMedicationDoses` (que nascem com `recurrence_origin_id`
   * nulo). Quem manda numa linha com `medication_id` é a variante de medicação.
   */
  it("false para a origem backfillada de medicação (recurrence_rule + medication_id)", () => {
    expect(
      isSimpleRecurringTask(
        task({
          id: "origem-med",
          recurrence_rule: { frequency: "daily", interval: 1 },
          medication_id: "med-1",
        })
      )
    ).toBe(false);
  });

  it("false para ocorrência antiga da série que o backfill marcou com medication_id", () => {
    expect(
      isSimpleRecurringTask(
        task({ id: "oco-antiga", recurrence_origin_id: "origem-med", medication_id: "med-1" })
      )
    ).toBe(false);
  });
});

describe("isMedicationDoseTask", () => {
  it("true para a dose materializada (só medication_id, sem recorrência nenhuma)", () => {
    expect(isMedicationDoseTask(task({ id: "dose", medication_id: "med-1" }))).toBe(true);
  });

  it("true para a origem backfillada, que é série e dose ao mesmo tempo", () => {
    expect(
      isMedicationDoseTask(
        task({
          id: "origem-med",
          recurrence_rule: { frequency: "daily", interval: 1 },
          medication_id: "med-1",
        })
      )
    ).toBe(true);
  });

  it("false para recorrência simples comum — ela não regride para a variante de medicação", () => {
    expect(
      isMedicationDoseTask(task({ id: "1", recurrence_rule: { frequency: "daily", interval: 1 } }))
    ).toBe(false);
    expect(isMedicationDoseTask(task({ id: "2", recurrence_origin_id: "origem" }))).toBe(false);
  });

  it("false para tarefa avulsa e para parcela vinculada a Recorrência Financeira", () => {
    expect(isMedicationDoseTask(task({ id: "3" }))).toBe(false);
    expect(isMedicationDoseTask(task({ id: "4", linked_recurring_id: "rec1" }))).toBe(false);
  });
});

describe("dueDateForShortcut", () => {
  it("dia de meio de semana no meio do mês: os três atalhos dão datas distintas", () => {
    const wednesday = "2026-08-12"; // quarta-feira
    expect(dueDateForShortcut("today", wednesday)).toBe("2026-08-12");
    expect(dueDateForShortcut("this_week", wednesday)).toBe("2026-08-15"); // sábado
    expect(dueDateForShortcut("this_month", wednesday)).toBe("2026-08-31");
  });

  it("domingo: 'esta semana' é o sábado seguinte, não 'daqui a uma semana'", () => {
    const sunday = "2026-08-09";
    expect(new Date(2026, 7, 9).getDay()).toBe(0);
    expect(dueDateForShortcut("this_week", sunday)).toBe("2026-08-15"); // 6 dias à frente
  });

  it("sábado: 'esta semana' colapsa no próprio dia (igual a 'hoje')", () => {
    const saturday = "2026-08-08";
    expect(new Date(2026, 7, 8).getDay()).toBe(6);
    expect(dueDateForShortcut("this_week", saturday)).toBe(saturday);
    expect(dueDateForShortcut("today", saturday)).toBe(saturday);
  });

  it("último dia do mês: 'este mês' colapsa no próprio dia", () => {
    const lastDay = "2026-08-31";
    expect(dueDateForShortcut("this_month", lastDay)).toBe(lastDay);
    expect(dueDateForShortcut("today", lastDay)).toBe(lastDay);
  });

  it("31 de dezembro: 'este mês' fica em 31/12, sem virar o ano", () => {
    expect(dueDateForShortcut("this_month", "2026-12-20")).toBe("2026-12-31");
    expect(dueDateForShortcut("this_month", "2026-12-31")).toBe("2026-12-31");
  });

  it("fevereiro bissexto: 'este mês' é 29/02", () => {
    expect(dueDateForShortcut("this_month", "2028-02-10")).toBe("2028-02-29");
    expect(dueDateForShortcut("this_month", "2026-02-10")).toBe("2026-02-28");
  });
});

describe("dueDateForShortcut — invariantes contra bucketForDueDate", () => {
  /** ~3 meses cobrindo virada de mês, virada de ano e fevereiro bissexto. */
  function everyDayFrom(start: string, days: number): string[] {
    const [y, m, d] = start.split("-").map(Number);
    return Array.from({ length: days }, (_, i) => {
      const day = new Date(y, m - 1, d + i);
      return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(
        day.getDate()
      ).padStart(2, "0")}`;
    });
  }

  const DAYS = [...everyDayFrom("2026-12-01", 92), ...everyDayFrom("2028-01-15", 60)];

  it("nunca produz data no passado", () => {
    for (const day of DAYS) {
      for (const shortcut of DUE_DATE_SHORTCUTS) {
        expect(dueDateForShortcut(shortcut, day) >= day).toBe(true);
      }
    }
  });

  it("a data cai na caixa que o botão nomeia — ou numa mais urgente, quando o atalho colapsa em hoje", () => {
    for (const day of DAYS) {
      for (const shortcut of DUE_DATE_SHORTCUTS) {
        const resolved = dueDateForShortcut(shortcut, day);
        const bucket = bucketForDueDate(resolved, day);
        if (bucket === shortcut) continue;
        // Divergir só é aceitável para **mais urgente** (índice menor em AGENDA_BUCKET_ORDER),
        // nunca para "later"/"overdue"/"no_date". Três colapsos legítimos: sábado
        // ("esta semana" = hoje), último dia do mês ("este mês" = hoje) e — o caso que só a
        // varredura revela — fim do mês caindo dentro da semana corrente, quando "este mês"
        // aterrissa na caixa "Esta semana".
        expect(AGENDA_BUCKET_ORDER.indexOf(bucket)).toBeLessThan(
          AGENDA_BUCKET_ORDER.indexOf(shortcut)
        );
        expect(bucket === "today" || bucket === "this_week").toBe(true);
        if (bucket === "today") expect(resolved).toBe(day);
      }
    }
  });

  it("o intervalo varrido inclui de fato sábados, domingos e últimos dias de mês", () => {
    const weekdays = new Set(DAYS.map((d) => new Date(`${d}T12:00:00`).getDay()));
    expect(weekdays.size).toBe(7);
    expect(DAYS.filter((d) => dueDateForShortcut("this_month", d) === d).length).toBeGreaterThan(3);
    expect(DAYS).toContain("2028-02-29");
  });
});

describe("dueDateForShortcut — colapso de fim de mês dentro da semana corrente", () => {
  it("'este mês' pode cair na caixa 'Esta semana' quando o mês acaba antes do sábado", () => {
    const sunday = "2026-12-27"; // domingo; a semana vai até 02/01/2027
    expect(dueDateForShortcut("this_month", sunday)).toBe("2026-12-31");
    expect(bucketForDueDate("2026-12-31", sunday)).toBe("this_week");
    // Continua sendo "mais urgente que o botão", nunca menos: a tarefa aparece antes, não depois.
    expect(AGENDA_BUCKET_ORDER.indexOf("this_week")).toBeLessThan(
      AGENDA_BUCKET_ORDER.indexOf("this_month")
    );
  });
});
