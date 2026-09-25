import type { TaskPriority } from "@/types/tasks";

interface SubtaskLike {
  id: string;
  parent_task_id: string | null;
  sort_order?: number;
}

/** Campos que a ordenação de exibição das subtarefas precisa ler: prazo, depois prioridade,
 * depois data de criação. */
export interface SubtaskSortable {
  id: string;
  due_date?: string | null;
  priority?: TaskPriority | null;
  created_at?: string | null;
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function priorityRank(priority: TaskPriority | null | undefined): number {
  return priority ? PRIORITY_RANK[priority] : 3;
}

function createdAtMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Prazo ascendente (sem prazo no fim) → prioridade (alta primeiro; sem prioridade no fim) →
 * `created_at` ascendente. Empate final por `id`. Não muta os argumentos.
 */
export function compareSubtasks<T extends SubtaskSortable>(a: T, b: T): number {
  const aDue = a.due_date ?? null;
  const bDue = b.due_date ?? null;
  if (aDue !== bDue) {
    if (!aDue) return 1;
    if (!bDue) return -1;
    const dueCmp = aDue.localeCompare(bDue);
    if (dueCmp !== 0) return dueCmp;
  }

  const prioCmp = priorityRank(a.priority) - priorityRank(b.priority);
  if (prioCmp !== 0) return prioCmp;

  const aCreated = createdAtMs(a.created_at);
  const bCreated = createdAtMs(b.created_at);
  if (aCreated !== bCreated) {
    if (aCreated === null) return 1;
    if (bCreated === null) return -1;
    return aCreated - bCreated;
  }

  return a.id.localeCompare(b.id);
}

/** Cópia ordenada por `compareSubtasks`. Não muta o array de entrada. */
export function sortSubtasks<T extends SubtaskSortable>(items: readonly T[]): T[] {
  return [...items].sort(compareSubtasks);
}

/**
 * Uma subtarefa não pode vencer depois da tarefa-pai — sem sentido terminar antes do trabalho
 * que ela compõe. Pai sem prazo não restringe nada (nada pra comparar); subtarefa sem prazo é
 * sempre válida (ainda não escolheu data).
 */
export function isSubtaskDueDateValid(
  subtaskDueDate: string | null,
  parentDueDate: string | null
): boolean {
  if (!parentDueDate || !subtaskDueDate) return true;
  return subtaskDueDate <= parentDueDate;
}

/** Agrupa tarefas por `parent_task_id`, ignorando tarefas de topo (parent_task_id nulo).
 * A ordem de cada lista é a ordem manual (`sort_order`), com o id como desempate — é o que o
 * arraste das subtarefas no formulário grava. A Lista, o Kanban e o Gantt reordenam na exibição
 * (`sortSubtasks`: prazo → prioridade → criação). */
export function groupSubtasksByParent<T extends SubtaskLike>(tasks: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const t of tasks) {
    if (!t.parent_task_id) continue;
    const list = map.get(t.parent_task_id);
    if (list) list.push(t);
    else map.set(t.parent_task_id, [t]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      const order = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      return order !== 0 ? order : a.id.localeCompare(b.id);
    });
  }
  return map;
}

/** Move o item `from` para o índice `to`. Sem mutar o array original. */
export function reorderItems<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
