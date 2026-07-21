import { describe, expect, it } from "vitest";
import { getHabitInsights } from "@/domain/habits/insights";
import type { Habit, HabitLog } from "@/types/habits";

const habit = (id: string, name: string): Habit => ({
  id,
  name,
  description: "",
  frequency: "daily",
  target_per_week: 7,
  color: null,
  created_at: "",
});

describe("getHabitInsights", () => {
  it("retorna vazio sem hábitos", () => {
    expect(getHabitInsights([], [])).toEqual([]);
  });

  it("destaca streak e taxa da semana", () => {
    const today = new Date().toISOString().slice(0, 10);
    const habits = [habit("1", "Água")];
    const logs: HabitLog[] = [
      { id: "l1", habit_id: "1", date: today, completed: true },
    ];
    const insights = getHabitInsights(habits, logs);
    expect(insights.some((i) => i.id === "best-streak")).toBe(true);
    expect(insights.some((i) => i.id === "today")).toBe(true);
    expect(insights.some((i) => i.id === "week-rate")).toBe(true);
  });
});
