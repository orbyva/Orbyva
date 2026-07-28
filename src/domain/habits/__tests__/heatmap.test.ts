import { describe, expect, it } from "vitest";
import {
  buildHabitMonthHeatmap,
  buildOverallMonthHeatmap,
  shiftMonth,
} from "@/domain/habits/heatmap";
import type { Habit, HabitLog } from "@/types/habits";

const habit = (id: string): Habit => ({
  id,
  name: id,
  description: "",
  frequency: "daily",
  target_per_week: 7,
  kind: "build",
});

describe("habit month heatmap", () => {
  it("shiftMonth atravessa o ano", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2025, 12, 1)).toEqual({ year: 2026, month: 1 });
  });

  it("marca done / missed / future / today no hábito diário", () => {
    const today = "2026-07-15";
    const logs: HabitLog[] = [
      { id: "1", habit_id: "h1", date: "2026-07-14", completed: true },
      { id: "2", habit_id: "h1", date: "2026-07-13", completed: false },
    ];
    const map = buildHabitMonthHeatmap(logs, 2026, 7, {
      today,
      markMissed: true,
    });

    const byDate = new Map(
      map.cells.filter(Boolean).map((c) => [c!.date, c!] as const)
    );

    expect(byDate.get("2026-07-14")?.status).toBe("done");
    expect(byDate.get("2026-07-13")?.status).toBe("missed");
    expect(byDate.get("2026-07-15")?.status).toBe("today");
    expect(byDate.get("2026-07-16")?.status).toBe("future");
    // Jul/2026 começa numa quarta → lead de 2 (seg/ter)
    expect(map.cells.slice(0, 2).every((c) => c === null)).toBe(true);
  });

  it("semanal não marca missed no passado vazio", () => {
    const map = buildHabitMonthHeatmap([], 2026, 7, {
      today: "2026-07-15",
      markMissed: false,
    });
    const cell = map.cells.find((c) => c?.date === "2026-07-10");
    expect(cell?.status).toBe("empty");
  });

  it("geral calcula taxa parcial e full", () => {
    const habits = [habit("a"), habit("b")];
    const logs: HabitLog[] = [
      { id: "1", habit_id: "a", date: "2026-07-10", completed: true },
      { id: "2", habit_id: "b", date: "2026-07-10", completed: true },
      { id: "3", habit_id: "a", date: "2026-07-11", completed: true },
    ];
    const map = buildOverallMonthHeatmap(habits, logs, 2026, 7, "2026-07-15");
    const byDate = new Map(
      map.cells.filter(Boolean).map((c) => [c!.date, c!] as const)
    );

    expect(byDate.get("2026-07-10")?.status).toBe("done");
    expect(byDate.get("2026-07-10")?.rate).toBe(1);
    expect(byDate.get("2026-07-11")?.status).toBe("partial");
    expect(byDate.get("2026-07-11")?.rate).toBe(0.5);
    expect(byDate.get("2026-07-12")?.status).toBe("missed");
  });
});
