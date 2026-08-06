export interface DependencyEdge {
  taskId: string;
  dependsOnTaskId: string;
}

/** DFS: adicionar taskId->dependsOnTaskId cria ciclo se dependsOnTaskId já leva de volta a taskId. */
export function wouldCreateCycle(
  edges: DependencyEdge[],
  taskId: string,
  dependsOnTaskId: string
): boolean {
  if (taskId === dependsOnTaskId) return true;

  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    const list = graph.get(edge.taskId) ?? [];
    list.push(edge.dependsOnTaskId);
    graph.set(edge.taskId, list);
  }

  const visited = new Set<string>();
  const stack = [dependsOnTaskId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of graph.get(current) ?? []) stack.push(next);
  }

  return false;
}

/** Soft-block: verdadeiro se alguma dependência direta ainda não está concluída. */
export function hasOpenDependencies(
  taskId: string,
  edges: DependencyEdge[],
  doneTaskIds: Set<string>
): boolean {
  return edges
    .filter((edge) => edge.taskId === taskId)
    .some((edge) => !doneTaskIds.has(edge.dependsOnTaskId));
}
