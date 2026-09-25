import { fetchRecurringById, updateRecurringParcelPayment } from "@/api/finance/recurring";
import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import { resolveItemStatusFromTask } from "@/domain/shopping/taskLink";
import { computeMissingOccurrences } from "@/domain/tasks/recurrence";
import { todayIsoDate } from "@/domain/tasks/listView";
import { sortSubtasks } from "@/domain/tasks/subtasks";
import type { RecurrenceRule, Task, TaskPriority, TaskStatus } from "@/types/tasks";

const TASK_SELECT =
  "id, title, description, status, due_date, due_time, estimated_duration, completed_at, parent_task_id, project_id, priority, recurrence_rule, recurrence_origin_id, linked_recurring_id, linked_shopping_item_id, linked_installment_number, tag_ids, medication_id, dose_time, is_quick, is_medication, is_consultation, icon_key, icon_url";

export type TaskWriteInput = {
  title: string;
  due_date: string | null;
  due_time?: string | null;
  estimated_duration?: number | null;
  is_quick?: boolean;
  description?: string;
  project_id?: string | null;
  priority?: TaskPriority | null;
  recurrence_rule?: RecurrenceRule | null;
  parent_task_id?: string | null;
  status?: TaskStatus;
  tag_ids?: string[];
  is_consultation?: boolean;
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

/** Contagem/agenda do hub: sem materializar série (isso escreve no banco). */
export async function fetchOpenTasksLite(): Promise<Task[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task")
    .select("id, title, status, due_date, due_time, parent_task_id")
    .eq("user_id", userId)
    .neq("status", "done");
  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
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
        estimated_duration: input.is_quick
          ? null
          : (input.estimated_duration ?? null),
        start_date: null,
        priority: input.priority ?? null,
        recurrence_rule: input.recurrence_rule ?? null,
        linked_recurring_id: null,
        icon_key: null,
        icon_url: null,
        is_milestone: false,
        is_quick: input.is_quick ?? false,
        is_medication: false,
        is_consultation: input.is_consultation ?? false,
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
      ...(input.estimated_duration !== undefined || input.is_quick !== undefined
        ? {
            estimated_duration: input.is_quick
              ? null
              : (input.estimated_duration ?? null),
            is_quick: input.is_quick ?? false,
          }
        : {}),
      ...(input.project_id !== undefined ? { project_id: input.project_id } : {}),
      priority: input.priority ?? null,
      ...(input.status ? { status: input.status } : {}),
      ...(input.tag_ids ? { tag_ids: input.tag_ids } : {}),
      ...(input.recurrence_rule !== undefined
        ? { recurrence_rule: input.recurrence_rule }
        : {}),
      ...(input.status === "done"
        ? { completed_at: new Date().toISOString() }
        : input.status
          ? { completed_at: null }
          : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (input.status) await syncTaskSideEffects(input.id, userId, input.status);
}

async function syncLinkedShoppingItemFromTask(
  taskId: string,
  userId: string,
  taskStatus: TaskStatus
): Promise<void> {
  const { data: task, error } = await supabase
    .from("task")
    .select("linked_shopping_item_id")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!task?.linked_shopping_item_id) return;
  const { error: itemError } = await supabase
    .from("shopping_item")
    .update({
      status: resolveItemStatusFromTask(taskStatus),
      updated_at: new Date().toISOString(),
    })
    .eq("id", task.linked_shopping_item_id)
    .eq("user_id", userId);
  if (itemError) throw new Error(itemError.message);
}

async function syncLinkedInstallmentFromTask(
  taskId: string,
  userId: string,
  becomingDone: boolean
): Promise<void> {
  const { data: task, error } = await supabase
    .from("task")
    .select("linked_recurring_id, linked_installment_number")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!task?.linked_recurring_id || task.linked_installment_number == null) {
    return;
  }
  const recurring = await fetchRecurringById(task.linked_recurring_id);
  if (!recurring) return;
  const paidParcels = recurring.paid_parcels ?? [];
  const isPaid = paidParcels.includes(task.linked_installment_number);
  if (becomingDone === isPaid) return;
  await updateRecurringParcelPayment(
    task.linked_recurring_id,
    task.linked_installment_number,
    paidParcels
  );
}

async function syncTaskSideEffects(
  taskId: string,
  userId: string,
  status: TaskStatus
): Promise<void> {
  try {
    await syncLinkedInstallmentFromTask(taskId, userId, status === "done");
  } catch (syncError) {
    console.error("Falha ao sincronizar parcela vinculada:", syncError);
  }
  try {
    await syncLinkedShoppingItemFromTask(taskId, userId, status);
  } catch (syncError) {
    console.error("Falha ao sincronizar item de compras vinculado:", syncError);
  }
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
  await syncTaskSideEffects(id, userId, "done");
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
  await syncTaskSideEffects(id, userId, "todo");
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
  return sortSubtasks((data ?? []) as Task[]);
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
  await syncTaskSideEffects(id, userId, status);
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
