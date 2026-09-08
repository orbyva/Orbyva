import type { TaskPriority } from "@/types/tasks";
import { bucketForDueDate, type TaskStatusView } from "./agenda";

export interface TaskFilter {
  projectId?: string | null;
  tagId?: string;
  dueBefore?: string;
  priority?: TaskPriority;
}

interface FilterableTask {
  project_id: string | null;
  tag_ids: string[];
  due_date: string | null;
  priority?: TaskPriority | null;
}

export function filterTasks<T extends FilterableTask>(
  tasks: T[],
  filter: TaskFilter
): T[] {
  return tasks.filter((task) => {
    if (filter.projectId !== undefined && task.project_id !== filter.projectId) {
      return false;
    }
    if (filter.tagId && !task.tag_ids.includes(filter.tagId)) return false;
    if (filter.dueBefore && (!task.due_date || task.due_date > filter.dueBefore)) {
      return false;
    }
    if (filter.priority && task.priority !== filter.priority) return false;
    return true;
  });
}

/** O recorte que a barra da aba Lista aplica **depois** de `filterTasks` — o `<Select>` de status,
 * os chips de prioridade e o chip "Hoje" (`TaskList.tsx`, bloco de controles da aba). */
export interface ListQuickFilters {
  priority: TaskPriority | null;
  todayOnly: boolean;
  statusView: TaskStatusView;
  todayIso: string;
}

/** O mínimo que dá pra perguntar sobre visibilidade — nem precisa existir no banco ainda. */
interface ListVisibleTask {
  status: string;
  priority?: TaskPriority | null;
  due_date: string | null;
}

/**
 * Uma tarefa passaria pelos filtros rápidos da aba Lista? Existe (feature 098) para o quick add
 * poder avisar **antes** de o usuário procurar: a tarefa nasce sem prazo e sem prioridade, então
 * com um chip de prioridade ou o "Hoje" ligado ela é criada e não aparece em lugar nenhum — sem
 * aviso, o clique parece não ter feito nada.
 *
 * Deliberadamente **não** considera projeto/tag: quem recorta por isso é `filterTasks`, e o quick
 * add já cria a tarefa dentro do projeto do filtro (feature 099).
 */
export function isTaskVisibleInList(
  task: ListVisibleTask,
  { priority, todayOnly, statusView, todayIso }: ListQuickFilters
): boolean {
  if (statusView === "pending" && task.status === "done") return false;
  if (statusView === "done" && task.status !== "done") return false;
  if (priority && task.priority !== priority) return false;
  if (todayOnly && bucketForDueDate(task.due_date, todayIso) !== "today") return false;
  return true;
}

export function sortTasksByDueDate<T extends { due_date: string | null }>(
  tasks: T[]
): T[] {
  return [...tasks].sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });
}

/** Campos que a ordenação por "última atualização" (feature 079) precisa ler. */
export interface UpdatedSortableTask {
  id: string;
  updated_at?: string | null;
  created_at?: string | null;
}

/** ms do timestamp, ou `null` quando ausente/ilegível (não dá pra confiar em `localeCompare` aqui:
 * `timestamptz` pode voltar com sufixo `Z` ou `+00:00` para o mesmo instante). */
function timestampValue(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** Mais recente primeiro, com desempate determinístico (`created_at` desc → `id`) — sem ele, duas
 * tarefas carimbadas no mesmo milissegundo (materialização em lote) trocam de lugar a cada render.
 * Tarefa sem `updated_at` cai para `created_at`; sem nenhum dos dois vai para o fim.
 * Não muta o array de entrada. */
export function sortTasksByUpdatedAtDesc<T extends UpdatedSortableTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const aUpdated = timestampValue(a.updated_at) ?? timestampValue(a.created_at);
    const bUpdated = timestampValue(b.updated_at) ?? timestampValue(b.created_at);
    if (aUpdated !== bUpdated) {
      if (aUpdated === null) return 1;
      if (bUpdated === null) return -1;
      return bUpdated - aUpdated;
    }
    const aCreated = timestampValue(a.created_at);
    const bCreated = timestampValue(b.created_at);
    if (aCreated !== bCreated) {
      if (aCreated === null) return 1;
      if (bCreated === null) return -1;
      return bCreated - aCreated;
    }
    return a.id.localeCompare(b.id);
  });
}

/** Campos que a ordenação por prioridade precisa ler. */
export interface PrioritySortableTask extends UpdatedSortableTask {
  priority?: TaskPriority | null;
}

/** Alta → Média → Baixa → sem prioridade: a mesma sequência das faixas do painel "Por prioridade"
 * (feature 082), pra listagem e painel não discordarem sobre o que vem primeiro. */
const PRIORITY_SORT_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
const NO_PRIORITY_SORT_RANK = 3;

function prioritySortRank(priority: TaskPriority | null | undefined): number {
  return priority ? PRIORITY_SORT_RANK[priority] : NO_PRIORITY_SORT_RANK;
}

/** Prioridade mais alta primeiro, sem prioridade por último. Dentro da mesma faixa vale o
 * desempate de "última atualização" — ordenar só pela faixa deixaria as tarefas de mesma
 * prioridade em ordem indefinida. Não muta o array de entrada. */
export function sortTasksByPriority<T extends PrioritySortableTask>(tasks: T[]): T[] {
  // `sortTasksByUpdatedAtDesc` já devolve cópia, e `Array.prototype.sort` é estável: o desempate
  // sobrevive à reordenação por faixa.
  return sortTasksByUpdatedAtDesc(tasks).sort(
    (a, b) => prioritySortRank(a.priority) - prioritySortRank(b.priority)
  );
}

/** Ordenações oferecidas pelo seletor "Ordenar por" da Lista/Kanban (feature 079). */
export type TaskSortKey = "updated" | "due" | "priority";

/** Padrão de fábrica: o pedido literal da feature 079 é "ordene por last_updated". */
export const DEFAULT_TASK_SORT_KEY: TaskSortKey = "updated";

/** Ordem em que as opções aparecem no seletor. */
export const TASK_SORT_KEYS = [
  "updated",
  "due",
  "priority",
] as const satisfies readonly TaskSortKey[];

export const TASK_SORT_LABELS: Record<TaskSortKey, string> = {
  updated: "Última atualização",
  due: "Prazo",
  priority: "Prioridade",
};

export function isTaskSortKey(value: unknown): value is TaskSortKey {
  return value === "updated" || value === "due" || value === "priority";
}

/** Campos que qualquer comparador do seletor precisa ler. */
export type SortableTask = PrioritySortableTask & { due_date: string | null };

/** Despacha para o comparador da chave escolhida. Não muta o array de entrada. */
export function sortTasksBy<T extends SortableTask>(key: TaskSortKey, tasks: T[]): T[] {
  if (key === "due") return sortTasksByDueDate(tasks);
  if (key === "priority") return sortTasksByPriority(tasks);
  return sortTasksByUpdatedAtDesc(tasks);
}

/**
 * Filtro de projeto compartilhado pelas quatro visões de Tarefas (feature 097). O valor é
 * `"all"` (sem recorte), `"null"` (só o que **não** tem projeto) ou o id de um projeto — o mesmo
 * vocabulário que o `<Select>` da barra e a `ProjectsRail` já falavam antes de a preferência passar
 * a ser salva.
 */
export const PROJECT_FILTER_ALL = "all";
export const PROJECT_FILTER_NONE = "null";

/** Forma mínima do valor: string não vazia. Não diz que o id existe — quem diz é
 * `normalizeProjectFilter`, que precisa da lista de projetos carregados. */
export function isProjectFilterValue(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * O valor que a tela pode de fato usar. `"all"`/`"null"` sempre passam (não dependem de projeto
 * nenhum); um id só passa se ainda estiver na lista carregada. Qualquer outra coisa — projeto
 * apagado, formato antigo, lixo gravado por outra versão — cai para `"all"`, em vez de deixar a
 * tela filtrada por um projeto que não existe mais e não aparece no `<Select>`.
 */
export function normalizeProjectFilter(
  value: unknown,
  projectIds: Iterable<string>
): string {
  if (!isProjectFilterValue(value)) return PROJECT_FILTER_ALL;
  if (value === PROJECT_FILTER_ALL || value === PROJECT_FILTER_NONE) return value;
  for (const id of projectIds) {
    if (id === value) return value;
  }
  return PROJECT_FILTER_ALL;
}

/**
 * Semântica de **filtragem**: traduz o valor do filtro para o `projectId` que `filterTasks`
 * espera em `TaskFilter`.
 *
 * - `"all"` → `undefined`, que em `filterTasks` significa **não recortar por projeto**
 *   (`filter.projectId !== undefined` é o guard lá em cima);
 * - `"null"` → `null`, o recorte "só o que não tem projeto" (`task.project_id === null`);
 * - id de projeto → o próprio id.
 *
 * Existe (feature 099) porque essa conversão estava escrita à mão três vezes em `TaskList.tsx`
 * (`visibleTasks`, `ganttTasks`, `quadrantProjectTasks`) — e a quarta cópia, a da criação, tem
 * regra **diferente**: veja `projectIdForNewTask`.
 */
export function projectFilterToProjectId(value: unknown): string | null | undefined {
  if (!isProjectFilterValue(value) || value === PROJECT_FILTER_ALL) return undefined;
  if (value === PROJECT_FILTER_NONE) return null;
  return value;
}

/**
 * Semântica de **criação**: o `project_id` com que uma tarefa nova nasce quando o filtro está
 * ligado (feature 099) — "estou olhando o recorte de Casa, então a tarefa que eu criar aqui é de
 * Casa".
 *
 * - id de projeto → o próprio id;
 * - `"all"` → `null`. **É aqui que ela diverge de `projectFilterToProjectId`**, que devolveria
 *   `undefined`: "todos os projetos" não é um projeto, e escolher um default (o primeiro da lista,
 *   o mais ativo) seria escolher pelo usuário;
 * - `"null"` → `null`, que é literalmente o recorte escolhido;
 * - qualquer outra coisa (string vazia, `undefined`, lixo) → `null`, o mesmo que o formulário já
 *   fazia antes desta feature.
 */
export function projectIdForNewTask(value: unknown): string | null {
  if (!isProjectFilterValue(value)) return null;
  if (value === PROJECT_FILTER_ALL || value === PROJECT_FILTER_NONE) return null;
  return value;
}
