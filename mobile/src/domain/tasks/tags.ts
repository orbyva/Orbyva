/** Quantas tarefas e projetos usam cada tag. */
export function countTagUsage(
  rows: readonly { tag_ids?: string[] | null }[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const id of new Set(row.tag_ids ?? [])) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}
