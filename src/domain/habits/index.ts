import type { Habit, HabitLog } from "@/types/habits";

/** Data local YYYY-MM-DD (não UTC — evita streak/check-in errados à noite no BR). */
export function getTodayIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
    habit.frequency === "weekly"
      ? habit.target_per_week
      : 7;

  return Math.min(100, Math.round((completed / target) * 100));
}

export function isCompletedToday(logs: HabitLog[]): boolean {
  const today = getTodayIso();
  return logs.some((l) => l.date === today && l.completed);
}
