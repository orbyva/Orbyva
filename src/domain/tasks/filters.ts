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
