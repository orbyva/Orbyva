import { addDaysToIso, diffDaysIso, resolveTaskSchedule } from "@/domain/tasks/duration";
import { sortSubtasks } from "@/domain/tasks/subtasks";
import type { Task, TaskDependency } from "@/types/tasks";

export type GanttRowKind = "task" | "milestone";

/** Mesmo recorte do web: tira a tarefa-modelo de recorrência financeira (sem parcela). */
export function ganttTasks<T extends Pick<Task, "linked_recurring_id" | "linked_installment_number">>(
  tasks: T[]
): T[] {
  return tasks.filter((task) => !(task.linked_recurring_id && task.linked_installment_number == null));
}

export interface GanttRow {
  id: string;
  title: string;
  depth: 0 | 1;
  kind: GanttRowKind;
  start: string;
  end: string;
  hasPlannedDate: boolean;
  done: boolean;
}

/**
 * Linhas do Gantt: tarefas de topo por início efetivo (empate → título) e, logo abaixo de cada uma,
 * suas subtarefas na ordem de `sortSubtasks`. Tarefa sem data ganha a âncora de hoje
 * (`hasPlannedDate: false`), como no web. Marco ignora a duração e fica na data do prazo.
 */
export function buildGanttRows(tasks: Task[], todayIso: string): GanttRow[] {
  const toRow = (task: Task, depth: 0 | 1): GanttRow => {
    const milestone = !!task.is_milestone;
    const schedule = resolveTaskSchedule(
      milestone
        ? { start_date: null, due_date: task.due_date, estimated_duration: null }
        : {
            start_date: task.start_date,
            due_date: task.due_date,
            estimated_duration: task.estimated_duration,
          },
      todayIso
    );
    return {
      id: task.id,
      title: task.title,
      depth,
      kind: milestone ? "milestone" : "task",
      start: milestone ? schedule.due_date : schedule.start_date,
      end: schedule.due_date,
      hasPlannedDate: schedule.hasPlannedDate,
      done: task.status === "done",
    };
  };

  const topLevel = tasks.filter((task) => !task.parent_task_id);
  const topIds = new Set(topLevel.map((task) => task.id));
  const childrenByParent = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.parent_task_id && topIds.has(task.parent_task_id)) {
      const list = childrenByParent.get(task.parent_task_id) ?? [];
      list.push(task);
      childrenByParent.set(task.parent_task_id, list);
    }
  }

  const topRows = topLevel
    .map((task) => ({ task, row: toRow(task, 0) }))
    .sort((a, b) => a.row.start.localeCompare(b.row.start) || a.row.title.localeCompare(b.row.title));

  const rows: GanttRow[] = [];
  for (const { task, row } of topRows) {
    rows.push(row);
    for (const child of sortSubtasks(childrenByParent.get(task.id) ?? [])) {
      rows.push(toRow(child, 1));
    }
  }
  return rows;
}

export interface GanttLayoutOptions {
  todayIso: string;
  dayWidth: number;
  rowHeight: number;
  /** Dias de folga antes do primeiro início e depois do último fim. */
  padDays?: number;
}

export interface GanttBar {
  id: string;
  kind: GanttRowKind;
  x: number;
  y: number;
  width: number;
  hasPlannedDate: boolean;
  done: boolean;
}

export interface GanttLinkPath {
  id: string;
  from: string;
  to: string;
  /** Polilinha em cotovelo: saída à direita da barra-fonte, entrada à esquerda da barra-alvo. */
  points: { x: number; y: number }[];
}

export interface GanttLayout {
  startIso: string;
  days: string[];
  width: number;
  height: number;
  todayX: number | null;
  bars: GanttBar[];
  links: GanttLinkPath[];
}

const LINK_STUB = 8;

/**
 * Posições em pixels de tudo que o Gantt desenha. A faixa de datas cobre todas as barras e o dia
 * de hoje, com `padDays` de folga. Barra ocupa do dia de início ao dia de fim **inclusive**; marco
 * é um ponto no centro do dia do prazo (`width` 0). Dependência só vira seta quando as duas pontas
 * estão visíveis.
 */
export function layoutGantt(
  rows: GanttRow[],
  dependencies: TaskDependency[],
  { todayIso, dayWidth, rowHeight, padDays = 2 }: GanttLayoutOptions
): GanttLayout {
  let minIso = todayIso;
  let maxIso = todayIso;
  for (const row of rows) {
    if (row.start < minIso) minIso = row.start;
    if (row.end > maxIso) maxIso = row.end;
  }
  const startIso = addDaysToIso(minIso, -padDays);
  const endIso = addDaysToIso(maxIso, padDays);
  const dayCount = diffDaysIso(startIso, endIso) + 1;
  const days = Array.from({ length: dayCount }, (_, i) => addDaysToIso(startIso, i));

  const bars: GanttBar[] = rows.map((row, index) => {
    const startOffset = diffDaysIso(startIso, row.start);
    const y = index * rowHeight;
    if (row.kind === "milestone") {
      return {
        id: row.id,
        kind: row.kind,
        x: startOffset * dayWidth + dayWidth / 2,
        y,
        width: 0,
        hasPlannedDate: row.hasPlannedDate,
        done: row.done,
      };
    }
    const spanDays = Math.max(1, diffDaysIso(row.start, row.end) + 1);
    return {
      id: row.id,
      kind: row.kind,
      x: startOffset * dayWidth,
      y,
      width: spanDays * dayWidth,
      hasPlannedDate: row.hasPlannedDate,
      done: row.done,
    };
  });

  const barById = new Map(bars.map((bar) => [bar.id, bar]));
  const links: GanttLinkPath[] = [];
  for (const dep of dependencies) {
    const source = barById.get(dep.depends_on_task_id);
    const target = barById.get(dep.task_id);
    if (!source || !target) continue;
    const sy = source.y + rowHeight / 2;
    const ty = target.y + rowHeight / 2;
    const sx = source.x + source.width;
    const tx = target.x;
    const midX = sx + LINK_STUB;
    links.push({
      id: `${dep.depends_on_task_id}->${dep.task_id}`,
      from: dep.depends_on_task_id,
      to: dep.task_id,
      points: [
        { x: sx, y: sy },
        { x: midX, y: sy },
        { x: midX, y: ty },
        { x: tx, y: ty },
      ],
    });
  }

  const todayOffset = diffDaysIso(startIso, todayIso);
  return {
    startIso,
    days,
    width: dayCount * dayWidth,
    height: rows.length * rowHeight,
    todayX: todayOffset >= 0 && todayOffset < dayCount ? todayOffset * dayWidth + dayWidth / 2 : null,
    bars,
    links,
  };
}

/** `true` se `taskId` passar a depender de `dependsOnId` e isso fechar um ciclo. */
export function wouldCreateCycle(
  dependencies: TaskDependency[],
  taskId: string,
  dependsOnId: string
): boolean {
  if (taskId === dependsOnId) return true;
  const prereqs = new Map<string, string[]>();
  for (const dep of dependencies) {
    const list = prereqs.get(dep.task_id) ?? [];
    list.push(dep.depends_on_task_id);
    prereqs.set(dep.task_id, list);
  }
  const stack = [dependsOnId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === taskId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(prereqs.get(current) ?? []));
  }
  return false;
}

/** Tarefas que `taskId` pode passar a depender: nem ela mesma, nem já ligadas, nem as que fechariam ciclo. */
export function dependencyCandidates(
  tasks: Pick<Task, "id" | "title">[],
  dependencies: TaskDependency[],
  taskId: string
): Pick<Task, "id" | "title">[] {
  const already = new Set(
    dependencies.filter((dep) => dep.task_id === taskId).map((dep) => dep.depends_on_task_id)
  );
  return tasks.filter(
    (task) =>
      task.id !== taskId && !already.has(task.id) && !wouldCreateCycle(dependencies, taskId, task.id)
  );
}
