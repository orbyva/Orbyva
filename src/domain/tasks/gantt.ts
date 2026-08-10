export type GanttNodeType = "summary" | "task";

export interface GanttTaskInput {
  id: string;
  title: string;
  status: "todo" | "doing" | "done";
  parent_task_id: string | null;
  project_id: string | null;
  start_date?: string | null;
  due_date: string | null;
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
}

function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

function taskNode(task: GanttTaskInput, parent: string | number, open: boolean): GanttNode {
  const hasDate = !!(task.start_date || task.due_date);
  return {
    id: task.id,
    text: task.title,
    ...(hasDate
      ? {
          start: isoToLocalDate(task.start_date ?? task.due_date!),
          end: isoToLocalDate(task.due_date ?? task.start_date!),
        }
      : {}),
    type: "task",
    parent,
    open,
    progress: task.status === "done" ? 100 : 0,
  };
}

/**
 * Converte tarefas (+ projetos, quando presentes) numa lista plana com hierarquia via `parent`
 * pro formato que `@svar-ui/react-gantt` espera: Projeto (summary) → Tarefa de topo → Subtarefa.
 * Uma tarefa de topo só aparece se tiver `start_date` ou `due_date`; um projeto só aparece se
 * tiver ao menos uma tarefa de topo com data. Subtarefas aparecem indentadas sob uma tarefa-pai
 * com data, mesmo sem data própria (sem barra, só a linha — mesmo comportamento da grade CSS
 * anterior). Retorna também `untimedCount` (tarefas de topo sem nenhuma data).
 */
export function buildGanttNodes(
  projects: GanttProjectInput[],
  tasks: GanttTaskInput[]
): { nodes: GanttNode[]; untimedCount: number } {
  const topLevel = tasks.filter((t) => !t.parent_task_id);
  const datedTopLevel = topLevel.filter((t) => t.start_date || t.due_date);
  const untimedCount = topLevel.length - datedTopLevel.length;

  const datedTopLevelIds = new Set(datedTopLevel.map((t) => t.id));
  const projectIdsWithDatedTasks = new Set(
    datedTopLevel.filter((t) => t.project_id).map((t) => t.project_id as string)
  );

  const childTasks = tasks.filter(
    (t) => t.parent_task_id && datedTopLevelIds.has(t.parent_task_id)
  );
  // `open: true` num nó sem filhos crasha a lib (ela faz `node.data.forEach` ao
  // percorrir nós abertos, e `data` só existe em nós com pelo menos um filho).
  const parentIdsWithChildren = new Set(childTasks.map((t) => t.parent_task_id as string));

  const nodes: GanttNode[] = [];

  for (const project of projects) {
    if (!projectIdsWithDatedTasks.has(project.id)) continue;
    nodes.push({
      id: `${GANTT_PROJECT_NODE_PREFIX}${project.id}`,
      text: project.name,
      type: "summary",
      parent: 0,
      open: true, // garantido ter ao menos 1 tarefa de topo com data, ver filtro acima
    });
  }

  for (const task of datedTopLevel) {
    const parent = task.project_id ? `${GANTT_PROJECT_NODE_PREFIX}${task.project_id}` : 0;
    nodes.push(taskNode(task, parent, parentIdsWithChildren.has(task.id)));
  }

  for (const task of childTasks) {
    nodes.push(taskNode(task, task.parent_task_id as string, false));
  }

  return { nodes, untimedCount };
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
