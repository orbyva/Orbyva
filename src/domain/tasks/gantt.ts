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

function taskNode(task: GanttTaskInput, parent: string | number): GanttNode {
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
    open: true,
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

  const nodes: GanttNode[] = [];

  for (const project of projects) {
    if (!projectIdsWithDatedTasks.has(project.id)) continue;
    nodes.push({
      id: `project:${project.id}`,
      text: project.name,
      type: "summary",
      parent: 0,
      open: true,
    });
  }

  for (const task of datedTopLevel) {
    const parent = task.project_id ? `project:${task.project_id}` : 0;
    nodes.push(taskNode(task, parent));
  }

  for (const task of tasks) {
    if (!task.parent_task_id) continue;
    if (!datedTopLevelIds.has(task.parent_task_id)) continue;
    nodes.push(taskNode(task, task.parent_task_id));
  }

  return { nodes, untimedCount };
}
