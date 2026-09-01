interface SubtaskLike {
  id: string;
  parent_task_id: string | null;
  sort_order?: number;
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
 * arraste das subtarefas no formulário grava. */
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
