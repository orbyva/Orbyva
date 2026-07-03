import { supabase } from "@/lib/supabase";
import { formatDateBR } from "@/lib/currency";
import {
  Installment,
  Installments,
  Recurring,
  RecurringCreateRequest,
  RecurringDueAlert,
  Type,
} from "@/types/recurring";

const DUE_WARNING_DAYS = 5;

export function getInstallmentDueDate(
  startDate: string,
  dueDay: number,
  installmentNumber: number
): Date {
  const start = new Date(`${startDate.slice(0, 10)}T12:00:00`);
  const monthOffset = installmentNumber - 1;
  const targetMonth = start.getMonth() + monthOffset;
  const targetYear = start.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const day = Math.min(dueDay, lastDay);
  return new Date(targetYear, normalizedMonth, day);
}

function formatDueDate(isoDate: string): string {
  return formatDateBR(isoDate);
}

export { formatDueDate };

export function formatInstallmentCount(count: number): string {
  return count === 1 ? "1 parcela" : `${count} parcelas`;
}

export function formatMonthYearShort(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  const month = date
    .toLocaleString("pt-BR", { month: "short" })
    .replace(".", "");
  const capitalized = month.charAt(0).toUpperCase() + month.slice(1);
  return `${capitalized}/${date.getFullYear()}`;
}

export function formatInstallmentLabel(number: number, dueDate: string): string {
  return `Parcela ${number} · vence em ${formatDueDate(dueDate)}`;
}

export interface InstallmentPlanSummary {
  title: string;
  subtitle: string;
}

export function formatInstallmentPlanSummary(rec: {
  installment_count: number | null;
  due_day: number | null;
  installments?: Installments;
}): InstallmentPlanSummary | null {
  if (!rec.installment_count || !rec.due_day) return null;

  const dueDayText =
    rec.due_day === 1 ? "Vence todo dia 1º" : `Vence todo dia ${rec.due_day}`;

  let subtitle = dueDayText;

  if (Array.isArray(rec.installments) && rec.installments.length > 0) {
    const first = rec.installments[0].dueDate;
    const last = rec.installments[rec.installments.length - 1].dueDate;
    subtitle = `${dueDayText} · ${formatMonthYearShort(first)} a ${formatMonthYearShort(last)}`;
  }

  return {
    title: formatInstallmentCount(rec.installment_count),
    subtitle,
  };
}

export function resolvePaymentStartDate(rec: {
  payment_start_date: string | null;
  created_at: string;
}): string {
  return rec.payment_start_date?.slice(0, 10) || rec.created_at.slice(0, 10);
}

export async function fetchTypes(): Promise<Type[]> {
  const { data, error } = await supabase
    .from("type")
    .select(`
      *,
      nature:nature_id(name)
    `);

  if (error) throw new Error(error.message);

  return data || [];
}

export async function fetchRecurringTransactions(
  startDateTZString: string | null = null,
  endDateTZString: string | null = null
): Promise<Recurring[]> {
  let query = supabase
    .from("recurring_transaction")
    .select(
      "*, class:class_id(id, name, type:type_id(name, hex_color, lucide_icon, nature:nature_id(name)))"
    )
    .neq("status", "FALSE")
    .order("id", { ascending: false })

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
): Promise<void> {
  const { error } = await supabase
    .from("recurring_transaction")
    .insert([newRecurring]);

  if (error) throw error;
}

export async function updateRecurringApi(
  id: string,
  data: RecurringCreateRequest
): Promise<void> {
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
    .eq("id", id);

  if (error) throw error;
}

export async function softDeleteRecurring(id: string): Promise<void> {
  const { error } = await supabase
    .from("recurring_transaction")
    .update({ status: 0 })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteRecurringApi(recurringId: string): Promise<void> {
  const { error } = await supabase
    .from("recurring_transaction")
    .delete()
    .match({ id: recurringId });

  if (error) throw error;
}

export function calculateInstallments(
  startDate: string,
  dueDay: number | null,
  installmentCount: number | null,
  validity: string | null = null
): Installments {
  if (installmentCount && installmentCount > 0 && dueDay) {
    const installments: Installment[] = [];

    for (let i = 1; i <= installmentCount; i++) {
      const dueDate = getInstallmentDueDate(startDate, dueDay, i);
      const dueDateIso = dueDate.toISOString().split("T")[0];

      installments.push({
        label: formatInstallmentLabel(i, dueDateIso),
        number: i,
        dueDate: dueDateIso,
      });
    }

    return installments;
  }

  if (!validity) return "Essa recorrência não é um parcelamento";

  const createdDate = new Date(`${startDate.slice(0, 10)}T12:00:00`);
  const validityDate = new Date(`${validity.slice(0, 10)}T12:00:00`);
  const legacyDueDay = validityDate.getDate();
  const installments: Installment[] = [];
  const currentDate = new Date(createdDate);

  while (currentDate <= validityDate) {
    const installmentNumber = installments.length + 1;
    const dueDate = getInstallmentDueDate(startDate, legacyDueDay, installmentNumber);
    const dueDateIso = dueDate.toISOString().split("T")[0];

    installments.push({
      label: formatInstallmentLabel(installmentNumber, dueDateIso),
      number: installmentNumber,
      dueDate: dueDateIso,
    });

    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  return installments;
}

export function getRecurringDueAlerts(
  recurringList: Recurring[],
  warningDays = DUE_WARNING_DAYS
): RecurringDueAlert[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const alerts: RecurringDueAlert[] = [];

  for (const rec of recurringList) {
    if (!Array.isArray(rec.installments)) continue;

    const paidParcels = rec.paid_parcels || [];
    const accountName = rec.description || rec.class?.name || "Conta";

    for (const installment of rec.installments) {
      if (paidParcels.includes(installment.number)) continue;

      const dueDate = new Date(`${installment.dueDate}T12:00:00`);
      dueDate.setHours(0, 0, 0, 0);
      const diffDays = Math.round(
        (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diffDays < 0) {
        alerts.push({
          recurring: rec,
          status: "overdue",
          installmentNumber: installment.number,
          dueDate: installment.dueDate,
          daysUntilDue: diffDays,
          message: `${accountName} está atrasada (parcela ${installment.number}, venceu em ${formatDueDate(installment.dueDate)}).`,
        });
        break;
      }

      if (diffDays <= warningDays) {
        alerts.push({
          recurring: rec,
          status: "upcoming",
          installmentNumber: installment.number,
          dueDate: installment.dueDate,
          daysUntilDue: diffDays,
          message:
            diffDays === 0
              ? `${accountName} vence hoje (parcela ${installment.number}).`
              : `${accountName} está perto do vencimento (parcela ${installment.number}, vence em ${formatDueDate(installment.dueDate)}).`,
        });
        break;
      }

      break;
    }
  }

  return alerts.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

export type RecurringFilter = "all" | "open" | "paid" | "upcoming" | "overdue";

export interface RecurringProgress {
  total: number;
  paid: number;
  open: number;
  percent: number;
}

export function getRecurringProgress(rec: Recurring): RecurringProgress | null {
  if (!Array.isArray(rec.installments) || rec.installments.length === 0) {
    return null;
  }

  const total = rec.installments.length;
  const paid = (rec.paid_parcels || []).length;
  const open = Math.max(total - paid, 0);

  return {
    total,
    paid,
    open,
    percent: total > 0 ? Math.round((paid / total) * 100) : 0,
  };
}

export interface DueAlertGroup {
  date: string;
  dateLabel: string;
  accountNames: string[];
}

export function groupDueAlertsByDate(
  alerts: RecurringDueAlert[]
): DueAlertGroup[] {
  const map = new Map<string, RecurringDueAlert[]>();

  for (const alert of alerts) {
    const existing = map.get(alert.dueDate) ?? [];
    existing.push(alert);
    map.set(alert.dueDate, existing);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, groupAlerts]) => ({
      date,
      dateLabel: formatDueDate(date),
      accountNames: groupAlerts.map(
        (a) => a.recurring.description || a.recurring.class?.name || "Conta"
      ),
    }));
}

export function filterRecurringList(
  list: Recurring[],
  filter: RecurringFilter,
  dueAlerts: RecurringDueAlert[]
): Recurring[] {
  const overdueIds = new Set(
    dueAlerts.filter((a) => a.status === "overdue").map((a) => a.recurring.id)
  );
  const upcomingIds = new Set(
    dueAlerts.filter((a) => a.status === "upcoming").map((a) => a.recurring.id)
  );

  return list.filter((rec) => {
    const progress = getRecurringProgress(rec);

    switch (filter) {
      case "open":
        return !progress || progress.open > 0;
      case "paid":
        return progress !== null && progress.open === 0 && progress.total > 0;
      case "upcoming":
        return upcomingIds.has(rec.id);
      case "overdue":
        return overdueIds.has(rec.id);
      default:
        return true;
    }
  });
}

export async function updateRecurringParcelPayment(
  transactionId: string,
  installmentNumber: number,
  currentPaidParcels: number[]
): Promise<number[]> {
  const updatedParcels = currentPaidParcels.includes(installmentNumber)
    ? currentPaidParcels.filter((parcel) => parcel !== installmentNumber)
    : [...currentPaidParcels, installmentNumber];

  const { error } = await supabase
    .from("recurring_transaction")
    .update({ paid_parcels: updatedParcels })
    .eq("id", transactionId);

  if (error) throw error;

  if (!currentPaidParcels.includes(installmentNumber)) {
    await registerTransaction(transactionId);
  }

  return updatedParcels;
}

async function registerTransaction(transactionId: string): Promise<void> {
  const utc3Date = new Date()
    .toISOString()
    .slice(0, 10);

  const { data: recurring, error: fetchError } = await supabase
    .from("recurring_transaction")
    .select("class_id, description, value")
    .eq("id", transactionId)
    .single();

  if (fetchError || !recurring) {
    throw new Error(fetchError?.message || "Erro ao buscar a transação recorrente.");
  }

  const newTransaction = {
    class_id: recurring.class_id,
    description: recurring.description,
    value: recurring.value,
    transaction_at: utc3Date,
  };

  const { error: insertError } = await supabase
    .from("transaction")
    .insert([newTransaction]);

  if (insertError) {
    throw new Error(insertError.message);
  }
}

export async function sumRecurringByNature() {
  const { data, error } = await supabase
    .from("vw_recurring_transaction_with_nature")
    .select("*")
    .neq("status", false);

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

export async function fetchDimensions() {
  const { data, error } = await supabase
    .from("nature")
    .select(`
      id,
      name,
      types: type!nature_id (
        id,
        name,
        classes: class!type_id (
          id,
          name
        )
      )
    `);

  if (error) {
    throw new Error(error.message);
  }

  return data;
}