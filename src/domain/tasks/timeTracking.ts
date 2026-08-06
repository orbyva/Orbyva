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

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}min`;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}
