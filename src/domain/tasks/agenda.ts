import { formatLocalIsoDate } from "@/lib/dates";

export type AgendaBucket =
  | "overdue"
  | "today"
  | "this_week"
  | "this_month"
  | "later"
  | "no_date";

export const AGENDA_BUCKET_ORDER: AgendaBucket[] = [
  "overdue",
  "today",
  "this_week",
  "this_month",
  "later",
  "no_date",
];

export const AGENDA_BUCKET_LABELS: Record<AgendaBucket, string> = {
  overdue: "Atrasadas",
  today: "Hoje",
  this_week: "Esta semana",
  this_month: "Este mês",
  later: "Mais tarde",
  no_date: "Sem prazo",
};

function localDateFromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Último dia da semana corrente — **sábado**, porque o calendário do app abre a semana no domingo
 * (`weekStartsOn={0}` em `InlineCalendarPicker`). Num sábado devolve o próprio dia; num domingo,
 * o sábado 6 dias à frente (não "daqui a uma semana").
 *
 * Exportada (feature 083) porque os atalhos de prazo são a **inversa** de `bucketForDueDate`: o
 * botão "Esta semana" tem de resolver exatamente para a fronteira que monta a caixa "Esta semana"
 * da lista. Duas definições de "fim da semana" em arquivos diferentes é como essa coerência se
 * perde na próxima sessão.
 */
export function endOfWeekIso(todayIso: string): string {
  const today = localDateFromIso(todayIso);
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay()));
  return formatLocalIsoDate(end);
}

/** Último dia do mês corrente (dia 0 do mês seguinte). No último dia do mês devolve o próprio dia. */
export function endOfMonthIso(todayIso: string): string {
  const today = localDateFromIso(todayIso);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return formatLocalIsoDate(end);
}

/**
 * Os três atalhos de prazo do formulário de tarefa (feature 083), na ordem em que aparecem.
 * São um subconjunto de `AgendaBucket` de propósito: cada botão significa literalmente "põe a
 * tarefa nesta caixa da lista", e o rótulo sai de `AGENDA_BUCKET_LABELS` — sem semântica nova.
 */
export const DUE_DATE_SHORTCUTS = [
  "today",
  "this_week",
  "this_month",
] as const satisfies readonly AgendaBucket[];

export type DueDateShortcut = (typeof DUE_DATE_SHORTCUTS)[number];

/**
 * Classifica uma tarefa em um dos buckets de urgência da Agenda, a partir do `due_date`.
 * Ignora `status` (uma tarefa concluída com prazo no passado continua no bucket do prazo dela —
 * o card mostra "Concluída em" no lugar do prazo, o que já deixa claro que não está mais em aberto).
 */
export function bucketForDueDate(dueDate: string | null, todayIso: string): AgendaBucket {
  if (!dueDate) return "no_date";
  if (dueDate < todayIso) return "overdue";
  if (dueDate === todayIso) return "today";
  if (dueDate <= endOfWeekIso(todayIso)) return "this_week";
  if (dueDate <= endOfMonthIso(todayIso)) return "this_month";
  return "later";
}

/**
 * A **inversa** de `bucketForDueDate`: dado um atalho, devolve a data (ISO local) que põe a tarefa
 * na caixa que o botão nomeia. `today` → o próprio dia; `this_week` → sábado (`endOfWeekIso`);
 * `this_month` → último dia do mês (`endOfMonthIso`).
 *
 * Nunca devolve data no passado — as duas fronteiras são, por construção, `>= todayIso`, e quando
 * hoje **é** a fronteira (sábado, ou último dia do mês) o atalho colapsa em hoje de propósito, em
 * vez de pular para a semana/mês seguinte.
 */
export function dueDateForShortcut(shortcut: DueDateShortcut, todayIso: string): string {
  if (shortcut === "today") return todayIso;
  if (shortcut === "this_week") return endOfWeekIso(todayIso);
  return endOfMonthIso(todayIso);
}

export function groupTasksByAgendaBucket<T extends { due_date: string | null }>(
  tasks: T[],
  todayIso: string
): Record<AgendaBucket, T[]> {
  const groups = AGENDA_BUCKET_ORDER.reduce(
    (acc, bucket) => {
      acc[bucket] = [];
      return acc;
    },
    {} as Record<AgendaBucket, T[]>
  );
  for (const task of tasks) {
    groups[bucketForDueDate(task.due_date, todayIso)].push(task);
  }
  return groups;
}

interface SeriesTask {
  id: string;
  due_date: string | null;
  status: string;
  recurrence_rule: unknown;
  recurrence_origin_id: string | null;
  linked_recurring_id: string | null;
  /** Preenchido nas doses de medicação e, depois do backfill 049→064, também na tarefa-origem. */
  medication_id?: string | null;
}

function seriesKey(task: SeriesTask): string | null {
  if (task.linked_recurring_id) return `linked:${task.linked_recurring_id}`;
  if (task.recurrence_origin_id) return `simple:${task.recurrence_origin_id}`;
  if (task.recurrence_rule) return `simple:${task.id}`;
  return null;
}

function compareByDueDateAsc(a: { due_date: string | null }, b: { due_date: string | null }) {
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return a.due_date.localeCompare(b.due_date);
}

/**
 * Reduz cada série recorrente (recorrência simples ou vinculada a uma Recorrência Financeira)
 * à sua próxima ocorrência em aberto (menor `due_date` com `status !== "done"`). Séries sem
 * nenhuma ocorrência em aberto somem da lista. Tarefas não recorrentes passam direto.
 */
export function collapseRecurringSeries<T extends SeriesTask>(tasks: T[]): T[] {
  const singles: T[] = [];
  const series = new Map<string, T[]>();

  for (const task of tasks) {
    const key = seriesKey(task);
    if (!key) {
      singles.push(task);
      continue;
    }
    const list = series.get(key);
    if (list) list.push(task);
    else series.set(key, [task]);
  }

  const representatives: T[] = [];
  for (const group of series.values()) {
    const open = group.filter((t) => t.status !== "done");
    if (open.length === 0) continue;
    open.sort(compareByDueDateAsc);
    representatives.push(open[0]);
  }

  return [...singles, ...representatives];
}

export type TaskStatusView = "pending" | "done" | "all";

/** Filtro do topo das telas de tarefas: Pendentes (padrão) / Concluídas / Todas. */
export function filterTasksByStatusView<T extends { status: string }>(
  tasks: T[],
  view: TaskStatusView
): T[] {
  if (view === "pending") return tasks.filter((t) => t.status !== "done");
  if (view === "done") return tasks.filter((t) => t.status === "done");
  return tasks;
}

/** Ordena concluídas por `completed_at` desc (mais recente primeiro); sem data vai pro fim. */
export function sortTasksByCompletedAtDesc<T extends { completed_at?: string | null }>(
  tasks: T[]
): T[] {
  return [...tasks].sort((a, b) => {
    if (!a.completed_at && !b.completed_at) return 0;
    if (!a.completed_at) return 1;
    if (!b.completed_at) return -1;
    return b.completed_at.localeCompare(a.completed_at);
  });
}

export function isRecurringTask(task: SeriesTask): boolean {
  return !!(task.recurrence_rule || task.recurrence_origin_id || task.linked_recurring_id);
}

/**
 * `true` só para recorrência simples (`recurrence_rule`/`recurrence_origin_id`), nunca para
 * tarefas vinculadas a uma Recorrência Financeira (`linked_recurring_id`) — essas têm sync
 * bidirecional próprio (`syncLinkedInstallmentFromTask`) e exclusão em massa é fora do escopo
 * da feature 028 (ver Decisões em `docs/features/done/028-excluir-recorrencia-de-tarefa.md`).
 *
 * Também nunca para uma linha com `medication_id` (feature 075). O backfill 049→064
 * (`20260816233000_medication_backfill.sql`) **preserva** a `recurrence_rule` da tarefa-origem da
 * medicação, então ela é, ao mesmo tempo, origem de série e dose — e o "excluir todas as
 * ocorrências" da 028 apagaria o conjunto errado (só o que tem `recurrence_origin_id`, deixando
 * para trás todas as doses criadas por `materializeMedicationDoses`, que nascem com
 * `recurrence_origin_id: null`). Quem manda numa linha de medicação é `isMedicationDoseTask`.
 */
export function isSimpleRecurringTask(task: SeriesTask): boolean {
  return (
    !!(task.recurrence_rule || task.recurrence_origin_id) &&
    !task.linked_recurring_id &&
    !task.medication_id
  );
}

/**
 * `true` para qualquer linha de `task` que pertença a um tratamento (feature 075): as doses
 * materializadas por `materializeMedicationDoses` e também a tarefa-origem backfillada, que carrega
 * `medication_id` além da `recurrence_rule`.
 *
 * É o que seleciona a variante "dose de medicação" do `TaskDeleteDialog` — a única que oferece
 * encerrar o tratamento. Sem encerrar, qualquer exclusão volta na próxima `fetchTasks`, porque
 * `materializeAllMedicationDoses` recalcula as doses desde `started_on` enquanto o tratamento
 * estiver `active`.
 */
export function isMedicationDoseTask(task: SeriesTask): boolean {
  return !!task.medication_id;
}

/** Todas as ocorrências (passadas e futuras) da mesma série de `representative`, ordenadas por prazo. */
export function findSeriesTasks<T extends SeriesTask>(allTasks: T[], representative: T): T[] {
  const key = seriesKey(representative);
  if (!key) return [representative];
  return allTasks.filter((t) => seriesKey(t) === key).sort(compareByDueDateAsc);
}
