import { sortTasksByDueDate } from "./filters";

interface HighlightableTask {
  project_id: string | null;
  parent_task_id: string | null;
  status: string;
  due_date: string | null;
  linked_recurring_id: string | null;
  linked_installment_number: number | null;
}

interface ActivityRankableProject {
  id: string;
  created_at?: string;
}

interface ActivityRankableTask {
  project_id: string | null;
  parent_task_id: string | null;
  created_at?: string;
}

/**
 * Ordena projetos por "atividade": contagem de tarefas de topo (não-subtarefa) criadas no
 * projeto, com a `created_at` da tarefa mais recente como desempate. Projetos sem nenhuma
 * tarefa ficam por último, ordenados por `created_at` do próprio projeto (mesmo fallback do
 * antigo dropdown por `created_at` desc). Cálculo client-side sobre os mesmos `tasks` já
 * carregados por `fetchTasks()` — sem query nova.
 */
export function rankProjectsByActivity<
  P extends ActivityRankableProject,
  T extends ActivityRankableTask,
>(projects: P[], tasks: T[]): P[] {
  const stats = new Map<string, { count: number; latestTaskCreatedAt: string }>();
  for (const t of tasks) {
    if (!t.project_id || t.parent_task_id) continue;
    const createdAt = t.created_at ?? "";
    const current = stats.get(t.project_id);
    if (!current) {
      stats.set(t.project_id, { count: 1, latestTaskCreatedAt: createdAt });
    } else {
      current.count += 1;
      if (createdAt > current.latestTaskCreatedAt) {
        current.latestTaskCreatedAt = createdAt;
      }
    }
  }

  return [...projects].sort((a, b) => {
    const statsA = stats.get(a.id);
    const statsB = stats.get(b.id);
    if (statsA && !statsB) return -1;
    if (!statsA && statsB) return 1;
    if (statsA && statsB) {
      if (statsA.count !== statsB.count) return statsB.count - statsA.count;
      return statsB.latestTaskCreatedAt.localeCompare(statsA.latestTaskCreatedAt);
    }
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
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
