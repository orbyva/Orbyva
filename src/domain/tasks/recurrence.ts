import type { RecurrenceFrequency, RecurrenceRule } from "@/types/tasks";

function addOccurrence(iso: string, rule: RecurrenceRule): string {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(y, m - 1, d, 12);
  if (rule.frequency === "daily") {
    next.setDate(next.getDate() + rule.interval);
  } else if (rule.frequency === "weekly") {
    next.setDate(next.getDate() + 7 * rule.interval);
  } else if (rule.frequency === "yearly") {
    next.setFullYear(next.getFullYear() + rule.interval);
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

/** 1ª ocorrência do `weekday` (0=domingo…6=sábado) no mês, ou -1 se cai na última semana dele. */
export function weekdayOrdinalInMonth(date: Date): number {
  const day = date.getDate();
  const ordinal = Math.ceil(day / 7);
  const nextWeek = new Date(date);
  nextWeek.setDate(nextWeek.getDate() + 7);
  if (nextWeek.getMonth() !== date.getMonth()) return -1;
  return ordinal;
}

/** Data do enésimo `weekday` do mês (`nth` 1-5, ou -1 para o último); `null` se não existir. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date | null {
  if (nth === -1) {
    const last = new Date(year, month + 1, 0, 12);
    const offset = (last.getDay() - weekday + 7) % 7;
    last.setDate(last.getDate() - offset);
    return last;
  }
  const first = new Date(year, month, 1, 12);
  const offset = (weekday - first.getDay() + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  const date = new Date(year, month, day, 12);
  return date.getMonth() === month ? date : null;
}

/**
 * Variante de `computeMissingOccurrences` para mensal no "enésimo dia da semana do mês"
 * (ex.: "toda terceira terça-feira"), inferido do dia/semana de `originDueDate`.
 */
function computeMissingMonthlyWeekdayOccurrences(
  originDueDate: string,
  rule: RecurrenceRule,
  existingDates: string[],
  today: string
): string[] {
  const [oy, om, od] = originDueDate.split("-").map(Number);
  const origin = new Date(oy, om - 1, od, 12);
  const weekday = origin.getDay();
  const ordinal = weekdayOrdinalInMonth(origin);

  const existing = new Set(existingDates);
  const missing: string[] = [];
  let monthCursor = om - 1;
  let yearCursor = oy;
  let guard = 0;

  while (guard < 1000) {
    guard += 1;
    monthCursor += rule.interval;
    while (monthCursor > 11) {
      monthCursor -= 12;
      yearCursor += 1;
    }

    const candidateDate = nthWeekdayOfMonth(yearCursor, monthCursor, weekday, ordinal);
    if (!candidateDate) continue;
    const candidate = toIso(candidateDate);
    if (candidate > today) break;
    if (rule.until && candidate > rule.until) break;
    if (!existing.has(candidate)) missing.push(candidate);
  }

  return missing;
}

function computeMissingSimpleOccurrences(
  originDueDate: string,
  rule: RecurrenceRule,
  existingDates: string[],
  today: string
): string[] {
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

  let missing: string[];
  if (rule.frequency === "weekly" && rule.weekdays && rule.weekdays.length > 0) {
    missing = computeMissingWeekdayOccurrences(originDueDate, rule, existingDates, today);
  } else if (rule.frequency === "monthly" && rule.monthlyMode === "weekday") {
    missing = computeMissingMonthlyWeekdayOccurrences(originDueDate, rule, existingDates, today);
  } else {
    missing = computeMissingSimpleOccurrences(originDueDate, rule, existingDates, today);
  }

  if (rule.count != null && rule.count > 0) {
    const alreadyGenerated = existingDates.length + 1;
    const remaining = Math.max(0, rule.count - alreadyGenerated);
    missing = missing.slice(0, remaining);
  }

  return missing;
}

interface SeriesOriginSource {
  id: string;
  recurrence_rule?: RecurrenceRule | null;
  recurrence_origin_id?: string | null;
}

/**
 * Id da tarefa que ancora a série de `task` — a origem, para quem `recurrence_origin_id` das
 * ocorrências aponta —, ou `null` quando a tarefa não faz parte de série nenhuma.
 *
 * É estrutural de propósito: cobre tanto a recorrência simples quanto as séries vindas da
 * Recorrência Financeira, porque as duas gravam `recurrence_origin_id` nas ocorrências
 * (`materializeRecurringInstances` e `materializeLinkedInstances`). Doses de medicação (feature
 * 064) caem fora sozinhas — nascem com `recurrence_rule` e `recurrence_origin_id` nulos, agrupadas
 * só por `medication_id`, que `seriesKey` também não reconhece como série.
 */
export function resolveSeriesOriginId(task: SeriesOriginSource): string | null {
  if (task.recurrence_origin_id) return task.recurrence_origin_id;
  if (task.recurrence_rule) return task.id;
  return null;
}

interface RecurringSeriesSource {
  id: string;
  due_date: string | null;
  recurrence_rule: RecurrenceRule | null;
  recurrence_origin_id: string | null;
  /**
   * Tratamento (feature 064) do qual a linha é dose. Opcional porque quem não sabe de medicação
   * nenhuma continua podendo chamar `computeVirtualOccurrences`; o que não pode é o campo ficar
   * **fora do tipo**, como ficava até a 074 — a origem chegava aqui com `medication_id`
   * preenchido e o tipo estreito escondia isso do filtro.
   */
  medication_id?: string | null;
}

/**
 * Ocorrências futuras de séries recorrentes que ainda não foram materializadas no banco (a
 * materialização em `api/tasks/tasks.ts` só cria linhas até hoje, sob demanda) — pra exibir como
 * preview em telas de calendário sem inserir nada. Reaproveita `computeMissingOccurrences`
 * passando o fim do intervalo visível no lugar de "hoje": qualquer data já materializada está em
 * `existingDates` e não volta duplicada; só sobra o que ainda falta gerar dentro do intervalo.
 *
 * Séries de medicação (`medication_id`) ficam **de fora**, exatamente como em
 * `materializeRecurringInstances` (`src/api/tasks/tasks.ts`) — é a mesma regra, e até a feature 074
 * ela estava escrita só naquele lado. O backfill da 064 preserva a `recurrence_rule` da origem de
 * propósito, então uma medicação migrada da 049 é uma linha com regra **e** `medication_id`: sem
 * este filtro ela virava uma ocorrência virtual por dia em cima da dose real (que nasce com
 * `recurrence_origin_id` nulo e por isso nunca entra em `existingDates`), e a agenda desenhava duas
 * bolinhas de comprimido no mesmo dia. Quem cobre o futuro do tratamento é `computeVirtualDoses`
 * (feature 071), que deduplica por (`due_date`, `dose_time`).
 */
export function computeVirtualOccurrences<T extends RecurringSeriesSource>(
  tasks: T[],
  rangeEndIso: string
): { originId: string; dueDate: string }[] {
  const origins = tasks.filter(
    (t): t is T & { due_date: string; recurrence_rule: RecurrenceRule } =>
      !!t.recurrence_rule && !t.recurrence_origin_id && !!t.due_date && !t.medication_id
  );

  const result: { originId: string; dueDate: string }[] = [];
  for (const origin of origins) {
    const existingDates = tasks
      .filter((t) => t.recurrence_origin_id === origin.id && t.due_date)
      .map((t) => t.due_date as string);
    const missing = computeMissingOccurrences(
      origin.due_date,
      origin.recurrence_rule,
      existingDates,
      rangeEndIso
    );
    for (const dueDate of missing) {
      result.push({ originId: origin.id, dueDate });
    }
  }
  return result;
}

/** Unidade de intervalo por frequência, no singular/plural — usada no `<Select>` de frequência
 * (`TaskRecurrenceRules`) e no resumo textual da recorrência. */
export const FREQUENCY_UNIT_LABELS: Record<RecurrenceFrequency, string> = {
  daily: "dia(s)",
  weekly: "semana(s)",
  monthly: "mês(es)",
  yearly: "ano(s)",
};

const FREQUENCY_UNIT_SINGULAR: Record<RecurrenceFrequency, string> = {
  daily: "dia",
  weekly: "semana",
  monthly: "mês",
  yearly: "ano",
};

const FREQUENCY_UNIT_PLURAL: Record<RecurrenceFrequency, string> = {
  daily: "dias",
  weekly: "semanas",
  monthly: "meses",
  yearly: "anos",
};

/** Iniciais dos dias da semana nos botões de "Dias da semana" (0=domingo…6=sábado). */
export const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

/**
 * O que acontece quando o usuário não marca dia nenhum na repetição semanal — o ramo
 * `computeMissingSimpleOccurrences` (mesmo dia da semana da origem, a cada `interval` semanas).
 * Constante compartilhada de propósito: o formulário completo (`TaskRecurrenceRules`) e o atalho de
 * consulta (`ConsultationQuickCreateDialog`) explicam o mesmo comportamento, e duas redações
 * divergentes da mesma regra é como o app passa a se contradizer.
 */
export const WEEKDAYS_EMPTY_HINT =
  "Nenhum dia marcado repete no mesmo dia da semana do prazo, a cada intervalo.";

/** Abreviações usadas no resumo textual ("seg e qua"). */
export const WEEKDAY_NAMES_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/**
 * Nome por extenso do dia (0=domingo…6=sábado). Exportado porque `WEEKDAY_LABELS` é só a inicial
 * ("S" serve para segunda e sábado) e não funciona como nome acessível dos botões de dia da semana
 * — quem usa os botões (`TaskRecurrenceRules`, `ConsultationQuickCreateDialog`) precisa deste.
 */
export const WEEKDAY_NAMES_LONG = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

const ORDINAL_LABELS: Record<number, string> = {
  1: "primeira",
  2: "segunda",
  3: "terceira",
  4: "quarta",
  5: "quinta",
};

/** "Na terceira terça-feira" — o dia/semana do mês são inferidos de `dueDate`, não escolhidos à parte. */
export function monthlyWeekdayLabel(dueDate: string): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12);
  const ordinal = weekdayOrdinalInMonth(date);
  const ordinalLabel = ordinal === -1 ? "última" : (ORDINAL_LABELS[ordinal] ?? `${ordinal}ª`);
  return `Na ${ordinalLabel} ${WEEKDAY_NAMES_LONG[date.getDay()]}`;
}

function formatIsoAsBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "seg, qua e sex" */
function joinWeekdays(weekdays: number[]): string {
  const names = [...weekdays].sort((a, b) => a - b).map((wd) => WEEKDAY_NAMES_SHORT[wd]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

export interface RecurrenceSummaryInput {
  recurrence_rule: RecurrenceRule | null;
  linked_recurring_id?: string | null;
  due_date?: string | null;
}

/**
 * Resumo curto do estado da recorrência, para o botão que abre o `TaskRecurrenceDialog` no painel
 * denso (feature 080) — a informação não pode desaparecer atrás de um clique só porque a
 * configuração saiu da tela principal. Ex.: "Não se repete", "A cada 1 semana, seg e qua",
 * "Todo dia 15, até 30/06/2026", "Vinculada a «Aluguel»".
 *
 * `linkedDescription` é a descrição da Recorrência Financeira vinculada (quem chama tem a lista);
 * sem ela, o texto cai no genérico.
 */
export function formatRecurrenceSummary(
  value: RecurrenceSummaryInput,
  linkedDescription?: string | null
): string {
  if (value.linked_recurring_id) {
    return `Vinculada a «${linkedDescription ?? "Recorrência Financeira"}»`;
  }
  const rule = value.recurrence_rule;
  if (!rule) return "Não se repete";

  const interval = Math.max(1, rule.interval || 1);
  const dueDate = value.due_date ?? null;
  let base: string;

  if (rule.frequency === "monthly") {
    const dayPart =
      dueDate && rule.monthlyMode === "weekday"
        ? monthlyWeekdayLabel(dueDate)
        : dueDate
          ? `dia ${Number(dueDate.slice(8, 10))}`
          : null;
    if (interval === 1) {
      base = dayPart
        ? rule.monthlyMode === "weekday"
          ? dayPart
          : `Todo ${dayPart}`
        : "Todo mês";
    } else {
      const tail = dayPart
        ? rule.monthlyMode === "weekday"
          ? `, ${dayPart.charAt(0).toLowerCase()}${dayPart.slice(1)}`
          : `, no ${dayPart}`
        : "";
      base = `A cada ${interval} meses${tail}`;
    }
  } else {
    const unit =
      interval === 1
        ? FREQUENCY_UNIT_SINGULAR[rule.frequency]
        : FREQUENCY_UNIT_PLURAL[rule.frequency];
    base = `A cada ${interval} ${unit}`;
    if (rule.frequency === "weekly" && rule.weekdays && rule.weekdays.length > 0) {
      base += `, ${joinWeekdays(rule.weekdays)}`;
    }
  }

  if (rule.until) return `${base}, até ${formatIsoAsBr(rule.until)}`;
  if (rule.count) {
    return `${base}, ${rule.count} ${rule.count === 1 ? "ocorrência" : "ocorrências"}`;
  }
  return base;
}
