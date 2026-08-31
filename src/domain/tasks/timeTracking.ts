import { formatLocalIsoDate } from "@/lib/dates";

export interface TimeEntry {
  taskId: string;
  startedAt: string;
  endedAt: string | null;
}

export function elapsedSeconds(entry: TimeEntry, now: Date = new Date()): number {
  const start = new Date(entry.startedAt).getTime();
  const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now.getTime();
  return Math.max(0, Math.round((end - start) / 1000));
}

export function totalSecondsForTask(
  taskId: string,
  entries: TimeEntry[],
  now: Date = new Date()
): number {
  return entries
    .filter((entry) => entry.taskId === taskId)
    .reduce((sum, entry) => sum + elapsedSeconds(entry, now), 0);
}

/** `HH:MM:SS` (ou `MM:SS` abaixo de 1h) — mesmo formato do timer ativo (`LiveWidget`/`Live.tsx`),
 * pra registros finalizados não perderem precisão de segundos na exibição. */
export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export interface TimeEntryDayGroup<T extends TimeEntry> {
  dayIso: string;
  entries: T[];
}

/**
 * Agrupa entradas de tempo por dia local (a partir de `startedAt`, convertido pro dia local via
 * `Date` — nunca fatiando a string ISO UTC crua, mesmo cuidado de `domain/tasks/calendar.ts`),
 * dias mais recentes primeiro. Espera receber `entries` já ordenadas por `startedAt` desc — não
 * reordena dentro do dia.
 */
export function groupEntriesByDay<T extends TimeEntry>(entries: T[]): TimeEntryDayGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const entry of entries) {
    const dayIso = formatLocalIsoDate(new Date(entry.startedAt));
    const list = map.get(dayIso);
    if (list) list.push(entry);
    else map.set(dayIso, [entry]);
  }
  return Array.from(map.entries())
    .map(([dayIso, dayEntries]) => ({ dayIso, entries: dayEntries }))
    .sort((a, b) => b.dayIso.localeCompare(a.dayIso));
}
