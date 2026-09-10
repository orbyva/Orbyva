import {
  AGENDA_BUCKET_LABELS,
  AGENDA_BUCKET_ORDER,
  groupTasksByAgendaBucket,
  type AgendaBucket,
} from "@/domain/tasks/agenda";
import type { Project, Task } from "@/types/tasks";
import { PROJECT_FILTER_ALL, PROJECT_FILTER_NONE } from "@/types/tasks";

export function todayIsoDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function localDateFromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function endOfWeekIso(todayIso: string): string {
  const today = localDateFromIso(todayIso);
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - today.getDay()));
  return todayIsoDate(end);
}

export function emptyAgendaGroups<T>(): Record<AgendaBucket, T[]> {
  return AGENDA_BUCKET_ORDER.reduce(
    (acc, bucket) => {
      acc[bucket] = [];
      return acc;
    },
    {} as Record<AgendaBucket, T[]>
  );
}

export const TASK_LIST_BUCKETS: { id: AgendaBucket; label: string }[] =
  AGENDA_BUCKET_ORDER.map((id) => ({
    id,
    label: AGENDA_BUCKET_LABELS[id],
  }));

export function bucketForTaskList(
  dueDate: string | null,
  todayIso: string
): AgendaBucket {
  if (!dueDate) return "no_date";
  if (dueDate < todayIso) return "overdue";
  if (dueDate === todayIso) return "today";
  return "later";
}

type SeriesTask = Pick<
  Task,
  | "id"
  | "status"
  | "due_date"
  | "recurrence_rule"
  | "recurrence_origin_id"
  | "linked_recurring_id"
>;

function seriesKey(task: SeriesTask): string | null {
  if (task.linked_recurring_id) return `linked:${task.linked_recurring_id}`;
  if (task.recurrence_origin_id) return `simple:${task.recurrence_origin_id}`;
  if (task.recurrence_rule) return `simple:${task.id}`;
  return null;
}

function compareByDueDateAsc(
  a: { due_date: string | null; due_time?: string | null; title?: string },
  b: { due_date: string | null; due_time?: string | null; title?: string }
) {
  if (!a.due_date && !b.due_date) {
    return (a.title ?? "").localeCompare(b.title ?? "");
  }
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  const byDate = a.due_date.localeCompare(b.due_date);
  if (byDate !== 0) return byDate;
  const byTime = (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99");
  if (byTime !== 0) return byTime;
  return (a.title ?? "").localeCompare(b.title ?? "");
}

/** Reduz cada série à próxima ocorrência em aberto — igual ao web. */
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

export function openTopLevelTasks(tasks: Task[]): Task[] {
  return collapseRecurringSeries(
    tasks.filter((task) => task.status !== "done" && !task.parent_task_id)
  );
}

export function groupTasksForList(
  tasks: Task[],
  todayIso: string
): Record<AgendaBucket, Task[]> {
  const groups = groupTasksByAgendaBucket(openTopLevelTasks(tasks), todayIso);
  for (const bucket of AGENDA_BUCKET_ORDER) {
    groups[bucket].sort(compareByDueDateAsc);
  }
  return groups;
}

export const TAG_FILTER_ALL = "all";

export function filterTasksByProject(
  tasks: Task[],
  projectFilter: string
): Task[] {
  if (projectFilter === PROJECT_FILTER_ALL) return tasks;
  if (projectFilter === PROJECT_FILTER_NONE) {
    return tasks.filter((task) => !task.project_id);
  }
  return tasks.filter((task) => task.project_id === projectFilter);
}

export function filterTasksByTag(tasks: Task[], tagId: string): Task[] {
  if (!tagId || tagId === TAG_FILTER_ALL) return tasks;
  return tasks.filter((task) => (task.tag_ids ?? []).includes(tagId));
}

export const PROJECT_STATUS_ORDER = [
  "planned",
  "active",
  "completed",
  "archived",
] as const;

export function groupProjectsByStatus(projects: Project[]) {
  return PROJECT_STATUS_ORDER.map((status) => ({
    id: status,
    items: projects.filter((project) => project.status === status),
  }));
}

export function openTasksForProject(tasks: Task[], projectId: string): Task[] {
  return openTopLevelTasks(tasks).filter((task) => task.project_id === projectId);
}

export function visibleProjects(projects: Project[]): Project[] {
  return projects.filter((project) => project.status !== "archived");
}

export function countOpenTaskBuckets(tasks: Task[], todayIso: string) {
  const grouped = groupTasksForList(tasks, todayIso);
  return {
    overdue: grouped.overdue.length,
    today: grouped.today.length,
    inbox:
      grouped.this_week.length +
      grouped.this_month.length +
      grouped.later.length +
      grouped.no_date.length,
  };
}

export function recentCompletedTasks(tasks: Task[], limit = 10): Task[] {
  return tasks
    .filter((task) => task.status === "done" && !task.parent_task_id)
    .sort((a, b) => {
      if (!a.completed_at && !b.completed_at) return 0;
      if (!a.completed_at) return 1;
      if (!b.completed_at) return -1;
      return b.completed_at.localeCompare(a.completed_at);
    })
    .slice(0, limit);
}

export function filterTasksByQuery(tasks: Task[], query: string): Task[] {
  const needle = query.trim().toLocaleLowerCase("pt-BR");
  if (!needle) return tasks;
  const matchedIds = new Set<string>();
  for (const task of tasks) {
    const hay = `${task.title} ${task.description ?? ""}`.toLocaleLowerCase("pt-BR");
    if (!hay.includes(needle)) continue;
    matchedIds.add(task.parent_task_id ?? task.id);
  }
  return tasks.filter(
    (task) => matchedIds.has(task.id) || (task.parent_task_id && matchedIds.has(task.parent_task_id))
  );
}

export function subtasksOf(tasks: Task[], parentId: string): Task[] {
  return tasks
    .filter((task) => task.parent_task_id === parentId)
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}

export function groupSubtasksByParentId(tasks: Task[]): Record<string, Task[]> {
  const map: Record<string, Task[]> = {};
  for (const task of tasks) {
    if (!task.parent_task_id) continue;
    const list = map[task.parent_task_id] ?? [];
    list.push(task);
    map[task.parent_task_id] = list;
  }
  for (const list of Object.values(map)) {
    list.sort((a, b) => {
      if (a.status === "done" && b.status !== "done") return 1;
      if (b.status === "done" && a.status !== "done") return -1;
      return a.title.localeCompare(b.title, "pt-BR");
    });
  }
  return map;
}

export function openSubtaskCount(tasks: Task[], parentId: string): number {
  return tasks.filter(
    (task) => task.parent_task_id === parentId && task.status !== "done"
  ).length;
}

