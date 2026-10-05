import { formatLocalIsoDate } from "@/lib/dates";

export interface LocalDateTime {
  date: string;
  time: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function splitLocalDateTime(iso: string): LocalDateTime {
  const d = new Date(iso);
  return { date: formatLocalIsoDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export function joinLocalDateTime({ date, time }: LocalDateTime): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm).toISOString();
}

export function formatTimeOfDay(iso: string): string {
  return splitLocalDateTime(iso).time;
}

export function entryDurationMinutes(startedAt: string, endedAt: string | null, now = new Date()): number {
  const end = endedAt ? new Date(endedAt).getTime() : now.getTime();
  return Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 60_000));
}

/**
 * Payload de edição de um registro de tempo. `end` nulo mantém o registro em andamento (só o
 * início muda). Fim antes ou igual ao início é recusado.
 */
export function buildTimeEntryUpdate(
  start: LocalDateTime,
  end: LocalDateTime | null
): { ok: true; value: { started_at: string; ended_at: string | null } } | { ok: false; error: string } {
  const started_at = joinLocalDateTime(start);
  if (!end) return { ok: true, value: { started_at, ended_at: null } };
  const ended_at = joinLocalDateTime(end);
  if (new Date(ended_at).getTime() <= new Date(started_at).getTime()) {
    return { ok: false, error: "O fim precisa ser depois do início." };
  }
  return { ok: true, value: { started_at, ended_at } };
}
