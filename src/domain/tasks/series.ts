import { taskSeriesKey, type SeriesTask } from "./agenda";
import type { Task } from "@/types/tasks";

/**
 * Feature 101 — a agregação "uma linha por **série**" que a página `/tasks/recurrences`
 * ("Tarefas recorrentes") exibe.
 *
 * A diferença essencial em relação a `collapseRecurringSeries` (`agenda.ts`) — e a razão de ser
 * uma função nova em vez de um parâmetro nela — é que **aqui a série encerrada não é descartada**.
 * Na Lista, uma série sem ocorrência em aberto some da tela inteira, o que é certo para "o que eu
 * tenho para fazer"; na tela de recorrências, "acabou" é informação (`active: false`), não motivo
 * para sumir. Uma recorrência com `count`/`until` esgotados é literalmente invisível no app hoje.
 */

/** Qual dos três tipos de série a linha representa — governa o `Badge` e as ações disponíveis. */
export type TaskSeriesKind =
  /** Recorrência simples: `recurrence_rule` na origem, `recurrence_origin_id` nas ocorrências. */
  | "simple"
  /** Vinculada a uma Recorrência Financeira (`linked_recurring_id`). */
  | "linked"
  /** Tratamento (feature 064): doses materializadas por `materializeMedicationDoses`. */
  | "medication";

/**
 * Uma série recorrente inteira, reduzida ao que a linha da tela precisa mostrar.
 *
 * "Consulta médica recorrente" (feature 061) **não** é um `kind` próprio de propósito: ela é um
 * recorte de exibição (`is_consultation`) sobre uma série `simple`, do mesmo jeito que medicação é
 * um recorte sobre `simple`/`linked` — a diferença é que medicação precisa de chave de agrupamento
 * própria (ver `taskSeriesGroupKey`), e consulta não.
 */
export interface TaskSeriesSummary {
  /** A chave de agrupamento (`taskSeriesGroupKey`) — estável, serve de `key` de React. */
  key: string;
  kind: TaskSeriesKind;
  /**
   * A tarefa que **define** a série: a que carrega a `recurrence_rule` (e o vínculo financeiro, e
   * o `medication_id` da origem backfillada). É nela que "Editar repetição" grava, e é dela que
   * saem título, ícone e projeto da linha.
   */
  origin: Task;
  /** Todas as ocorrências reais da série, prazo ascendente. Nunca vazio. */
  tasks: Task[];
  /** `tasks.length` — a contagem de linhas **reais** no banco, sem ocorrência virtual. */
  occurrenceCount: number;
  /** Quantas dessas já estão `done`. */
  doneCount: number;
  /** Próxima ocorrência em aberto (menor `due_date` com `status !== "done"`), ou `null`. */
  nextOpen: Task | null;
  /** Ocorrência de maior `due_date` — o "até onde essa recorrência chegou". */
  lastOccurrence: Task | null;
  /** `true` enquanto houver ocorrência em aberto. `false` = série encerrada. */
  active: boolean;
}

/**
 * A chave de agrupamento desta tela: `medication:<id>` **antes** de delegar a `taskSeriesKey`,
 * `null` para tarefa que não pertence a série nenhuma.
 *
 * **A ordem dos testes é o ponto todo.** O backfill 049→064
 * (`20260816233000_medication_backfill.sql`) *preserva* a `recurrence_rule` na tarefa-origem do
 * tratamento — ou seja, a origem tem regra **e** `medication_id` —, enquanto as doses geradas por
 * `materializeMedicationDoses` nascem com `recurrence_rule` e `recurrence_origin_id` **nulos**
 * (elas se identificam só por `medication_id`). Delegando primeiro a `taskSeriesKey`, a origem
 * cairia em `simple:<id>` e cada dose em `null`: o mesmo tratamento apareceria como uma série de
 * uma linha só mais um monte de tarefa avulsa. É a mesma armadilha que a feature 074 documentou em
 * `computeVirtualOccurrences` e que a 075 documentou em `isSimpleRecurringTask`.
 */
export function taskSeriesGroupKey(task: SeriesTask): string | null {
  if (task.medication_id) return `medication:${task.medication_id}`;
  return taskSeriesKey(task);
}

/** Prazo ascendente, com "sem prazo" no fim — o mesmo comparador de `agenda.ts`. */
function compareByDueDateAsc(a: Task, b: Task): number {
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return a.due_date.localeCompare(b.due_date);
}

function kindFor(key: string): TaskSeriesKind {
  if (key.startsWith("medication:")) return "medication";
  if (key.startsWith("linked:")) return "linked";
  return "simple";
}

/**
 * A tarefa que **define** a série. Preferência pela linha que carrega a `recurrence_rule` — é ela
 * que "Editar repetição" grava e de quem sai o resumo da regra. Sem nenhuma (uma série de doses
 * cuja origem foi apagada, ou uma série financeira, onde a regra mora na Recorrência e não na
 * tarefa), cai na ocorrência de menor `due_date`: a primeira da linha do tempo.
 */
function pickOrigin(group: Task[]): Task {
  const withRule = group.filter((t) => t.recurrence_rule);
  if (withRule.length > 0) return [...withRule].sort(compareByDueDateAsc)[0];
  return group[0];
}

/**
 * Reduz uma lista de tarefas a **uma linha por série recorrente**, para a página "Tarefas
 * recorrentes" (feature 101). Tarefas sem série (`taskSeriesGroupKey` → `null`) ficam de fora: a
 * tela é sobre o que se repete.
 *
 * Diverge de `collapseRecurringSeries` de propósito em dois pontos:
 * 1. **série encerrada continua na saída**, com `active: false` — "acabou" é informação aqui;
 * 2. agrupa **medicação** pelo tratamento (`taskSeriesGroupKey`), não pela regra.
 *
 * Ordem: ativas primeiro, por `nextOpen.due_date` ascendente ("o que me espera"); depois as
 * encerradas, por `lastOccurrence.due_date` descendente ("o que já foi", mais recente antes).
 * Não muta a entrada — nem o array, nem as tarefas.
 */
export function groupTaskSeries(tasks: Task[]): TaskSeriesSummary[] {
  const groups = new Map<string, Task[]>();

  for (const task of tasks) {
    const key = taskSeriesGroupKey(task);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(task);
    else groups.set(key, [task]);
  }

  const summaries: TaskSeriesSummary[] = [];
  for (const [key, group] of groups) {
    const ordered = [...group].sort(compareByDueDateAsc);
    // `ordered` já está por prazo asc, então a primeira em aberto **é** a próxima em aberto, e a
    // última com prazo é a de maior `due_date` (as sem prazo foram para o fim pelo comparador).
    const nextOpen = ordered.find((t) => t.status !== "done") ?? null;
    const withDate = ordered.filter((t) => t.due_date);
    const lastOccurrence =
      withDate.length > 0 ? withDate[withDate.length - 1] : (ordered[ordered.length - 1] ?? null);

    summaries.push({
      key,
      kind: kindFor(key),
      origin: pickOrigin(ordered),
      tasks: ordered,
      occurrenceCount: ordered.length,
      doneCount: ordered.filter((t) => t.status === "done").length,
      nextOpen,
      lastOccurrence,
      active: nextOpen !== null,
    });
  }

  return summaries.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.active) return compareByDueDateAsc(a.nextOpen as Task, b.nextOpen as Task);
    // Encerradas: mais recente primeiro. Sem prazo vai para o fim nos dois lados.
    const aDate = a.lastOccurrence?.due_date ?? null;
    const bDate = b.lastOccurrence?.due_date ?? null;
    if (!aDate && !bDate) return 0;
    if (!aDate) return 1;
    if (!bDate) return -1;
    return bDate.localeCompare(aDate);
  });
}
