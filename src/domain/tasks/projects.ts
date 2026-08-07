import { sortTasksByDueDate } from "./filters";

interface HighlightableTask {
  project_id: string | null;
  parent_task_id: string | null;
  status: string;
  due_date: string | null;
  linked_recurring_id: string | null;
  linked_installment_number: number | null;
}

/**
 * Tarefas de topo em aberto (todo/doing) de um projeto, ordenadas por prazo, limitadas a `limit`.
 * Usado no preview do card de projeto — não pretende ser a lista completa (essa é o Kanban/Lista).
 */
export function topOngoingTasksForProject<T extends HighlightableTask>(
  tasks: T[],
  projectId: string,
  limit = 3
): T[] {
  const candidates = tasks.filter(
    (t) =>
      t.project_id === projectId &&
      !t.parent_task_id &&
      (t.status === "todo" || t.status === "doing") &&
      !(t.linked_recurring_id && t.linked_installment_number == null)
  );
  return sortTasksByDueDate(candidates).slice(0, limit);
}
