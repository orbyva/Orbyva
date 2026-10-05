import type { Task } from "@/types/tasks";

/** Prazo sem horário vai para o fim do dia, como em `fetchNextPendingTask` (`nullsFirst: false`). */
function byDueDateTime(a: Task, b: Task): number {
  const date = (a.due_date ?? "").localeCompare(b.due_date ?? "");
  if (date !== 0) return date;
  return (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99");
}

/**
 * Próximas (pendentes, da mais cedo para a mais tarde) e histórico (comparecidas, da mais recente
 * para a mais antiga) — mesma partição de `partitionConsultationHistory` do web.
 */
export function partitionConsultationHistory(consultations: Task[]): {
  upcoming: Task[];
  history: Task[];
} {
  const upcoming = consultations.filter((task) => task.status !== "done").sort(byDueDateTime);
  const history = consultations
    .filter((task) => task.status === "done")
    .sort((a, b) => byDueDateTime(b, a));
  return { upcoming, history };
}
