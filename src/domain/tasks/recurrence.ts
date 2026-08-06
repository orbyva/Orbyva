import type { RecurrenceRule } from "@/types/tasks";

function addOccurrence(iso: string, rule: RecurrenceRule): string {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(y, m - 1, d, 12);
  if (rule.frequency === "daily") {
    next.setDate(next.getDate() + rule.interval);
  } else if (rule.frequency === "weekly") {
    next.setDate(next.getDate() + 7 * rule.interval);
  } else {
    next.setMonth(next.getMonth() + rule.interval);
  }
  const yy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Calcula quais ocorrências (datas ISO) de uma tarefa recorrente ainda faltam
 * gerar entre a origem e hoje. Puro — a materialização (insert no banco) fica
 * em `api/tasks/tasks.ts`.
 */
export function computeMissingOccurrences(
  originDueDate: string,
  rule: RecurrenceRule,
  existingDates: string[],
  today: string
): string[] {
  if (rule.interval <= 0) {
    return [];
  }

  const existing = new Set(existingDates);
  const missing: string[] = [];
  let cursor = addOccurrence(originDueDate, rule);
  let guard = 0;

  while (cursor <= today && guard < 1000) {
    guard += 1;
    if (rule.until && cursor > rule.until) break;
    if (!existing.has(cursor)) missing.push(cursor);
    cursor = addOccurrence(cursor, rule);
  }

  return missing;
}
