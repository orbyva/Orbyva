interface SubtaskLike {
  id: string;
  parent_task_id: string | null;
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
