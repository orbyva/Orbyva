import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { computeMissingLinkedInstallments, computeMissingOccurrences } from "@/domain/tasks";
import { calculateInstallments, resolvePaymentStartDate } from "@/domain/recurring";
import {
  fetchRecurringTransactionsByIds,
  updateRecurringParcelPayment,
} from "@/api/recurring";
import { formatLocalIsoDate } from "@/lib/dates";
import type { Task, TaskCreateRequest, TaskUpdateRequest } from "@/types/tasks";

async function materializeRecurringInstances(
  userId: string,
  tasks: Task[]
): Promise<Task[]> {
  const origins = tasks.filter(
    (task) => task.recurrence_rule && !task.recurrence_origin_id && task.due_date
  );
  if (origins.length === 0) return tasks;

  const today = formatLocalIsoDate(new Date());
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
        tags: origin.tags,
        due_date: date,
        due_time: origin.recurrence_rule?.time ?? null,
        recurrence_rule: null,
        recurrence_origin_id: origin.id,
      });
    }
  }

  if (newRows.length === 0) return tasks;

  const { data, error } = await supabase.from("task").insert(newRows).select();
  if (error) throw new Error(error.message);
  return [...tasks, ...(data ?? [])];
}

async function materializeLinkedInstances(
  userId: string,
  tasks: Task[]
): Promise<Task[]> {
  const templates = tasks.filter(
    (task) => task.linked_recurring_id && task.linked_installment_number == null
  );
  if (templates.length === 0) return tasks;

  const recurringIds = Array.from(
    new Set(templates.map((task) => task.linked_recurring_id as string))
  );
  const recurringRows = await fetchRecurringTransactionsByIds(recurringIds);
  const recurringById = new Map(recurringRows.map((row) => [row.id, row]));

  const newRows: Array<Record<string, unknown>> = [];

  for (const template of templates) {
    const recurring = recurringById.get(template.linked_recurring_id as string);
    if (!recurring || !recurring.status) continue;

    const installments = calculateInstallments(
      resolvePaymentStartDate(recurring),
      recurring.due_day,
      recurring.installment_count,
      recurring.validity,
      recurring.frequency
    );
    if (!Array.isArray(installments)) continue;

    const paidParcels = recurring.paid_parcels ?? [];
    const openInstallments = installments.filter(
      (installment) => !paidParcels.includes(installment.number)
    );

    const materializedNumbers = tasks
      .filter(
        (task) =>
          task.linked_recurring_id === template.linked_recurring_id &&
          task.linked_installment_number != null
      )
      .map((task) => task.linked_installment_number as number);

    const missing = computeMissingLinkedInstallments(
      openInstallments,
      materializedNumbers
    );

    for (const installment of missing) {
      newRows.push({
        user_id: userId,
        project_id: template.project_id,
        parent_task_id: null,
        title: template.title,
        description: template.description ?? null,
        status: "todo",
        tags: template.tags,
        due_date: installment.dueDate,
        recurrence_rule: null,
        recurrence_origin_id: template.id,
        linked_recurring_id: template.linked_recurring_id,
        linked_installment_number: installment.number,
      });
    }
  }

  if (newRows.length === 0) return tasks;

  const { data, error } = await supabase.from("task").insert(newRows).select();
  if (error) throw new Error(error.message);
  return [...tasks, ...(data ?? [])];
}

export async function fetchTasks(): Promise<Task[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task")
    .select("*")
    .eq("user_id", userId)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  const withRecurring = await materializeRecurringInstances(userId, data ?? []);
  return materializeLinkedInstances(userId, withRecurring);
}

export async function createTask(task: TaskCreateRequest): Promise<Task> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task")
    .insert([{ ...task, user_id: userId }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateTask(data: TaskUpdateRequest): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = data;
  const payload: Record<string, unknown> = {
    ...fields,
    updated_at: new Date().toISOString(),
  };
  if (fields.status === "done") payload.completed_at = new Date().toISOString();
  const { error } = await supabase
    .from("task")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  if (fields.status) {
    try {
      await syncLinkedInstallmentFromTask(id, userId, fields.status === "done");
    } catch (syncError) {
      console.error("Falha ao sincronizar parcela vinculada:", syncError);
    }
  }
}

/**
 * Sincroniza a Recorrência Financeira vinculada (se houver) com a conclusão/
 * reabertura da tarefa. Reaproveita `updateRecurringParcelPayment`, que já
 * cria/remove a transação e atualiza `paid_parcels`.
 */
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
  if (!task?.linked_recurring_id || task.linked_installment_number == null) return;

  const [recurring] = await fetchRecurringTransactionsByIds([
    task.linked_recurring_id,
  ]);
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

export async function deleteTask(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("task")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
