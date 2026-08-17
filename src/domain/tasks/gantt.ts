import { formatLocalIsoDate } from "@/lib/dates";
import { diffDaysIso, resolveTaskSchedule, type TaskScheduleInput } from "@/domain/tasks/duration";

export type GanttNodeType = "summary" | "task" | "milestone";

/** "by-task" (padrão histórico): árvore Projeto → Tarefa → Subtarefa toda expandida, uma barra
 * por tarefa. "by-project" (feature 037): projeto vira a unidade principal — nó `summary` colapsado
 * por padrão, com barra de rollup (`computeProjectRollup`) cobrindo do início mais cedo ao prazo
 * mais tarde das tarefas de topo, e indicador de progresso. Expandir o projeto continua mostrando
 * as tarefas, como em "by-task". */
export type GanttViewMode = "by-task" | "by-project";

export interface GanttTaskInput {
  id: string;
  title: string;
  status: "todo" | "doing" | "done";
  parent_task_id: string | null;
  project_id: string | null;
  start_date?: string | null;
  due_date: string | null;
  estimated_duration?: number | null;
  /** Ícone customizado (feature 035) — repassado ao nó pra `GanttTaskNameCell` renderizar via
   * `TaskIconBadge`, mesmo componente central usado nas outras visualizações. */
  icon_key?: string | null;
  icon_url?: string | null;
  /** Marca a tarefa como um marco (feature 037) — vira um nó `type: "milestone"` sem duração
   * (`start === end`, na data de prazo), em vez do intervalo normal com barra. */
  is_milestone?: boolean;
}

export interface GanttProjectInput {
  id: string;
  name: string;
}

export interface GanttDependencyInput {
  task_id: string;
  depends_on_task_id: string;
}

export interface GanttLink {
  id: string;
  source: string;
  target: string;
  type: "e2s";
}

/** Prefixo usado no `id` dos nós de projeto (`buildGanttNodes`) — some componentes precisam
 * distinguir "linha de projeto" de "linha de tarefa" só pelo `id`, sem outro contexto. */
export const GANTT_PROJECT_NODE_PREFIX = "project:";

export interface GanttNode {
  id: string;
  text: string;
  start?: Date;
  end?: Date;
  type: GanttNodeType;
  parent: string | number;
  open: boolean;
  progress?: number;
  /** `false` quando `start`/`end` são uma data-âncora (hoje, 1 dia) inventada porque a tarefa não
   * tem `start_date`/`due_date` própria — permite estilizar essa barra como "ainda não definida,
   * arraste para definir" em vez de confundir com um prazo real. Ausente em nós de projeto
   * (`type: "summary"`), que não representam uma tarefa. */
  hasPlannedDate?: boolean;
  /** Ícone customizado da tarefa de origem (feature 035) — ausente em nós de projeto. */
  icon_key?: string | null;
  icon_url?: string | null;
}

function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

/**
 * Datas efetivas de cada tarefa (real, derivada de `estimated_duration`, ou âncora de hoje quando
 * não há nenhuma data nem duração) vêm de `resolveTaskSchedule` — inclusive a "âncora de hoje até
 * amanhã" quando a tarefa não tem `start_date`/`due_date` própria nem duração: dá à lib uma barra
 * real pra desenhar/arrastar em vez de um nó sem `start`/`end`, cujo cálculo interno de posição
 * devolvia `Invalid Date` ao tentar arrastar (raiz do bug `"NaN-NaN-NaN"`).
 */
function taskNode(task: GanttTaskInput, parent: string | number, open: boolean): GanttNode {
  if (task.is_milestone) {
    // Marco: só a data de prazo importa, `estimated_duration` é ignorada de propósito (um marco
    // não tem duração por definição) — passar `estimated_duration: null` evita que
    // `resolveTaskSchedule` derive uma ponta a partir dela.
    const dueSchedule = resolveTaskSchedule({
      start_date: null,
      due_date: task.due_date,
      estimated_duration: null,
    });
    const due = isoToLocalDate(dueSchedule.due_date);
    return {
      id: task.id,
      text: task.title,
      start: due,
      end: due,
      type: "milestone",
      parent,
      open,
      progress: task.status === "done" ? 100 : 0,
      hasPlannedDate: dueSchedule.hasPlannedDate,
      icon_key: task.icon_key ?? null,
      icon_url: task.icon_url ?? null,
    };
  }
  const schedule = resolveTaskSchedule({
    start_date: task.start_date,
    due_date: task.due_date,
    estimated_duration: task.estimated_duration,
  });
  return {
    id: task.id,
    text: task.title,
    start: isoToLocalDate(schedule.start_date),
    end: isoToLocalDate(schedule.due_date),
    type: "task",
    parent,
    open,
    progress: task.status === "done" ? 100 : 0,
    hasPlannedDate: schedule.hasPlannedDate,
    icon_key: task.icon_key ?? null,
    icon_url: task.icon_url ?? null,
  };
}

export interface GanttProjectRollup {
  start: string;
  end: string;
  /** 0-100, arredondado — % de tarefas de topo (não subtarefas) com `status === "done"`. */
  progress: number;
}

/**
 * A partir das tarefas de topo de um projeto, calcula a barra de rollup pro modo "by-project":
 * `start` é a menor data de início efetiva (via `resolveTaskSchedule`, a mesma lógica que decide a
 * barra individual de cada tarefa) e `end` a maior data de prazo efetiva entre elas; `progress` é a
 * % dessas tarefas já concluídas. `null` quando `tasks` está vazia (projeto sem tarefa de topo —
 * `buildGanttNodes` já nem cria o nó de projeto nesse caso, mas a função fica pura/independente
 * disso pra ser testável sozinha).
 */
export function computeProjectRollup(tasks: GanttTaskInput[]): GanttProjectRollup | null {
  if (tasks.length === 0) return null;

  let start: string | null = null;
  let end: string | null = null;
  let doneCount = 0;

  for (const task of tasks) {
    const schedule = resolveTaskSchedule({
      start_date: task.start_date,
      due_date: task.due_date,
      estimated_duration: task.estimated_duration,
    });
    if (start === null || schedule.start_date < start) start = schedule.start_date;
    if (end === null || schedule.due_date > end) end = schedule.due_date;
    if (task.status === "done") doneCount += 1;
  }

  return {
    start: start as string,
    end: end as string,
    progress: Math.round((doneCount / tasks.length) * 100),
  };
}

/**
 * Converte tarefas (+ projetos, quando presentes) numa lista plana com hierarquia via `parent`
 * pro formato que `@svar-ui/react-gantt` espera: Projeto (summary) → Tarefa de topo → Subtarefa.
 * Toda tarefa (de topo ou subtarefa) aparece, mesmo sem `start_date`/`due_date`: quem não tem data
 * própria ganha uma data-âncora (`taskNode`/`todayAnchor`, `hasPlannedDate: false`) pra virar uma
 * barra de verdade, arrastável, em vez de ficar de fora do Gantt ou sem `start`/`end`. Um projeto
 * só aparece se tiver ao menos uma tarefa de topo (com ou sem data).
 */
export function buildGanttNodes(
  projects: GanttProjectInput[],
  tasks: GanttTaskInput[],
  mode: GanttViewMode = "by-task"
): { nodes: GanttNode[] } {
  const topLevel = tasks.filter((t) => !t.parent_task_id);

  const topLevelIds = new Set(topLevel.map((t) => t.id));
  const projectIdsWithTasks = new Set(
    topLevel.filter((t) => t.project_id).map((t) => t.project_id as string)
  );

  const childTasks = tasks.filter((t) => t.parent_task_id && topLevelIds.has(t.parent_task_id));
  // `open: true` num nó sem filhos crasha a lib (ela faz `node.data.forEach` ao
  // percorrir nós abertos, e `data` só existe em nós com pelo menos um filho).
  const parentIdsWithChildren = new Set(childTasks.map((t) => t.parent_task_id as string));

  const nodes: GanttNode[] = [];

  for (const project of projects) {
    if (!projectIdsWithTasks.has(project.id)) continue;
    const node: GanttNode = {
      id: `${GANTT_PROJECT_NODE_PREFIX}${project.id}`,
      text: project.name,
      type: "summary",
      parent: 0,
      // "by-project": colapsado por padrão, com barra de rollup — expandir mostra as tarefas.
      // "by-task": sempre expandido (garantido ter ao menos 1 tarefa de topo, ver filtro acima).
      open: mode === "by-task",
    };
    if (mode === "by-project") {
      const projectTopLevel = topLevel.filter((t) => t.project_id === project.id);
      const rollup = computeProjectRollup(projectTopLevel);
      if (rollup) {
        node.start = isoToLocalDate(rollup.start);
        node.end = isoToLocalDate(rollup.end);
        node.progress = rollup.progress;
      }
    }
    nodes.push(node);
  }

  for (const task of topLevel) {
    const parent = task.project_id ? `${GANTT_PROJECT_NODE_PREFIX}${task.project_id}` : 0;
    nodes.push(taskNode(task, parent, parentIdsWithChildren.has(task.id)));
  }

  for (const task of childTasks) {
    nodes.push(taskNode(task, task.parent_task_id as string, false));
  }

  return { nodes };
}

export interface GanttTaskDateUpdates {
  start_date?: string;
  due_date?: string;
}

function isValidGanttDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * A partir do `task` que `@svar-ui/react-gantt` devolve no evento `update-task` (depois de um
 * drag/resize), calcula o payload pra persistir via `updateTask`. Retorna `null` quando `start`
 * ou `end` vieram presentes mas não são um `Date` válido (`Invalid Date`) — a lib não impede
 * iniciar um drag/resize numa barra-âncora (`taskNode`/`todayAnchor`), e seu cálculo interno de
 * posição pode devolver um `Date` inválido; deixar isso virar string com `formatLocalIsoDate`
 * produzia literalmente `"NaN-NaN-NaN"`, que o Postgres rejeitava (bug original desta feature).
 */
export function resolveTaskDateUpdates(task: {
  start?: Date;
  end?: Date;
}): GanttTaskDateUpdates | null {
  const startProvided = task.start !== undefined;
  const endProvided = task.end !== undefined;
  if ((startProvided && !isValidGanttDate(task.start)) || (endProvided && !isValidGanttDate(task.end))) {
    return null;
  }
  const updates: GanttTaskDateUpdates = {};
  if (isValidGanttDate(task.start)) updates.start_date = formatLocalIsoDate(task.start);
  if (isValidGanttDate(task.end)) updates.due_date = formatLocalIsoDate(task.end);
  return updates;
}

export interface GanttTaskScheduleUpdate {
  start_date?: string;
  due_date?: string;
  estimated_duration?: number;
}

/**
 * A partir do payload já resolvido de `resolveTaskDateUpdates` (start/end novos vindos de um
 * drag/resize no Gantt) e da tarefa original (antes do drag), decide o payload final pra
 * persistir via `updateTask`. Distingue "mover" (as duas pontas deslocam pelo mesmo delta —
 * `estimated_duration` preservada) de "redimensionar" (só uma ponta mudou, ou as duas por deltas
 * diferentes — `estimated_duration` recalculada a partir do novo intervalo, pra não deixar o
 * valor salvo dessincronizado da barra exibida). Usa `resolveTaskSchedule` pra saber as datas
 * "efetivas" da tarefa original (inclusive quando uma ponta é derivada da duração ou é uma âncora
 * de hoje), não só as reais — assim redimensionar uma barra derivada de duração também recalcula
 * corretamente.
 */
export function resolveTaskScheduleUpdate(
  original: TaskScheduleInput,
  dateUpdates: GanttTaskDateUpdates
): GanttTaskScheduleUpdate {
  const updates: GanttTaskScheduleUpdate = { ...dateUpdates };
  if (!dateUpdates.start_date && !dateUpdates.due_date) return updates;

  const originalSchedule = resolveTaskSchedule(original);
  const newStart = dateUpdates.start_date ?? originalSchedule.start_date;
  const newDue = dateUpdates.due_date ?? originalSchedule.due_date;
  const startChanged = newStart !== originalSchedule.start_date;
  const dueChanged = newDue !== originalSchedule.due_date;
  const startDelta = diffDaysIso(originalSchedule.start_date, newStart);
  const dueDelta = diffDaysIso(originalSchedule.due_date, newDue);
  const isPureMove = startChanged && dueChanged && startDelta === dueDelta;

  if ((startChanged || dueChanged) && !isPureMove) {
    const durationDays = Math.max(1, diffDaysIso(newStart, newDue));
    updates.estimated_duration = durationDays * 24 * 60;
  }
  return updates;
}

/**
 * Converte `task_dependency` (X depende de Y → Y precisa terminar antes de X começar) pro formato
 * de link `end-to-start` que `@svar-ui/react-gantt` espera. Descarta pares onde algum dos dois
 * lados não é um nó visível no Gantt atual (ex.: subtarefa sem data, ou tarefa de outro projeto
 * numa visão escopada a um projeto só) — a lib não tem como desenhar uma linha pra um nó que não
 * existe na árvore.
 */
export function buildGanttLinks(
  dependencies: GanttDependencyInput[],
  nodes: GanttNode[]
): GanttLink[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  return dependencies
    .filter((d) => nodeIds.has(d.task_id) && nodeIds.has(d.depends_on_task_id))
    .map((d) => ({
      id: `${d.depends_on_task_id}->${d.task_id}`,
      source: d.depends_on_task_id,
      target: d.task_id,
      type: "e2s" as const,
    }));
}

/** Recorte mínimo de `IApi` (`@svar-ui/react-gantt`) que `jumpToGanttZoomLevel` precisa —
 * permite testar a função com um mock simples em vez da lib inteira. */
export interface GanttZoomApi {
  getState: () => { zoom?: { level?: number } };
  exec: (action: "zoom-scale", data: { dir: number }) => Promise<unknown>;
}

/**
 * Pula direto pro nível de zoom `targetLevel` (índice em `zoom.levels`, feature 037: presets
 * dia/semana/mês/trimestre). A API pública da lib não tem um "set nível X" direto — só a ação
 * relativa `zoom-scale`, `{ dir }` (ver `changeScale`/`zoom-scale` em
 * `@svar-ui/gantt-store/dist/index.js`: internamente calcula `novoNível = zoom.level + dir`, então
 * um único `dir` grande já pode saltar vários níveis de uma vez — mas só troca de nível de fato
 * quando a largura de célula recalculada sai da faixa `min/maxCellWidth` do nível atual; pra um
 * `dir` pequeno isso pode não acontecer numa única chamada). Por isso o loop: recalcula `dir` a
 * cada volta a partir do nível real (`getState().zoom.level`, nunca assume que a chamada anterior
 * funcionou) e para assim que convergir; `maxAttempts` é só uma rede de segurança contra loop
 * infinito caso a lib nunca cruze a faixa pra esse delta (não deveria acontecer na prática — a
 * largura de célula usada no cálculo interno cresce a cada chamada, então eventualmente cruza).
 */
export async function jumpToGanttZoomLevel(
  api: GanttZoomApi,
  targetLevel: number,
  maxAttempts = 10
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const current = api.getState().zoom?.level ?? 0;
    if (current === targetLevel) return;
    await api.exec("zoom-scale", { dir: targetLevel - current });
  }
}
