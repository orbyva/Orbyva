import type { Habit, HabitLog } from "@/types/habits";
import { calculateStreak, getTodayIso, isCompletedToday } from "@/domain/habits";

export type HabitInsight = {
  id: string;
  tone: "success" | "warning" | "info";
  title: string;
  detail: string;
};

export function getHabitInsights(
  habits: Habit[],
  logs: HabitLog[]
): HabitInsight[] {
  if (habits.length === 0) return [];

  const insights: HabitInsight[] = [];
  const today = getTodayIso();

  const streaks = habits.map((h) => {
    const habitLogs = logs.filter((l) => l.habit_id === h.id);
    return {
      habit: h,
      streak: calculateStreak(habitLogs),
      doneToday: isCompletedToday(habitLogs),
      habitLogs,
    };
  });

  const best = [...streaks].sort((a, b) => b.streak - a.streak)[0];
  if (best && best.streak > 0) {
    insights.push({
      id: "best-streak",
      tone: "success",
      title: `Melhor streak: ${best.habit.name}`,
      detail: `${best.streak} dia${best.streak === 1 ? "" : "s"} seguidos.`,
    });
  }

  const doneToday = streaks.filter((s) => s.doneToday).length;
  insights.push({
    id: "today",
    tone: doneToday === habits.length ? "success" : "info",
    title: "Hoje",
    detail: `${doneToday}/${habits.length} hábitos concluídos.`,
  });

  const atRisk = streaks.filter((s) => {
    if (s.doneToday || s.streak === 0) return false;
    // Fez ontem (streak > 0 e ainda não fez hoje) = risco de quebrar
    return true;
  });
  if (atRisk.length > 0) {
    insights.push({
      id: "at-risk",
      tone: "warning",
      title: "Em risco de quebrar streak",
      detail: atRisk.map((s) => s.habit.name).join(", "),
    });
  }

  const last7 = [...Array(7)].map((_, i) => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10);
  });
  const completions = last7.reduce((acc, day) => {
    return (
      acc +
      habits.filter((h) =>
        logs.some(
          (l) => l.habit_id === h.id && l.date === day && l.completed
        )
      ).length
    );
  }, 0);
  const possible = habits.length * 7;
  if (possible > 0) {
    const rate = Math.round((completions / possible) * 100);
    insights.push({
      id: "week-rate",
      tone: rate >= 70 ? "success" : rate >= 40 ? "info" : "warning",
      title: "Taxa dos últimos 7 dias",
      detail: `${rate}% das check-ins possíveis.`,
    });
  }

  return insights;
}
