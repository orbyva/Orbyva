import type { Habit, HabitKind, HabitLog, WeekStripDay } from "@/types/habits";

/** Data local YYYY-MM-DD (não UTC — evita streak/check-in errados à noite no BR). */
export function getTodayIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

export function habitKind(habit: Pick<Habit, "kind" | "name">): HabitKind {
  if (habit.kind === "avoid" || habit.kind === "build") return habit.kind;
  const n = (habit.name ?? "").trim().toLowerCase();
  if (n.startsWith("sem ") || n.startsWith("evitar ") || n.includes("sem delivery")) {
    return "avoid";
  }
  return "build";
}

export function isAvoidHabit(habit: Pick<Habit, "kind" | "name">): boolean {
  return habitKind(habit) === "avoid";
}

export function calculateStreak(logs: HabitLog[]): number {
  if (logs.length === 0) return 0;

  const completedDates = new Set(
    logs.filter((l) => l.completed).map((l) => l.date)
  );

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);

  while (true) {
    const iso = getTodayIso(cursor);
    if (!completedDates.has(iso)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function getWeekProgress(
  habit: Habit,
  logs: HabitLog[],
  referenceDate = new Date()
): number {
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());

  const completed = logs.filter((log) => {
    if (!log.completed) return false;
    const d = new Date(`${log.date}T12:00:00`);
    return d >= start && d <= referenceDate;
  }).length;

  const target =
    habit.frequency === "weekly" ? habit.target_per_week || 1 : 7;

  return Math.min(100, Math.round((completed / Math.max(1, target)) * 100));
}

export function isCompletedToday(logs: HabitLog[], day = getTodayIso()): boolean {
  return logs.some((l) => l.date === day && l.completed);
}

/**
 * Semana calendário local Seg→Dom (padrão BR).
 * Labels ficam sempre S T Q Q S S D; o dia atual é destacado.
 */
export function getWeekStrip(
  logs: HabitLog[],
  from = new Date()
): WeekStripDay[] {
  const today = getTodayIso(from);
  const start = new Date(from);
  start.setHours(12, 0, 0, 0);
  // getDay(): 0=Dom … 6=Sáb → desloca para segunda
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);

  const days: WeekStripDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = getTodayIso(d);
    days.push({
      date: iso,
      label: WEEKDAY_LABELS[d.getDay()] ?? "·",
      completed: logs.some((l) => l.date === iso && l.completed),
      isToday: iso === today,
    });
  }

  return days;
}

export function frequencyLabel(habit: Pick<Habit, "frequency" | "target_per_week" | "kind" | "name">): string {
  const avoid = isAvoidHabit(habit);
  if (habit.frequency === "weekly") {
    const n = Math.max(1, Math.min(7, habit.target_per_week || 1));
    return avoid ? `${n}× limpo / semana` : `${n}× por semana`;
  }
  return avoid ? "Todo dia limpo" : "Todo dia";
}
