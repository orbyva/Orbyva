import type { TaskPriority } from "@/types/tasks";

export interface TaskFilter {
  projectId?: string | null;
  tagId?: string;
  dueBefore?: string;
  priority?: TaskPriority;
}

interface FilterableTask {
  project_id: string | null;
  tag_ids: string[];
  due_date: string | null;
  priority?: TaskPriority | null;
}

export function filterTasks<T extends FilterableTask>(
  tasks: T[],
  filter: TaskFilter
): T[] {
  return tasks.filter((task) => {
    if (filter.projectId !== undefined && task.project_id !== filter.projectId) {
      return false;
    }
    if (filter.tagId && !task.tag_ids.includes(filter.tagId)) return false;
    if (filter.dueBefore && (!task.due_date || task.due_date > filter.dueBefore)) {
      return false;
    }
    if (filter.priority && task.priority !== filter.priority) return false;
    return true;
  });
}

export function sortTasksByDueDate<T extends { due_date: string | null }>(
  tasks: T[]
): T[] {
  return [...tasks].sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });
}

/** Campos que a ordenação por "última atualização" (feature 079) precisa ler. */
export interface UpdatedSortableTask {
  id: string;
  updated_at?: string | null;
  created_at?: string | null;
}

/** ms do timestamp, ou `null` quando ausente/ilegível (não dá pra confiar em `localeCompare` aqui:
 * `timestamptz` pode voltar com sufixo `Z` ou `+00:00` para o mesmo instante). */
function timestampValue(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** Mais recente primeiro, com desempate determinístico (`created_at` desc → `id`) — sem ele, duas
 * tarefas carimbadas no mesmo milissegundo (materialização em lote) trocam de lugar a cada render.
 * Tarefa sem `updated_at` cai para `created_at`; sem nenhum dos dois vai para o fim.
 * Não muta o array de entrada. */
export function sortTasksByUpdatedAtDesc<T extends UpdatedSortableTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const aUpdated = timestampValue(a.updated_at) ?? timestampValue(a.created_at);
    const bUpdated = timestampValue(b.updated_at) ?? timestampValue(b.created_at);
    if (aUpdated !== bUpdated) {
      if (aUpdated === null) return 1;
      if (bUpdated === null) return -1;
      return bUpdated - aUpdated;
    }
    const aCreated = timestampValue(a.created_at);
    const bCreated = timestampValue(b.created_at);
    if (aCreated !== bCreated) {
      if (aCreated === null) return 1;
      if (bCreated === null) return -1;
      return bCreated - aCreated;
    }
    return a.id.localeCompare(b.id);
  });
}

/** Ordenações oferecidas pelo seletor "Ordenar por" da Lista/Kanban (feature 079). */
export type TaskSortKey = "updated" | "due";

/** Padrão de fábrica: o pedido literal da feature 079 é "ordene por last_updated". */
export const DEFAULT_TASK_SORT_KEY: TaskSortKey = "updated";

/** Ordem em que as opções aparecem no seletor. */
export const TASK_SORT_KEYS = ["updated", "due"] as const satisfies readonly TaskSortKey[];

export const TASK_SORT_LABELS: Record<TaskSortKey, string> = {
  updated: "Última atualização",
  due: "Prazo",
};

export function isTaskSortKey(value: unknown): value is TaskSortKey {
  return value === "updated" || value === "due";
}

/** Campos que qualquer comparador do seletor precisa ler. */
export type SortableTask = UpdatedSortableTask & { due_date: string | null };

/** Despacha para o comparador da chave escolhida. Não muta o array de entrada. */
export function sortTasksBy<T extends SortableTask>(key: TaskSortKey, tasks: T[]): T[] {
  return key === "due" ? sortTasksByDueDate(tasks) : sortTasksByUpdatedAtDesc(tasks);
}
