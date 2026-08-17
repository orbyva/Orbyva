import type {
  ReminderEntityType,
  ReminderFrequency,
  ReminderPreference,
} from "@/types/health";

/**
 * Agendamento de lembrete (feature 063), puro e sem I/O.
 *
 * **Nenhuma ocorrência futura vira linha no banco.** Um lembrete diário de água geraria milhares de
 * linhas por ano; o app já resolveu isso nas tarefas recorrentes (ocorrências virtuais calculadas no
 * cliente por `computeVirtualOccurrences`, em `src/domain/tasks/recurrence.ts`) e aqui é o mesmo
 * princípio, ainda mais simples: a linha de `reminder_preference` guarda a **configuração**, e o
 * horário do próximo lembrete é calculado destas funções toda vez que a tela carrega.
 *
 * A âncora da cadência é `created_at` da preferência: semanal cai no mesmo dia da semana em que ela
 * foi criada, mensal no mesmo dia do mês (ajustado quando o mês é curto). Diária cai todo dia.
 */

/** Horário usado quando a preferência não define `time_of_day`. */
export const DEFAULT_REMINDER_TIME = "09:00";

/** Rótulo em pt-BR de cada tipo de lembrete — usado no diálogo de preferências. */
export const REMINDER_ENTITY_LABEL: Record<ReminderEntityType, string> = {
  water: "Água",
  nutrition: "Alimentação",
  medication: "Medicação",
  consultation: "Consultas",
  body_metric: "Medidas do corpo",
};

/** Descrição curta do que cada lembrete cobre, para a linha do diálogo não ficar só com o rótulo. */
export const REMINDER_ENTITY_DESCRIPTION: Record<ReminderEntityType, string> = {
  water: "Lembrar de beber água",
  nutrition: "Lembrar das refeições",
  medication: "Lembrar de tomar os remédios",
  consultation: "Lembrar das consultas marcadas",
  body_metric: "Lembrar de registrar peso e medidas",
};

/** Ordem estável das linhas do diálogo — água e alimentação primeiro (são o pedido do usuário). */
export const REMINDER_ENTITY_TYPES: ReminderEntityType[] = [
  "water",
  "nutrition",
  "medication",
  "consultation",
  "body_metric",
];

export const REMINDER_FREQUENCY_LABEL: Record<ReminderFrequency, string> = {
  daily: "Todo dia",
  weekly: "Toda semana",
  monthly: "Todo mês",
};

/** Preferência mínima o bastante para as contas — o que as funções realmente leem. */
export type ReminderSchedule = Pick<
  ReminderPreference,
  "frequency" | "time_of_day" | "enabled" | "last_notified_at"
> & { created_at?: string | null };

/** `HH:MM` ou `HH:MM:SS` (o Postgres devolve com segundos) → [hora, minuto]. */
function parseTimeOfDay(time: string | null | undefined): [number, number] {
  const raw = (time ?? "").trim() || DEFAULT_REMINDER_TIME;
  const [h, m] = raw.split(":");
  const hour = Number(h);
  const minute = Number(m);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    const [dh, dm] = DEFAULT_REMINDER_TIME.split(":");
    return [Number(dh), Number(dm)];
  }
  return [Math.min(23, Math.max(0, hour)), Math.min(59, Math.max(0, minute))];
}

/** Data-âncora da cadência: quando a preferência foi criada; hoje, se a linha não trouxer isso. */
function anchorDate(pref: ReminderSchedule, fallback: Date): Date {
  const raw = pref.created_at;
  if (!raw) return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

/** Um `Date` local no dia de `day` com o horário da preferência. */
function slotOn(day: Date, hour: number, minute: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
}

/** Dia do mês da âncora preso ao último dia do mês pedido (31 em fevereiro vira 28/29). */
function monthlySlot(
  anchorDay: number,
  year: number,
  month: number,
  hour: number,
  minute: number
): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(anchorDay, lastDay), hour, minute, 0, 0);
}

/**
 * O horário agendado **do período que contém `at`**: hoje (diário), o dia da semana da âncora desta
 * semana (semanal), o dia do mês da âncora deste mês (mensal). Pode estar no futuro — é o caso de
 * "ainda não chegou a hora de hoje".
 *
 * É o conceito central das duas funções públicas: o próximo lembrete é este slot (ou o do período
 * seguinte, se este já passou), e o lembrete está vencido quando este slot chegou e
 * `last_notified_at` ainda não o cobre. Só o slot do período corrente conta — um lembrete diário
 * perdido ontem não toca hoje de manhã antes da hora: quem vale é o de hoje.
 */
function currentPeriodSlot(pref: ReminderSchedule, at: Date): Date {
  const [hour, minute] = parseTimeOfDay(pref.time_of_day);
  const anchor = anchorDate(pref, at);

  if (pref.frequency === "daily") return slotOn(at, hour, minute);

  if (pref.frequency === "weekly") {
    // Volta de 0 a 6 dias até o dia da semana da âncora.
    const back = (at.getDay() - anchor.getDay() + 7) % 7;
    const day = new Date(at);
    day.setDate(day.getDate() - back);
    return slotOn(day, hour, minute);
  }

  return monthlySlot(anchor.getDate(), at.getFullYear(), at.getMonth(), hour, minute);
}

/**
 * Próximo horário em que o lembrete deve tocar, a partir de `from` (inclusive: se `from` cai
 * exatamente no horário agendado, é agora). `null` quando a preferência está desligada — lembrete
 * desligado não tem "próximo".
 *
 * É o que a linha "Próximo: <data e hora>" do diálogo de preferências mostra.
 */
export function nextReminderAt(
  pref: ReminderSchedule,
  from: Date = new Date()
): Date | null {
  if (!pref.enabled) return null;

  const [hour, minute] = parseTimeOfDay(pref.time_of_day);
  const current = currentPeriodSlot(pref, from);
  if (current >= from) return current;

  if (pref.frequency === "daily") {
    const tomorrow = new Date(from);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return slotOn(tomorrow, hour, minute);
  }

  if (pref.frequency === "weekly") {
    const next = new Date(current);
    next.setDate(next.getDate() + 7);
    return next;
  }

  const anchor = anchorDate(pref, from);
  return monthlySlot(
    anchor.getDate(),
    current.getFullYear(),
    current.getMonth() + 1,
    hour,
    minute
  );
}

/**
 * O lembrete está vencido agora?
 *
 * Devido quando (1) está ligado, (2) o horário agendado do período corrente já chegou — com
 * `graceMinutes` de tolerância para adiantar o disparo em vez de perder o slot por poucos minutos de
 * diferença de relógio — e (3) `last_notified_at` **não cobre esse período**, isto é, o último
 * disparo é anterior ao slot corrente.
 *
 * A tolerância abre a janela para a frente, não a fecha: um horário das 8h continua vencido quando o
 * usuário abre o app às 14h. Fechar a janela em 5 minutos faria o lembrete só existir para quem
 * estivesse com a aba aberta no minuto exato — o oposto do que uma notificação serve. Quem impede a
 * repetição é `last_notified_at`, não o fim da janela; e quem impede o lembrete velho de ontem
 * aparecer hoje de manhã é o slot ser sempre o do período corrente.
 */
export function isReminderDue(
  pref: ReminderSchedule,
  now: Date = new Date(),
  graceMinutes = 5
): boolean {
  if (!pref.enabled) return false;

  const withGrace = new Date(now.getTime() + graceMinutes * 60_000);
  const slot = currentPeriodSlot(pref, now);
  if (slot > withGrace) return false;

  // Slot anterior à própria criação da preferência não conta: acabar de ligar o lembrete de água às
  // 14h não deve disparar retroativamente o das 9h de hoje.
  const created = pref.created_at ? new Date(pref.created_at) : null;
  if (created && !Number.isNaN(created.getTime()) && slot < created) return false;

  if (!pref.last_notified_at) return true;
  const last = new Date(pref.last_notified_at);
  if (Number.isNaN(last.getTime())) return true;
  return last < slot;
}
