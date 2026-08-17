import { isDoseLate } from "@/domain/tasks/medication";
import type { Task } from "@/types/tasks";

/**
 * Adesão ao tratamento (feature 064) — pura, sem I/O.
 *
 * A adesão é **calculada, nunca armazenada**: guardar o número exigiria recalculá-lo a cada
 * marcação de dose e ele ficaria dessincronizado no primeiro erro. A fonte é a mesma que a UI já
 * mostra: a lista de doses (`task`) com `status`/`completed_at`.
 */

export interface AdherenceSummary {
  /** Doses **já vencidas** no período. Dose de amanhã não conta como falha. */
  total: number;
  /** Vencidas e concluídas. */
  taken: number;
  /** Concluídas dentro da margem de tolerância (`isDoseLate` da 049 = 60 min). */
  onTime: number;
  /** Concluídas depois da margem. */
  late: number;
  /** Vencidas e não concluídas. */
  missed: number;
  /** `taken / total`, de 0 a 1 (0 quando não há dose vencida). */
  takenRate: number;
  /** `onTime / total`, de 0 a 1 — a métrica que separa "tomou" de "tomou na hora". */
  onTimeRate: number;
}

const EMPTY: AdherenceSummary = {
  total: 0,
  taken: 0,
  onTime: 0,
  late: 0,
  missed: 0,
  takenRate: 0,
  onTimeRate: 0,
};

/** 4 casas: o suficiente para 2/3 virar 67% na tela sem carregar lixo de ponto flutuante. */
function rate(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 10_000) / 10_000;
}

/**
 * Instante agendado da dose. `dose_time` (feature 064) tem precedência sobre `due_time` porque é
 * o horário do tratamento; sem nenhum dos dois, a dose só vence no fim do dia — assim uma dose de
 * hoje sem horário não é contada como perdida no meio da manhã.
 */
function scheduledAt(dose: Task): Date | null {
  if (!dose.due_date) return null;
  const [year, month, day] = dose.due_date.split("-").map(Number);
  if (year == null || month == null || day == null) return null;

  const time = dose.dose_time ?? dose.due_time;
  if (!time) return new Date(year, month - 1, day, 23, 59, 59, 999);

  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour ?? 0, minute ?? 0);
}

/**
 * Adesão sobre uma lista de doses. Só entram as **já vencidas** em `now`: incluir doses futuras
 * afundaria o percentual de qualquer tratamento contínuo (um remédio de uso diário sem fim teria
 * adesão tendendo a zero só por existir amanhã).
 *
 * Uma dose concluída conta como tomada mesmo que o instante agendado ainda não tenha chegado —
 * quem tomou adiantado não deve ser punido —, mas nesse caso ela também entra no `total`, senão a
 * conta somaria mais tomadas que doses.
 */
export function computeAdherence(doses: Task[], now: Date = new Date()): AdherenceSummary {
  if (doses.length === 0) return EMPTY;

  let total = 0;
  let taken = 0;
  let late = 0;

  for (const dose of doses) {
    const scheduled = scheduledAt(dose);
    if (!scheduled) continue;

    const done = dose.status === "done" || dose.completed_at != null;
    if (scheduled.getTime() > now.getTime() && !done) continue;

    total += 1;
    if (!done) continue;

    taken += 1;
    // `isDoseLate` (feature 049, reusado sem reescrever) compara com `due_time`. As doses da 064
    // trazem o horário em `dose_time`; passar o efetivo evita que uma dose sem `due_time` seja
    // dada como pontual por falta de referência.
    if (isDoseLate({ ...dose, due_time: dose.dose_time ?? dose.due_time })) late += 1;
  }

  const onTime = taken - late;
  return {
    total,
    taken,
    onTime,
    late,
    missed: total - taken,
    takenRate: rate(taken, total),
    onTimeRate: rate(onTime, total),
  };
}

/** `0.67` → `"67%"`. Vive aqui e não na tela para o número da lista e o do dashboard baterem. */
export function formatRate(value: number): string {
  return `${Math.round(value * 100)}%`;
}
