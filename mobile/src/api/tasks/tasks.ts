import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import { computeMissingOccurrences } from "@/domain/tasks/recurrence";
import { todayIsoDate } from "@/domain/tasks/listView";
import type { RecurrenceRule, Task, TaskPriority, TaskStatus } from "@/types/tasks";

const TASK_SELECT =
  "id, title, description, status, due_date, due_time, completed_at, parent_task_id, project_id, priority, recurrence_rule, recurrence_origin_id, linked_recurring_id, tag_ids, medication_id, is_quick, is_medication, is_consultation, icon_key, icon_url";

export type TaskWriteInput = {
  title: string;
  due_date: string | null;
  due_time?: string | null;
  description?: string;
  project_id?: string | null;
  priority?: TaskPriority | null;
  recurrence_rule?: RecurrenceRule | null;
  parent_task_id?: string | null;
  status?: TaskStatus;
  tag_ids?: string[];
};

async function materializeRecurringInstances(
  userId: string,
  tasks: Task[]
): Promise<Task[]> {
  const origins = tasks.filter(
    (task) =>
      task.recurrence_rule &&
      !task.recurrence_origin_id &&
      task.due_date &&
      !task.medication_id
  );
  if (origins.length === 0) return tasks;

  const today = todayIsoDate();
  const newRows: Array<Record<string, unknown>> = [];

  for (const origin of origins) {
    const existingDates = tasks
      .filter((task) => task.recurrence_origin_id === origin.id && task.due_date)
      .map((task) => task.due_date as string);

    const missing = computeMissingOccurrences(
      origin.due_date as string,
      origin.recurrence_rule!,
      existingDates,
      today
    );

    for (const date of missing) {
      newRows.push({
        user_id: userId,
        project_id: origin.project_id,
        parent_task_id: null,
        title: origin.title,
        description: origin.description ?? null,
        status: "todo",
        tag_ids: origin.tag_ids ?? [],
        due_date: date,
        due_time: origin.recurrence_rule?.time ?? origin.due_time ?? null,
        recurrence_rule: null,
        recurrence_origin_id: origin.id,
        is_medication: origin.is_medication ?? false,
        is_consultation: origin.is_consultation ?? false,
        is_quick: origin.is_quick ?? false,
        icon_key: origin.icon_key ?? null,
        icon_url: origin.icon_url ?? null,
        priority: origin.priority ?? null,
      });
    }
  }

  if (newRows.length === 0) return tasks;

  const { data, error } = await supabase
    .from("task")
    .upsert(newRows, { ignoreDuplicates: true })
    .select(TASK_SELECT);
  if (error) throw new Error(error.message);
  return [...tasks, ...((data ?? []) as Task[])];
}

export async function fetchTasks(): Promise<Task[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task")
    .select(TASK_SELECT)
    .eq("user_id", userId)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return materializeRecurringInstances(userId, (data ?? []) as Task[]);
}

export async function fetchTaskById(id: string): Promise<Task | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task")
    .select(TASK_SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Task | null) ?? null;
}

export async function createTaskApi(input: TaskWriteInput): Promise<Task> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task")
    .insert([
      {
        user_id: userId,
        project_id: input.project_id ?? null,
        parent_task_id: input.parent_task_id ?? null,
        title: input.title,
        description: input.description ?? "",
        status: input.status ?? "todo",
        tag_ids: input.tag_ids ?? [],
        due_date: input.due_date,
        due_time: input.due_time ?? null,
        start_date: null,
        priority: input.priority ?? null,
        recurrence_rule: input.recurrence_rule ?? null,
        linked_recurring_id: null,
        icon_key: null,
        icon_url: null,
        is_milestone: false,
        is_quick: false,
        is_medication: false,
        is_consultation: false,
        sort_order: 0,
      },
    ])
    .select(TASK_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as Task;
}

export async function updateTaskApi(
  input: TaskWriteInput & { id: string }
): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("task")
    .update({
      title: input.title,
      due_date: input.due_date,
      due_time: input.due_time ?? null,
      description: input.description ?? "",
      ...(input.project_id !== undefined ? { project_id: input.project_id } : {}),
      priority: input.priority ?? null,
      ...(input.status ? { status: input.status } : {}),
      ...(input.tag_ids ? { tag_ids: input.tag_ids } : {}),
      ...(input.recurrence_rule !== undefined
        ? { recurrence_rule: input.recurrence_rule }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function completeTaskApi(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("task")
    .update({
      status: "done",
      completed_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function reopenTaskApi(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("task")
    .update({
      status: "todo",
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteTaskApi(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("task")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function fetchSubtasksApi(parentId: string): Promise<Task[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task")
    .select(TASK_SELECT)
    .eq("user_id", userId)
    .eq("parent_task_id", parentId)
    .order("title", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
}

export async function setTaskStatusApi(
  id: string,
  status: TaskStatus
): Promise<void> {
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("task")
    .update({
      status,
      completed_at: status === "done" ? now : null,
      updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteTaskSeriesApi(originId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("task")
    .delete()
    .eq("user_id", userId)
    .or(`id.eq.${originId},recurrence_origin_id.eq.${originId}`);
  if (error) throw new Error(error.message);
}
