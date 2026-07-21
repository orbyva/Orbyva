import { fetchRecurringTransactions } from "@/api/recurring";
import { fetchVehicles, fetchAllMaintenances, fetchDocuments } from "@/api/car";
import { fetchMonthlyBudgetSummary } from "@/api/finance";
import { getRecurringDueAlerts } from "@/domain/recurring";
import { getDocumentAlerts, getMaintenanceAlerts } from "@/domain/car";
import type { RecurringDueAlert } from "@/types/recurring";

export type AppAlertKind =
  | "recurring_overdue"
  | "recurring_upcoming"
  | "maintenance"
  | "document"
  | "budget";

export type AppAlert = {
  id: string;
  kind: AppAlertKind;
  severity: "danger" | "warning" | "info";
  title: string;
  message: string;
  href: string;
};

function budgetMonthIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export async function fetchAppAlerts(): Promise<AppAlert[]> {
  const alerts: AppAlert[] = [];

  try {
    const recurring = await fetchRecurringTransactions();
    const due = getRecurringDueAlerts(recurring);
    for (const a of due) {
      alerts.push(mapRecurringAlert(a));
    }
  } catch {
    /* ignore */
  }

  try {
    const vehicles = await fetchVehicles();
    for (const v of vehicles) {
      const [maintenances, documents] = await Promise.all([
        fetchAllMaintenances(v.id),
        fetchDocuments(v.id),
      ]);
      const label = `${v.brand} ${v.model}`.trim();
      for (const m of getMaintenanceAlerts(v, maintenances)) {
        alerts.push({
          id: `maint-${v.id}-${m.type}`,
          kind: "maintenance",
          severity: m.status === "overdue" ? "danger" : "warning",
          title: `${label}: manutenção`,
          message: m.message,
          href: "/car",
        });
      }
      for (const d of getDocumentAlerts(documents)) {
        alerts.push({
          id: `doc-${d.document.id}`,
          kind: "document",
          severity: d.status === "overdue" ? "danger" : "warning",
          title: `${label}: documento`,
          message: d.message,
          href: "/car",
        });
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const summary = await fetchMonthlyBudgetSummary(budgetMonthIso());
    for (const row of summary) {
      if (Number(row.remaining_value) >= 0) continue;
      const name = row.class_name
        ? `${row.type_name} / ${row.class_name}`
        : row.type_name;
      alerts.push({
        id: `budget-${row.id}`,
        kind: "budget",
        severity: "danger",
        title: "Orçamento estourado",
        message: `${name} passou do planejado.`,
        href: "/finance/budget",
      });
    }
  } catch {
    /* ignore */
  }

  const order = { danger: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

function mapRecurringAlert(a: RecurringDueAlert): AppAlert {
  const name =
    a.recurring.description || a.recurring.class?.name || "Parcela";
  return {
    id: `rec-${a.recurring.id}-${a.installmentNumber}`,
    kind: a.status === "overdue" ? "recurring_overdue" : "recurring_upcoming",
    severity: a.status === "overdue" ? "danger" : "warning",
    title: name,
    message: a.message,
    href: "/finance/recurring",
  };
}
