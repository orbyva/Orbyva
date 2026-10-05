import { formatLocalIsoDate } from "@/lib/dates";

export function estimatedDurationDays(minutes: number): number {
  return Math.max(1, Math.ceil(minutes / (24 * 60)));
}

export function addDaysToIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return formatLocalIsoDate(new Date(y, m - 1, d + days, 12));
}

export function diffDaysIso(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td);
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export interface TaskScheduleInput {
  start_date?: string | null;
  due_date?: string | null;
  estimated_duration?: number | null;
}

export interface TaskSchedule {
  start_date: string;
  due_date: string;
  /** Só reflete datas **reais**; barra derivada da duração ou âncora de hoje é "não confirmada". */
  hasPlannedDate: boolean;
}

/**
 * Datas efetivas da barra no Gantt (mesma regra do web): duas datas → usa as duas; uma data +
 * duração → deriva a outra ponta; nenhuma data → âncora de hoje com a largura da duração.
 */
export function resolveTaskSchedule(
  { start_date, due_date, estimated_duration }: TaskScheduleInput,
  todayIso: string = formatLocalIsoDate(new Date())
): TaskSchedule {
  const hasPlannedDate = !!(start_date || due_date);
  const durationDays =
    estimated_duration && estimated_duration > 0 ? estimatedDurationDays(estimated_duration) : null;

  if (start_date && due_date) return { start_date, due_date, hasPlannedDate };
  if (start_date) {
    return {
      start_date,
      due_date: durationDays ? addDaysToIso(start_date, durationDays) : start_date,
      hasPlannedDate,
    };
  }
  if (due_date) {
    return {
      start_date: durationDays ? addDaysToIso(due_date, -durationDays) : due_date,
      due_date,
      hasPlannedDate,
    };
  }
  return {
    start_date: todayIso,
    due_date: addDaysToIso(todayIso, durationDays ?? 1),
    hasPlannedDate,
  };
}
