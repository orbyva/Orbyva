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
