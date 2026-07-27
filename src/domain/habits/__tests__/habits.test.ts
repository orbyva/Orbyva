import { describe, expect, it } from "vitest";
import {
  frequencyLabel,
  getTodayIso,
  getWeekStrip,
  isAvoidHabit,
  isCompletedToday,
} from "@/domain/habits";
import type { Habit, HabitLog } from "@/types/habits";

const habit = (partial: Partial<Habit>): Habit => ({
  id: "1",
  name: "Água",
  description: "",
  frequency: "daily",
  target_per_week: 7,
  kind: "build",
  created_at: "",
  ...partial,
});

describe("habits week strip / kind", () => {
  it("monta semana Seg→Dom com hoje marcado", () => {
    // Segunda 2026-07-27 → strip Seg…Dom, hoje no índice 0
    const monday = new Date(2026, 6, 27, 12, 0, 0);
    const today = getTodayIso(monday);
    const logs: HabitLog[] = [
      { id: "l1", habit_id: "1", date: today, completed: true },
    ];
    const strip = getWeekStrip(logs, monday);
    expect(strip).toHaveLength(7);
    expect(strip.map((d) => d.label).join("")).toBe("STQQSSD");
    expect(strip[0]?.isToday).toBe(true);
    expect(strip[0]?.completed).toBe(true);
    expect(strip[0]?.date).toBe("2026-07-27");
    expect(strip[6]?.date).toBe("2026-08-02");
  });

  it("detecta anti-hábito", () => {
    expect(isAvoidHabit(habit({ name: "Sem delivery", kind: "avoid" }))).toBe(
      true
    );
    expect(
      isAvoidHabit(habit({ name: "Sem delivery", kind: undefined }))
    ).toBe(true);
    expect(isAvoidHabit(habit({ name: "Meditar" }))).toBe(false);
  });

  it("rótulos de frequência", () => {
    expect(frequencyLabel(habit({ frequency: "daily" }))).toMatch(/Todo dia/);
    expect(
      frequencyLabel(
        habit({ frequency: "weekly", target_per_week: 4, kind: "avoid" })
      )
    ).toMatch(/4× limpo/);
  });

  it("isCompletedToday respeita o dia", () => {
    const logs: HabitLog[] = [
      { id: "l1", habit_id: "1", date: "2099-01-01", completed: true },
    ];
    expect(isCompletedToday(logs, "2099-01-01")).toBe(true);
    expect(isCompletedToday(logs, "2099-01-02")).toBe(false);
  });
});
