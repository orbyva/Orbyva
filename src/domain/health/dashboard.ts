import type { Task } from "@/types/tasks";

/**
 * Ordem da lista do Health Dashboard: data, e no mesmo dia o horário — compromisso sem horário
 * vai para o fim do dia, a mesma regra de `fetchNextPendingTask` (`nullsFirst: false`).
 */
function byDueDateTime(a: Task, b: Task): number {
  const date = (a.due_date ?? "").localeCompare(b.due_date ?? "");
  if (date !== 0) return date;
  return (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99");
}

/**
 * Doses que o hub de Saúde lista: as de hoje (pendentes e já tomadas) e as atrasadas ainda
 * pendentes. É o que evita mandar o usuário para Tarefas só para marcar o comprimido — a agenda
 * continua mostrando as mesmas linhas.
 *
 * Dose futura não entra: a materialização só vai até hoje, e o que ainda não existe não se marca.
 */
export function selectDashboardDoses(doses: Task[], today: string): Task[] {
  return doses
    .filter((dose) => {
      if (!dose.due_date) return false;
      if (dose.due_date === today) return true;
      return dose.due_date < today && dose.status === "todo";
    })
    .sort(byDueDateTime);
}

/**
 * Consultas do hub: as próximas pendentes (hoje em diante) e as de hoje já comparecidas.
 * Comparecidas de outro dia saem — o histórico delas continua na agenda.
 */
export function selectDashboardConsultations(
  consultations: Task[],
  today: string
): Task[] {
  return consultations
    .filter((task) => {
      if (!task.due_date) return false;
      if (task.status === "todo" && task.due_date >= today) return true;
      return task.status === "done" && task.due_date === today;
    })
    .sort(byDueDateTime);
}

/**
 * Lista completa de consultas: pendentes (inclusive atrasadas) numa fila, comparecidas no
 * histórico. O hub continua com `selectDashboardConsultations`; esta partição é a tela
 * "Ver consultas".
 */
export function partitionConsultationHistory(consultations: Task[]): {
  upcoming: Task[];
  history: Task[];
} {
  const upcoming = consultations
    .filter((task) => task.status === "todo")
    .sort(byDueDateTime);
  const history = consultations
    .filter((task) => task.status === "done")
    .sort((a, b) => byDueDateTime(b, a));
  return { upcoming, history };
}
