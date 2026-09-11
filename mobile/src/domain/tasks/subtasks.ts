import type { TaskPriority } from "@/types/tasks";

export interface SubtaskSortable {
  id: string;
  due_date?: string | null;
  priority?: TaskPriority | null;
  status?: string;
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function priorityRank(priority: TaskPriority | null | undefined): number {
  return priority ? PRIORITY_RANK[priority] : 3;
}

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
  return a.id.localeCompare(b.id);
}

export function sortSubtasks<T extends SubtaskSortable>(items: readonly T[]): T[] {
  return [...items].sort(compareSubtasks);
}

/** Subtarefa não vence depois da mãe. Mãe sem prazo não restringe; subtarefa sem prazo é válida. */
export function isSubtaskDueDateValid(
  subtaskDueDate: string | null,
  parentDueDate: string | null
): boolean {
  if (!parentDueDate || !subtaskDueDate) return true;
  return subtaskDueDate <= parentDueDate;
}

export function clampDueToParent(
  dueDate: string | null,
  parentDueDate: string | null
): string | null {
  if (!dueDate) return null;
  if (!parentDueDate) return dueDate;
  return dueDate > parentDueDate ? parentDueDate : dueDate;
}
