import type { Recurring, RecurringDueAlert } from "@/types/recurring";
import { DUE_WARNING_DAYS } from "@/domain/recurring/constants";
import { formatDueDate } from "@/domain/recurring/installments";
import { formatYm } from "@/domain/recurring/projection";

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

/** Parcela com vencimento no mês (1–12). */
export function recurringInstallmentInMonth(
  rec: Recurring,
  year: number,
  month: number
) {
  if (!Array.isArray(rec.installments)) return undefined;
  const ym = formatYm(year, month);
  return rec.installments.find((inst) => inst.dueDate.slice(0, 7) === ym);
}

/** A parcela do mês escolhido já foi paga / recebida. */
export function isRecurringPaidInMonth(
  rec: Recurring,
  year: number,
  month: number
): boolean {
  const inst = recurringInstallmentInMonth(rec, year, month);
  if (!inst) return false;
  return (rec.paid_parcels || []).includes(inst.number);
}

export function filterRecurringList(
  list: Recurring[],
  filter: RecurringFilter,
  dueAlerts: RecurringDueAlert[],
  year: number,
  month: number
): Recurring[] {
  const overdueIds = new Set(
    dueAlerts.filter((a) => a.status === "overdue").map((a) => a.recurring.id)
  );
  const upcomingIds = new Set(
    dueAlerts.filter((a) => a.status === "upcoming").map((a) => a.recurring.id)
  );

  return list.filter((rec) => {
    switch (filter) {
      case "open":
        return !isRecurringPaidInMonth(rec, year, month);
      case "paid":
        return isRecurringPaidInMonth(rec, year, month);
      case "upcoming":
        return upcomingIds.has(rec.id);
      case "overdue":
        return overdueIds.has(rec.id);
      default:
        return true;
    }
  });
}
