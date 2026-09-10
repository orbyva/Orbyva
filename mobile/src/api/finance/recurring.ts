import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import {
  calculateInstallments,
  resolvePaymentStartDate,
} from "@/domain/recurring/installments";
import { resolveFixedRenewalRollback } from "@/domain/recurring/constants";
import { createTransaction, deleteTransaction } from "@/api/finance/transactions";
import type { Recurring, RecurringCreateRequest } from "@/types/recurring";

const RECURRING_SELECT =
  "id, user_id, class_id, value, description, frequency, validity, due_day, installment_count, payment_start_date, status, created_at, paid_parcels, class:class_id(id, name, type:type_id(name, hex_color, lucide_icon, exclude_from_spend, nature:nature_id(name)))";

function withInstallments(rec: Recurring): Recurring {
  return {
    ...rec,
    installments: calculateInstallments(
      resolvePaymentStartDate(rec),
      rec.due_day,
      rec.installment_count,
      rec.validity,
      rec.frequency
    ),
  };
}

export async function fetchRecurringTransactions(
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

  const { data, error } = await query;
  if (error) throw error;
  return ((data || []) as unknown as Recurring[]).map(withInstallments);
}

export async function fetchRecurringForDashboard(): Promise<Recurring[]> {
  return fetchRecurringTransactions();
}

export async function createRecurringApi(
  payload: RecurringCreateRequest
): Promise<Recurring> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("recurring_transaction")
    .insert([{ ...payload, user_id: userId }])
    .select(RECURRING_SELECT)
    .single();
  if (error) throw error;
  return withInstallments(data as unknown as Recurring);
}

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

  const installments = calculateInstallments(
    resolvePaymentStartDate(recurring),
    recurring.due_day,
    recurring.installment_count,
    recurring.validity,
    recurring.frequency
  );
  const dueDate = Array.isArray(installments)
    ? installments.find((item) => item.number === installmentNumber)?.dueDate
    : undefined;
  const transactionAt =
    dueDate?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const paidDate = paidAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);

  return createTransaction({
    class_id: recurring.class_id,
    description: recurring.description,
    value: recurring.value,
    transaction_at: transactionAt,
    paid_at: paidDate,
    recurring_transaction_id: recurringId,
    installment_number: installmentNumber,
  });
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
  await deleteTransaction(candidates[0].id);
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
    await deleteTransaction(linkedTransaction.id);
    return;
  }
  await removeLegacyParcelTransaction(recurringId);
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
    } catch {
      /* best-effort */
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
    await deleteTransaction(transactionId).catch(() => undefined);
    throw error;
  }

  try {
    await syncLinkedTaskFromInstallment(recurringId, installmentNumber, true);
  } catch {
    /* best-effort */
  }

  return updatedParcels;
}
