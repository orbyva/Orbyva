export interface TaskFilter {
  projectId?: string | null;
  tag?: string;
  dueBefore?: string;
}

interface FilterableTask {
  project_id: string | null;
  tags: string[];
  due_date: string | null;
}

export function filterTasks<T extends FilterableTask>(
  tasks: T[],
  filter: TaskFilter
): T[] {
  return tasks.filter((task) => {
    if (filter.projectId !== undefined && task.project_id !== filter.projectId) {
      return false;
    }
    if (filter.tag && !task.tags.includes(filter.tag)) return false;
    if (filter.dueBefore && (!task.due_date || task.due_date > filter.dueBefore)) {
      return false;
    }
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
