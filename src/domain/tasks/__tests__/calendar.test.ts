import { describe, expect, it } from "vitest";
import {
  computeMonthGridDays,
  computeWeekDays,
  groupCalendarItemsByDay,
} from "@/domain/tasks/calendar";

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
});
