import { formatLocalIsoDate } from "@/lib/dates";

/**
 * Formata `estimated_duration` (minutos) de forma curta para exibição no trigger de
 * `TaskDurationQuickPick` e em qualquer outro lugar que mostre a duração estimada de uma tarefa
 * (ex.: Gantt). `null`/`undefined`/`0` (ou negativo) retornam string vazia — quem exibe decide o
 * placeholder.
 */
export function formatEstimatedDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "";

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (hours === 0) return `${remaining}min`;
  if (remaining === 0) return `${hours}h`;
  return `${hours}h${remaining}`;
}

/**
 * Converte `estimated_duration` (minutos) para dias inteiros de calendário, arredondando pra
 * cima e com mínimo de 1 — o Gantt trabalha em granularidade de dia (`isoToLocalDate` em
 * `gantt.ts` já ignora hora), então qualquer duração menor que 1 dia vira barra de 1 dia.
 */
export function estimatedDurationDays(minutes: number): number {
  return Math.max(1, Math.ceil(minutes / (24 * 60)));
}

function todayIso(): string {
  return formatLocalIsoDate(new Date());
}

/** Soma (ou subtrai, com `days` negativo) dias de calendário a uma data `YYYY-MM-DD`, sem os
 * problemas de fuso de operar em UTC (`Date` construído com componentes locais, ao meio-dia pra
 * evitar qualquer viragem de DST). */
function addDaysToIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return formatLocalIsoDate(new Date(y, m - 1, d + days, 12));
}

/**
 * Diferença em dias de calendário entre duas datas `YYYY-MM-DD` (positiva quando `toIso` é
 * posterior a `fromIso`). Usada pelo Gantt (`GanttChart.tsx`) pra distinguir mover (as duas
 * pontas deslocam pelo mesmo delta) de redimensionar (só uma ponta muda, duração muda) e pra
 * recalcular `estimated_duration` a partir das datas efetivas de uma barra.
 */
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
  /** Data de início efetiva pra montar a barra do Gantt — real (`start_date`) quando existe,
   * senão derivada de `due_date` − duração, senão a âncora de hoje. */
  start_date: string;
  /** Data de prazo efetiva, mesma lógica de prioridade que `start_date`. */
  due_date: string;
  /** Reflete só se `start_date`/`due_date` **reais** existem (independente de `estimated_duration`)
   * — uma barra só-com-duração continua "não confirmada" (estilo tracejado), já que nenhuma data
   * foi de fato definida pelo usuário. */
  hasPlannedDate: boolean;
}

/**
 * A partir de `start_date`/`due_date`/`estimated_duration` de uma tarefa, decide as datas
 * efetivas pra montar sua barra no Gantt. `estimated_duration` é sempre o sinal de **menor
 * prioridade**: nunca sobrescreve duas datas explícitas já definidas pelo usuário.
 * - Duas datas presentes → usa as duas, ignora a duração.
 * - Só uma data + duração → calcula a outra ponta a partir da duração.
 * - Nenhuma data (com ou sem duração) → âncora de hoje, com a largura da duração (mínimo 1 dia).
 */
export function resolveTaskSchedule({
  start_date,
  due_date,
  estimated_duration,
}: TaskScheduleInput): TaskSchedule {
  const hasPlannedDate = !!(start_date || due_date);
  const durationDays =
    estimated_duration && estimated_duration > 0 ? estimatedDurationDays(estimated_duration) : null;

  if (start_date && due_date) {
    return { start_date, due_date, hasPlannedDate };
  }
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
  const anchorStart = todayIso();
  return {
    start_date: anchorStart,
    due_date: addDaysToIso(anchorStart, durationDays ?? 1),
    hasPlannedDate,
  };
}
