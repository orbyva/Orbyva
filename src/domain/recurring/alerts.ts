import type { Recurring, RecurringDueAlert } from "@/types/recurring";
import { DUE_WARNING_DAYS } from "./constants";
import { formatDueDate } from "./installments";

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

export interface CommittedAmounts {
  pay: number;
  receive: number;
}

export function calculateCommittedThisMonth(
  recurringList: Recurring[],
  referenceDate = new Date()
): CommittedAmounts {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  let pay = 0;
  let receive = 0;

  for (const rec of recurringList) {
    if (!Array.isArray(rec.installments)) continue;

    const paidParcels = rec.paid_parcels || [];
    const nature = rec.class?.type?.nature?.name;

    for (const installment of rec.installments) {
      if (paidParcels.includes(installment.number)) continue;

      const due = new Date(`${installment.dueDate}T12:00:00`);
      if (due.getFullYear() !== year || due.getMonth() !== month) continue;

      if (nature === "Despesa") pay += rec.value;
      else if (nature === "Receita") receive += rec.value;
    }
  }

  return { pay, receive };
}
