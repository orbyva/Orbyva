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
  return toIso(next);
}

function toIso(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function startOfWeek(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  dt.setDate(dt.getDate() - dt.getDay());
  return dt;
}

/**
 * Variante de `computeMissingOccurrences` para semanal com dias da semana específicos
 * (ex.: "toda terça e quinta"). Cada janela de `interval` semanas, a partir da semana de
 * `originDueDate`, gera uma ocorrência por dia marcado em `rule.weekdays`.
 */
function computeMissingWeekdayOccurrences(
  originDueDate: string,
  rule: RecurrenceRule,
  existingDates: string[],
  today: string
): string[] {
  const weekdays = [...(rule.weekdays ?? [])].sort((a, b) => a - b);
  if (weekdays.length === 0) return [];

  const anchorWeekStart = startOfWeek(originDueDate);
  const existing = new Set(existingDates);
  const missing: string[] = [];
  let guard = 0;

  for (let weekOffset = 0; guard < 1000; weekOffset += rule.interval) {
    const weekStart = new Date(anchorWeekStart);
    weekStart.setDate(weekStart.getDate() + weekOffset * 7);

    const firstCandidate = new Date(weekStart);
    firstCandidate.setDate(firstCandidate.getDate() + weekdays[0]);
    if (toIso(firstCandidate) > today) break;

    for (const wd of weekdays) {
      guard += 1;
      const candidateDate = new Date(weekStart);
      candidateDate.setDate(candidateDate.getDate() + wd);
      const candidate = toIso(candidateDate);
      if (candidate <= originDueDate) continue;
      if (candidate > today) continue;
      if (rule.until && candidate > rule.until) continue;
      if (!existing.has(candidate)) missing.push(candidate);
    }
  }

  return missing.sort();
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

  if (rule.frequency === "weekly" && rule.weekdays && rule.weekdays.length > 0) {
    return computeMissingWeekdayOccurrences(originDueDate, rule, existingDates, today);
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
