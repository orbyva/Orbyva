import { formatDateBR, formatDateTimeBR } from "@/lib/currency";
import { formatLocalIsoDate } from "@/lib/dates";

import { DEFAULT_ITEM_DURATION_MINUTES } from "./calendar";

export interface ImmediateScheduleInput {
  estimated_duration?: number | null;
  is_quick?: boolean | null;
}

export interface ImmediateSchedule {
  /** `YYYY-MM-DD` local — pode ser o dia seguinte quando a duração atravessa a meia-noite. */
  due_date: string;
  due_time: string;
  /** Minutos usados como palpite quando a tarefa não tinha duração (`null` se não houve palpite). */
  usedFallbackMinutes: number | null;
  minutes: number;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Prazo do "Começar agora" (mesma regra do web, feature 078): tarefa pontual → agora exato;
 * com duração → agora + duração; sem duração → agora + `DEFAULT_ITEM_DURATION_MINUTES`.
 */
export function computeImmediateSchedule(
  task: ImmediateScheduleInput,
  now: Date = new Date()
): ImmediateSchedule {
  const duration = task.estimated_duration;
  const hasDuration = typeof duration === "number" && duration > 0;
  const isQuick = !!task.is_quick;

  const minutes = isQuick ? 0 : hasDuration ? duration : DEFAULT_ITEM_DURATION_MINUTES;
  const usedFallbackMinutes = isQuick || hasDuration ? null : DEFAULT_ITEM_DURATION_MINUTES;

  const due = new Date(now.getTime() + minutes * 60_000);
  return {
    due_date: formatLocalIsoDate(due),
    due_time: `${pad(due.getHours())}:${pad(due.getMinutes())}`,
    usedFallbackMinutes,
    minutes,
  };
}

/** Texto do aviso depois do "Começar agora" — mesmo conteúdo do toast do web. */
export function describeStartNow(input: {
  schedule: ImmediateSchedule;
  now?: Date;
  previousDue?: { due_date: string | null; due_time?: string | null } | null;
  stoppedPrevious?: boolean;
}): string {
  const { schedule, previousDue, stoppedPrevious } = input;
  const isToday = schedule.due_date === formatLocalIsoDate(input.now ?? new Date());
  const dueLabel = isToday
    ? schedule.due_time
    : `${formatDateBR(schedule.due_date)} ${schedule.due_time}`;
  const parts = [`Começou agora · prazo ${dueLabel}.`];
  if (schedule.usedFallbackMinutes) {
    parts.push(`Sem duração estimada — usamos ${schedule.usedFallbackMinutes} min.`);
  }
  if (stoppedPrevious) parts.push("O timer anterior foi parado.");
  if (previousDue?.due_date) {
    parts.push(`Prazo anterior: ${formatDateTimeBR(previousDue.due_date, previousDue.due_time)}.`);
  }
  return parts.join(" ");
}
