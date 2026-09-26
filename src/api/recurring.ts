import { supabase } from "@/lib/supabase";
import { deleteTransactionApi, insertTransaction } from "@/api/finance";
import { getCurrentUserId } from "@/lib/auth-user";
import {
  buildRenewedFixedSchedule,
  calculateInstallments,
  canRenewFixedPlan,
  resolveFixedRenewalRollback,
  resolvePaymentStartDate,
} from "@/domain/recurring";
import {
  Recurring,
  RecurringCreateRequest,
} from "@/types/recurring";

export * from "@/domain/recurring";

const RECURRING_SELECT =
  "id, user_id, class_id, value, description, frequency, validity, due_day, installment_count, payment_start_date, status, created_at, paid_parcels, class:class_id(id, name, type:type_id(name, hex_color, lucide_icon, exclude_from_spend, nature:nature_id(name)))";

export async function fetchRecurringTransactions(
  startDateTZString: string | null = null,
  endDateTZString: string | null = null,
  options: { includeInactive?: boolean } = {}
): Promise<Recurring[]> {
  const userId = await getCurrentUserId();
  let query = supabase
    .from("recurring_transaction")
    .select(RECURRING_SELECT)
    .eq("user_id", userId)
    .order("id", { ascending: false });

  if (!options.includeInactive) {
    query = query.eq("status", true);
  }

  if (startDateTZString) {
    query = query.gte("created_at", startDateTZString);
  }
  if (endDateTZString) {
    query = query.lte("created_at", endDateTZString);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data || []) as unknown as Recurring[];
}

export async function createRecurringApi(
  newRecurring: RecurringCreateRequest
): Promise<Recurring> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("recurring_transaction")
    .insert([{ ...newRecurring, user_id: userId }])
    .select(RECURRING_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as Recurring;
}

export async function updateRecurringApi(
  id: string,
  data: RecurringCreateRequest
): Promise<void> {
  const userId = await getCurrentUserId();
  const payload = {
    class_id: data.class_id,
    value: data.value,
    description: data.description,
    frequency: data.frequency,
    validity: data.validity,
    due_day: data.due_day,
    installment_count: data.installment_count,
    payment_start_date: data.payment_start_date,
    status: data.status,
  };

  const { error } = await supabase
    .from("recurring_transaction")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}

/**
 * Estende conta/receita fixa até o próximo ano.
 * Mantém paid_parcels e a data de início para continuar desfazendo parcelas passadas.
 */
export async function renewFixedRecurringApi(
  recurring: Recurring
): Promise<{ year: number }> {
  if (!canRenewFixedPlan(recurring)) {
    throw new Error("Esta parcela fixa ainda não pode ser renovada.");
  }

  const schedule = buildRenewedFixedSchedule(recurring);
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("recurring_transaction")
    .update({
      payment_start_date: schedule.payment_start_date,
      installment_count: schedule.installment_count,
      validity: schedule.validity,
    })
    .eq("id", recurring.id)
    .eq("user_id", userId);

  if (error) throw error;
  return { year: schedule.year };
}

export async function softDeleteRecurring(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("recurring_transaction")
    .update({ status: false })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function restoreRecurring(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("recurring_transaction")
    .update({ status: true })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function deleteRecurringApi(recurringId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("recurring_transaction")
    .delete()
    .eq("id", recurringId)
    .eq("user_id", userId);

  if (error) throw error;
}

/** Última data efetiva de pagamento (`paid_at`) por recorrência.
 * Sem `recurringIds` (ou lista vazia): todas as do usuário (permite paralelizar com o fetch da lista).
 */
export async function fetchLastPaidAtByRecurring(
  recurringIds?: string[]
): Promise<Record<string, string>> {
  const userId = await getCurrentUserId();
  let query = supabase
    .from("transaction")
    .select("recurring_transaction_id, paid_at, transaction_at, created_at")
    .eq("user_id", userId)
    .not("recurring_transaction_id", "is", null);

  if (recurringIds && recurringIds.length > 0) {
    query = query.in("recurring_transaction_id", recurringIds);
  }

  const { data, error } = await query;

  if (error) throw error;

  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    const id = row.recurring_transaction_id as string | null;
    if (!id) continue;
    const paid =
      (row.paid_at as string | null)?.slice(0, 10) ||
      (row.created_at as string | null)?.slice(0, 10) ||
      (row.transaction_at as string | null)?.slice(0, 10);
    if (!paid) continue;
    if (!out[id] || paid > out[id]!) out[id] = paid;
  }
  return out;
}

export interface RecurringScheduleFields {
  id: string;
  payment_start_date: string | null;
  due_day: number | null;
  installment_count: number | null;
  validity: string | null;
  frequency: string;
  paid_parcels: number[];
  created_at: string;
  status: boolean;
}

/** Campos mínimos para calcular parcelas — usado pela materialização de tarefas vinculadas. */
export async function fetchRecurringTransactionsByIds(
  ids: string[]
): Promise<RecurringScheduleFields[]> {
  if (ids.length === 0) return [];
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("recurring_transaction")
    .select(
      "id, payment_start_date, due_day, installment_count, validity, frequency, paid_parcels, created_at, status"
    )
    .eq("user_id", userId)
    .in("id", ids);
  if (error) throw error;
  return (data ?? []) as RecurringScheduleFields[];
}

/**
 * Sincroniza a tarefa vinculada (se houver) com o pagamento/estorno de uma
 * parcela. Atualiza a tabela `task` diretamente (não chama `updateTask` de
 * `@/api/tasks`) para evitar recursão entre os dois lados do vínculo.
 */
async function syncLinkedTaskFromInstallment(
  recurringId: string,
  installmentNumber: number,
  paid: boolean
): Promise<void> {
  const userId = await getCurrentUserId();
  const { data: task, error: fetchError } = await supabase
    .from("task")
    .select("id, status")
    .eq("user_id", userId)
    .eq("linked_recurring_id", recurringId)
    .eq("linked_installment_number", installmentNumber)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!task) return;

  const targetStatus = paid ? "done" : "todo";
  if (task.status === targetStatus) return;

  const { error } = await supabase
    .from("task")
    .update({
      status: targetStatus,
      completed_at: paid ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", task.id)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function updateRecurringParcelPayment(
  recurringId: string,
  installmentNumber: number,
  currentPaidParcels: number[],
  paidAt?: string | null
): Promise<number[]> {
  const userId = await getCurrentUserId();
  const isUndo = currentPaidParcels.includes(installmentNumber);

  if (isUndo) {
    await removeParcelTransaction(recurringId, installmentNumber);

    const updatedParcels = currentPaidParcels.filter(
      (parcel) => parcel !== installmentNumber
    );

    const { data: recurringRow, error: fetchError } = await supabase
      .from("recurring_transaction")
      .select(
        "frequency, validity, payment_start_date, installment_count, due_day"
      )
      .eq("id", recurringId)
      .eq("user_id", userId)
      .single();

    if (fetchError) throw fetchError;

    const rollback = resolveFixedRenewalRollback(
      recurringRow,
      installmentNumber,
      updatedParcels
    );

    const { error } = await supabase
      .from("recurring_transaction")
      .update(
        rollback
          ? {
              paid_parcels: rollback.paid_parcels,
              payment_start_date: rollback.payment_start_date,
              installment_count: rollback.installment_count,
              validity: rollback.validity,
            }
          : { paid_parcels: updatedParcels }
      )
      .eq("id", recurringId)
      .eq("user_id", userId);

    if (error) throw error;

    try {
      await syncLinkedTaskFromInstallment(recurringId, installmentNumber, false);
    } catch (syncError) {
      console.error("Falha ao sincronizar tarefa vinculada (undo):", syncError);
    }

    return rollback?.paid_parcels ?? updatedParcels;
  }

  const transactionId = await registerParcelTransaction(
    recurringId,
    installmentNumber,
    paidAt
  );

  const updatedParcels = [...currentPaidParcels, installmentNumber];

  const { error } = await supabase
    .from("recurring_transaction")
    .update({ paid_parcels: updatedParcels })
    .eq("id", recurringId)
    .eq("user_id", userId);

  if (error) {
    await deleteTransactionApi(transactionId).catch(() => undefined);
    throw error;
  }

  // Meta: best-effort, não bloqueia o feedback de “pago”.
  void (async () => {
    try {
      const { syncGoalsFromAporteDescription } = await import("@/api/goals");
      const { data: rec } = await supabase
        .from("recurring_transaction")
        .select("description")
        .eq("id", recurringId)
        .maybeSingle();
      if (rec?.description) {
        await syncGoalsFromAporteDescription(rec.description);
      }
    } catch {
      /* ignore */
    }
  })();

  try {
    await syncLinkedTaskFromInstallment(recurringId, installmentNumber, true);
  } catch (syncError) {
    console.error("Falha ao sincronizar tarefa vinculada (pagamento):", syncError);
  }

  return updatedParcels;
}

async function registerParcelTransaction(
  recurringId: string,
  installmentNumber: number,
  paidAt?: string | null
): Promise<number> {
  const userId = await getCurrentUserId();

  const { data: recurring, error: fetchError } = await supabase
    .from("recurring_transaction")
    .select(
      "class_id, description, value, payment_start_date, created_at, due_day, installment_count, validity, frequency"
    )
    .eq("id", recurringId)
    .eq("user_id", userId)
    .single();

  if (fetchError || !recurring) {
    throw new Error(
      fetchError?.message || "Erro ao buscar a transação recorrente."
    );
  }

  // Usa o vencimento da parcela para o mês da projeção/ledger bater com a competência.
  const installments = calculateInstallments(
    resolvePaymentStartDate(recurring),
    recurring.due_day,
    recurring.installment_count,
    recurring.validity,
    recurring.frequency
  );
  const dueDate =
    Array.isArray(installments)
      ? installments.find((item) => item.number === installmentNumber)?.dueDate
      : undefined;
  const transactionAt =
    dueDate?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const paidDate =
    paidAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);

  return insertTransaction({
    class_id: recurring.class_id,
    description: recurring.description,
    value: recurring.value,
    transaction_at: transactionAt,
    paid_at: paidDate,
    recurring_transaction_id: recurringId,
    installment_number: installmentNumber,
  });
}

async function removeParcelTransaction(
  recurringId: string,
  installmentNumber: number
): Promise<void> {
  const userId = await getCurrentUserId();
  const { data: linkedTransaction, error: linkedError } = await supabase
    .from("transaction")
    .select("id")
    .eq("user_id", userId)
    .eq("recurring_transaction_id", recurringId)
    .eq("installment_number", installmentNumber)
    .maybeSingle();

  if (linkedError) throw linkedError;

  if (linkedTransaction) {
    await deleteTransactionApi(linkedTransaction.id);
    return;
  }

  await removeLegacyParcelTransaction(recurringId);
}

async function removeLegacyParcelTransaction(
  recurringId: string
): Promise<void> {
  const userId = await getCurrentUserId();
  const { data: recurring, error: fetchError } = await supabase
    .from("recurring_transaction")
    .select("class_id, description, value")
    .eq("id", recurringId)
    .eq("user_id", userId)
    .single();

  if (fetchError || !recurring) {
    throw new Error(
      fetchError?.message || "Erro ao buscar a transação recorrente."
    );
  }

  const { data: candidates, error: queryError } = await supabase
    .from("transaction")
    .select("id")
    .eq("user_id", userId)
    .eq("class_id", recurring.class_id)
    .eq("description", recurring.description)
    .eq("value", recurring.value)
    .is("recurring_transaction_id", null)
    .order("id", { ascending: false })
    .limit(1);

  if (queryError) throw queryError;

  if (!candidates?.length) return;

  await deleteTransactionApi(candidates[0].id);
}

export async function sumRecurringByNature() {
  const { data, error } = await supabase
    .from("vw_recurring_transaction_with_nature")
    .select("*")
    .eq("status", true);

  if (error) throw error;

  let totalFixesPay = 0;
  let totalFixesReceivable = 0;

  for (const item of data ?? []) {
    if (item.nature_id === 2) {
      totalFixesPay += item.sum || 0;
    } else if (item.nature_id === 1) {
      totalFixesReceivable += item.sum || 0;
    }
  }

  return { totalFixesPay, totalFixesReceivable };
}
