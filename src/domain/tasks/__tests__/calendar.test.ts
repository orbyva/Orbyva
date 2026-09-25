import { describe, expect, it } from "vitest";
import {
  computeItemPosition,
  computeMonthGridDays,
  computeWeekDays,
  DEFAULT_ITEM_DURATION_MINUTES,
  getItemTimeRange,
  groupCalendarItemsByDay,
  groupPointItems,
  isPointTask,
  layoutTimedItems,
  splitTimedItems,
  type CalendarItem,
} from "@/domain/tasks/calendar";

interface TestTask {
  id: string;
  due_date: string | null;
  due_time?: string | null;
  estimated_duration?: number | null;
  is_medication?: boolean | null;
}

interface TestEvent {
  id: string;
  starts_at: string;
  ends_at?: string | null;
}

function taskItem(task: TestTask): CalendarItem<TestTask, TestEvent> {
  return { kind: "task", task };
}

function eventItem(event: TestEvent): CalendarItem<TestTask, TestEvent> {
  return { kind: "event", event };
}

describe("computeMonthGridDays", () => {
  it("cobre o mês inteiro com folga até domingo/sábado", () => {
    // agosto de 2026: começa numa sábado (01), termina numa segunda (31)
    const days = computeMonthGridDays(new Date(2026, 7, 15));
    expect(days[0].getDay()).toBe(0); // primeiro dia da grade é domingo
    expect(days[days.length - 1].getDay()).toBe(6); // último dia é sábado
    expect(days[0].getTime()).toBeLessThanOrEqual(new Date(2026, 7, 1).getTime());
    expect(days[days.length - 1].getTime()).toBeGreaterThanOrEqual(new Date(2026, 7, 31).getTime());
  });

  it("é sempre múltiplo de 7 dias", () => {
    const days = computeMonthGridDays(new Date(2026, 1, 10));
    expect(days.length % 7).toBe(0);
  });
});

describe("computeWeekDays", () => {
  it("retorna os 7 dias da semana (dom→sáb) contendo a data", () => {
    // 2026-08-12 é uma quarta-feira; a semana vai de dom 09 a sáb 15
    const days = computeWeekDays(new Date(2026, 7, 12));
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual(new Date(2026, 7, 9));
    expect(days[0].getDay()).toBe(0);
    expect(days[6]).toEqual(new Date(2026, 7, 15));
    expect(days[6].getDay()).toBe(6);
  });

  it("já retorna a própria semana quando a data é um domingo", () => {
    const days = computeWeekDays(new Date(2026, 7, 9));
    expect(days[0]).toEqual(new Date(2026, 7, 9));
  });

  it("atravessa a virada de mês corretamente", () => {
    // 2026-08-31 é segunda; a semana vai de dom 30/08 a sáb 05/09
    const days = computeWeekDays(new Date(2026, 7, 31));
    expect(days[0]).toEqual(new Date(2026, 7, 30));
    expect(days[6]).toEqual(new Date(2026, 8, 5));
  });
});

describe("groupCalendarItemsByDay", () => {
  it("agrupa tarefas por due_date", () => {
    const map = groupCalendarItemsByDay(
      [
        { id: "1", due_date: "2026-08-10" },
        { id: "2", due_date: "2026-08-10" },
        { id: "3", due_date: null },
      ],
      []
    );
    expect(map.get("2026-08-10")).toHaveLength(2);
    expect(map.has("null")).toBe(false);
    expect(Array.from(map.values()).flat()).toHaveLength(2);
  });

  it("agrupa eventos pelo dia local de starts_at, não pela data crua UTC", () => {
    // 2026-08-10T23:30 em UTC-3 (Brasil) = 2026-08-11T02:30Z — o dia local é 10, não 11
    const map = groupCalendarItemsByDay(
      [],
      [{ id: "e1", starts_at: "2026-08-10T23:30:00-03:00" }]
    );
    expect(map.get("2026-08-10")).toHaveLength(1);
    expect(map.has("2026-08-11")).toBe(false);
  });

  it("ordena itens do mesmo dia por horário, tarefas sem due_time por último", () => {
    const map = groupCalendarItemsByDay(
      [
        { id: "no-time", due_date: "2026-08-10" },
        { id: "early", due_date: "2026-08-10", due_time: "08:00" },
      ],
      [{ id: "evt", starts_at: "2026-08-10T12:00:00-03:00" }]
    );
    const items = map.get("2026-08-10")!;
    expect(items.map((i) => (i.kind === "task" ? i.task.id : i.event.id))).toEqual([
      "early",
      "evt",
      "no-time",
    ]);
  });

  it("dia focado (feature 038, Gantt): isola corretamente o dia escolhido, com/sem due_time, sem vazar itens de outros dias", () => {
    // Cenário do Gantt "focando" um dia específico (`GanttChart` faz `itemsByDay.get(dayKey(focusedDay))`):
    // o mapa continua agrupando tudo, mas só a chave do dia focado deve conter os itens daquele dia,
    // ordenados (com due_time primeiro), e nada dos outros dias deve aparecer ali.
    const map = groupCalendarItemsByDay(
      [
        { id: "focused-no-time", due_date: "2026-08-20" },
        { id: "focused-with-time", due_date: "2026-08-20", due_time: "09:00" },
        { id: "other-day", due_date: "2026-08-21" },
      ],
      [] as TestEvent[]
    );
    const focusedDayItems = map.get("2026-08-20")!;
    expect(focusedDayItems.map((i) => (i.kind === "task" ? i.task.id : i.event.id))).toEqual([
      "focused-with-time",
      "focused-no-time",
    ]);
    expect(map.get("2026-08-21")).toHaveLength(1);
  });
});

/**
 * Feature 072 — tarefa pontual (remédio, trocar lençol, trocar escova): acontece num instante,
 * não ocupa intervalo, e na Agenda vira bolinha marcável em vez de bloco retangular.
 */
describe("isPointTask", () => {
  it("estimated_duration 0 é pontual (controle explícito do usuário)", () => {
    expect(isPointTask({ id: "t1", due_date: "2026-08-10", estimated_duration: 0 })).toBe(true);
  });

  it("estimated_duration null/undefined NÃO é pontual (segue o bloco de 30 min de sempre)", () => {
    expect(isPointTask({ id: "t2", due_date: "2026-08-10", estimated_duration: null })).toBe(false);
    expect(isPointTask({ id: "t3", due_date: "2026-08-10" })).toBe(false);
  });

  it("duração real (> 0) nunca é pontual", () => {
    expect(isPointTask({ id: "t4", due_date: "2026-08-10", estimated_duration: 30 })).toBe(false);
  });

  it("dose de medicação sem duração informada é pontual", () => {
    expect(
      isPointTask({ id: "d1", due_date: "2026-08-10", due_time: "08:00", is_medication: true })
    ).toBe(true);
    expect(
      isPointTask({
        id: "d2",
        due_date: "2026-08-10",
        due_time: "08:00",
        is_medication: true,
        estimated_duration: null,
      })
    ).toBe(true);
  });

  it("dose de medicação COM duração informada não é pontual — o usuário mandou o contrário", () => {
    expect(
      isPointTask({
        id: "d3",
        due_date: "2026-08-10",
        due_time: "08:00",
        is_medication: true,
        estimated_duration: 45,
      })
    ).toBe(false);
  });
});

describe("groupPointItems", () => {
  it("junta 3 tarefas pontuais das 08:00 numa fileira só e separa a das 09:00", () => {
    const { groups, rest } = groupPointItems([
      taskItem({ id: "p1", due_date: "2026-08-10", due_time: "08:00", estimated_duration: 0 }),
      taskItem({ id: "p2", due_date: "2026-08-10", due_time: "08:00", estimated_duration: 0 }),
      taskItem({ id: "p3", due_date: "2026-08-10", due_time: "08:00", estimated_duration: 0 }),
      taskItem({ id: "p4", due_date: "2026-08-10", due_time: "09:00", estimated_duration: 0 }),
    ]);

    expect(rest).toHaveLength(0);
    expect(groups).toHaveLength(2);
    expect(groups[0].startMinutes).toBe(8 * 60);
    expect(groups[0].items.map((i) => (i.kind === "task" ? i.task.id : i.event.id))).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
    expect(groups[1].startMinutes).toBe(9 * 60);
    expect(groups[1].items).toHaveLength(1);
  });

  it("itens pontuais sem horário caem no grupo null, que vem primeiro", () => {
    const { groups } = groupPointItems([
      taskItem({ id: "com-hora", due_date: "2026-08-10", due_time: "07:30", estimated_duration: 0 }),
      taskItem({ id: "sem-hora", due_date: "2026-08-10", estimated_duration: 0 }),
    ]);

    expect(groups.map((g) => g.startMinutes)).toEqual([null, 7 * 60 + 30]);
    expect(groups[0].items[0].kind === "task" && groups[0].items[0].task.id).toBe("sem-hora");
  });

  it("evento nunca é pontual — vai para `rest` mesmo no mesmo horário das bolinhas", () => {
    const { groups, rest } = groupPointItems([
      taskItem({ id: "p1", due_date: "2026-08-10", due_time: "08:00", estimated_duration: 0 }),
      eventItem({ id: "e1", starts_at: "2026-08-10T08:00:00-03:00" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(1);
    expect(rest).toHaveLength(1);
    expect(rest[0].kind === "event" && rest[0].event.id).toBe("e1");
  });

  it("tarefa comum (sem duração) continua em `rest`, na ordem de entrada", () => {
    const { groups, rest } = groupPointItems([
      taskItem({ id: "comum", due_date: "2026-08-10", due_time: "08:00" }),
      taskItem({ id: "pontual", due_date: "2026-08-10", due_time: "08:00", estimated_duration: 0 }),
      taskItem({ id: "longa", due_date: "2026-08-10", due_time: "08:00", estimated_duration: 60 }),
    ]);

    expect(rest.map((i) => (i.kind === "task" ? i.task.id : i.event.id))).toEqual(["comum", "longa"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items[0].kind === "task" && groups[0].items[0].task.id).toBe("pontual");
  });
});

describe("getItemTimeRange", () => {
  it("tarefa com due_time e estimated_duration usa a duração real", () => {
    const range = getItemTimeRange(
      taskItem({ id: "t1", due_date: "2026-08-10", due_time: "09:30", estimated_duration: 90 })
    );
    expect(range).toEqual({ startMinutes: 9 * 60 + 30, durationMinutes: 90 });
  });

  it("tarefa com due_time sem estimated_duration usa a duração default", () => {
    const range = getItemTimeRange(taskItem({ id: "t2", due_date: "2026-08-10", due_time: "14:00" }));
    expect(range).toEqual({ startMinutes: 14 * 60, durationMinutes: DEFAULT_ITEM_DURATION_MINUTES });
  });

  it("tarefa pontual com due_time tem duração 0 (feature 072), não o default de 30", () => {
    const range = getItemTimeRange(
      taskItem({ id: "p1", due_date: "2026-08-10", due_time: "08:00", estimated_duration: 0 })
    );
    expect(range).toEqual({ startMinutes: 8 * 60, durationMinutes: 0 });
  });

  it("dose de medicação sem duração também tem duração 0", () => {
    const range = getItemTimeRange(
      taskItem({ id: "d1", due_date: "2026-08-10", due_time: "08:00", is_medication: true })
    );
    expect(range).toEqual({ startMinutes: 8 * 60, durationMinutes: 0 });
  });

  it("tarefa sem due_time não entra na grade (retorna null)", () => {
    const range = getItemTimeRange(taskItem({ id: "t3", due_date: "2026-08-10" }));
    expect(range).toBeNull();
  });

  it("evento com ends_at calcula a duração real a partir do intervalo", () => {
    const range = getItemTimeRange(
      eventItem({ id: "e1", starts_at: "2026-08-10T10:00:00-03:00", ends_at: "2026-08-10T11:15:00-03:00" })
    );
    expect(range).toEqual({ startMinutes: 10 * 60, durationMinutes: 75 });
  });

  it("evento sem ends_at usa a duração default", () => {
    const range = getItemTimeRange(eventItem({ id: "e2", starts_at: "2026-08-10T10:00:00-03:00" }));
    expect(range).toEqual({ startMinutes: 10 * 60, durationMinutes: DEFAULT_ITEM_DURATION_MINUTES });
  });
});

describe("splitTimedItems", () => {
  it("separa itens com horário dos sem horário", () => {
    const items = [
      taskItem({ id: "timed", due_date: "2026-08-10", due_time: "08:00" }),
      taskItem({ id: "untimed", due_date: "2026-08-10" }),
      eventItem({ id: "evt", starts_at: "2026-08-10T09:00:00-03:00" }),
    ];
    const { timed, untimed } = splitTimedItems(items);
    expect(timed.map((t) => (t.item.kind === "task" ? t.item.task.id : t.item.event.id))).toEqual([
      "timed",
      "evt",
    ]);
    expect(untimed).toHaveLength(1);
    expect(untimed[0].kind === "task" && untimed[0].task.id).toBe("untimed");
  });
});

describe("computeItemPosition", () => {
  it("calcula top/height como % de 24h", () => {
    // 12:00 (720min) por 60min = 50% do dia, 60/1440 ~= 4.1667%
    const pos = computeItemPosition({ startMinutes: 12 * 60, durationMinutes: 60 });
    expect(pos.topPercent).toBeCloseTo(50, 5);
    expect(pos.heightPercent).toBeCloseTo((60 / 1440) * 100, 5);
  });

  it("clampa a altura pra não vazar além da meia-noite seguinte", () => {
    // começa 23:50, duração de 1h — vazaria 50min além da meia-noite sem o clamp
    const pos = computeItemPosition({ startMinutes: 23 * 60 + 50, durationMinutes: 60 });
    expect(pos.topPercent + pos.heightPercent).toBeCloseTo(100, 5);
  });
});

describe("layoutTimedItems", () => {
  it("item isolado ocupa a coluna inteira (widthPercent 100, leftPercent 0)", () => {
    const { timed } = layoutTimedItems([
      taskItem({ id: "solo", due_date: "2026-08-10", due_time: "08:00" }),
    ]);
    expect(timed).toHaveLength(1);
    expect(timed[0].leftPercent).toBe(0);
    expect(timed[0].widthPercent).toBe(100);
  });

  it("itens sequenciais sem sobreposição ocupam a coluna inteira cada um", () => {
    const { timed } = layoutTimedItems([
      taskItem({ id: "a", due_date: "2026-08-10", due_time: "08:00", estimated_duration: 30 }),
      taskItem({ id: "b", due_date: "2026-08-10", due_time: "09:00", estimated_duration: 30 }),
    ]);
    expect(timed.every((t) => t.widthPercent === 100 && t.leftPercent === 0)).toBe(true);
  });

  it("dois itens com horários cruzados dividem a largura da coluna lado a lado", () => {
    const { timed } = layoutTimedItems([
      taskItem({ id: "a", due_date: "2026-08-10", due_time: "08:00", estimated_duration: 60 }),
      taskItem({ id: "b", due_date: "2026-08-10", due_time: "08:30", estimated_duration: 60 }),
    ]);
    expect(timed).toHaveLength(2);
    const [a, b] = timed;
    expect(a.widthPercent).toBe(50);
    expect(b.widthPercent).toBe(50);
    expect([a.leftPercent, b.leftPercent].sort()).toEqual([0, 50]);
  });

  it("três itens sobrepostos entre si dividem a coluna em três", () => {
    const { timed } = layoutTimedItems([
      taskItem({ id: "a", due_date: "2026-08-10", due_time: "08:00", estimated_duration: 90 }),
      taskItem({ id: "b", due_date: "2026-08-10", due_time: "08:15", estimated_duration: 90 }),
      taskItem({ id: "c", due_date: "2026-08-10", due_time: "08:30", estimated_duration: 90 }),
    ]);
    expect(timed.every((t) => t.widthPercent === 100 / 3)).toBe(true);
    expect(new Set(timed.map((t) => t.leftPercent)).size).toBe(3);
  });

  it("itens sem horário não entram no layout, ficam em untimed", () => {
    const { timed, untimed } = layoutTimedItems([
      taskItem({ id: "a", due_date: "2026-08-10", due_time: "08:00" }),
      taskItem({ id: "b", due_date: "2026-08-10" }),
    ]);
    expect(timed).toHaveLength(1);
    expect(untimed).toHaveLength(1);
  });
});
