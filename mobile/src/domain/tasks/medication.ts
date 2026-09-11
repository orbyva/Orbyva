import type { Task } from "@/types/tasks";

/**
 * Uma dose é "atrasada" quando `completed_at` (o instante real em que a tarefa foi marcada
 * concluída) passa do horário agendado (`due_date` + `due_time`) por mais que `graceMinutes` —
 * a margem evita falso positivo por diferença de poucos minutos entre o alarme e o clique.
 * `false` sem `completed_at`, sem `due_date`/`due_time` (nada agendado pra comparar).
 */
export function isDoseLate(task: Task, graceMinutes = 60): boolean {
  if (!task.completed_at || !task.due_date || !task.due_time) return false;

  const [year, month, day] = task.due_date.split("-").map(Number);
  const [hour, minute] = task.due_time.split(":").map(Number);
  const scheduled = new Date(year, month - 1, day, hour, minute);
  const deadline = new Date(scheduled.getTime() + graceMinutes * 60_000);

  const completedAt = new Date(task.completed_at);
  return completedAt.getTime() > deadline.getTime();
}
