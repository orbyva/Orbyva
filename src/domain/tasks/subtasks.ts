interface SubtaskLike {
  id: string;
  parent_task_id: string | null;
}

/** Agrupa tarefas por `parent_task_id`, ignorando tarefas de topo (parent_task_id nulo). */
export function groupSubtasksByParent<T extends SubtaskLike>(tasks: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const t of tasks) {
    if (!t.parent_task_id) continue;
    const list = map.get(t.parent_task_id);
    if (list) list.push(t);
    else map.set(t.parent_task_id, [t]);
  }
  return map;
}
