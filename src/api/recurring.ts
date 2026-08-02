import { supabase } from "@/lib/supabase";
import { deleteTransactionApi, insertTransaction } from "@/api/finance";
import { getCurrentUserId } from "@/lib/auth-user";
import {
  buildRenewedFixedSchedule,
  canRenewFixedPlan,
  resolveFixedRenewalRollback,
} from "@/domain/recurring";
import {
  Recurring,
  RecurringCreateRequest,
} from "@/types/recurring";

export * from "@/domain/recurring";

export async function fetchRecurringTransactions(
  startDateTZString: string | null = null,
  endDateTZString: string | null = null
): Promise<Recurring[]> {
  const userId = await getCurrentUserId();
  let query = supabase
    .from("recurring_transaction")
    .select(
      "*, class:class_id(id, name, type:type_id(name, hex_color, lucide_icon, exclude_from_spend, nature:nature_id(name)))"
    )
    .eq("user_id", userId)
    .eq("status", true)
    .order("id", { ascending: false });

  if (startDateTZString) {
    query = query.gte("created_at", startDateTZString);
  }
  if (endDateTZString) {
    query = query.lte("created_at", endDateTZString);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function createRecurringApi(
  newRecurring: RecurringCreateRequest
): Promise<Recurring> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("recurring_transaction")
    .insert([{ ...newRecurring, user_id: userId }])
    .select(
      "*, class:class_id(id, name, type:type_id(name, hex_color, lucide_icon, exclude_from_spend, nature:nature_id(name)))"
    )
    .single();

  if (error) throw error;
  return data;
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

export async function deleteRecurringApi(recurringId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("recurring_transaction")
    .delete()
    .eq("id", recurringId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function updateRecurringParcelPayment(
  recurringId: string,
  installmentNumber: number,
  currentPaidParcels: number[]
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

    return rollback?.paid_parcels ?? updatedParcels;
  }

  const transactionId = await registerParcelTransaction(
    recurringId,
    installmentNumber
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
    /* progresso da meta é best-effort */
  }

  return updatedParcels;
}

async function registerParcelTransaction(
  recurringId: string,
  installmentNumber: number
): Promise<number> {
  const userId = await getCurrentUserId();
  const transactionAt = new Date().toISOString().slice(0, 10);

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

  return insertTransaction({
    class_id: recurring.class_id,
    description: recurring.description,
    value: recurring.value,
    transaction_at: transactionAt,
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
