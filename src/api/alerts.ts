import { fetchRecurringTransactions } from "@/api/recurring";
import {
  fetchVehicles,
  fetchMaintenancesForVehicles,
  fetchDocumentsForVehicles,
} from "@/api/car";
import { fetchMonthlyBudgetSummary } from "@/api/finance";
import { fetchGoals } from "@/api/goals";
import { getRecurringDueAlerts } from "@/domain/recurring";
import { getDocumentAlerts, getMaintenanceAlerts } from "@/domain/car";
import { getCurrentUserId } from "@/lib/auth-user";
import type { RecurringDueAlert } from "@/types/recurring";

export type AppAlertKind =
  | "recurring_overdue"
  | "recurring_upcoming"
  | "maintenance"
  | "document"
  | "budget"
  | "goal_due"
  | "goal_overdue";

export type AppAlert = {
  id: string;
  kind: AppAlertKind;
  severity: "danger" | "warning" | "info";
  title: string;
  message: string;
  href: string;
};

const ALERTS_TTL_MS = 90_000;

let alertsCache: { userId: string; at: number; data: AppAlert[] } | null =
  null;
let alertsInflight: { userId: string; promise: Promise<AppAlert[]> } | null =
  null;

function budgetMonthIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function daysUntil(isoDate: string, now = new Date()): number {
  const target = new Date(`${isoDate}T12:00:00`);
  const start = new Date(now);
  start.setHours(12, 0, 0, 0);
  return Math.ceil(
    (target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );
}

export function invalidateAppAlertsCache() {
  alertsCache = null;
  alertsInflight = null;
}

async function loadAppAlertsFresh(): Promise<AppAlert[]> {
  const alerts: AppAlert[] = [];

  const [recurringResult, vehiclesResult, budgetResult, goalsResult] =
    await Promise.allSettled([
      fetchRecurringTransactions(),
      fetchVehicles(),
      fetchMonthlyBudgetSummary(budgetMonthIso()),
      fetchGoals(),
    ]);

  if (recurringResult.status === "fulfilled") {
    for (const a of getRecurringDueAlerts(recurringResult.value)) {
      alerts.push(mapRecurringAlert(a));
    }
  }

  if (vehiclesResult.status === "fulfilled") {
    const vehicles = vehiclesResult.value;
    const vehicleIds = vehicles.map((v) => v.id);
    const [maintenances, documents] = await Promise.all([
      fetchMaintenancesForVehicles(vehicleIds),
      fetchDocumentsForVehicles(vehicleIds),
    ]);

    for (const v of vehicles) {
      const label = `${v.brand} ${v.model}`.trim();
      const vehicleMaint = maintenances.filter((m) => m.vehicle_id === v.id);
      const vehicleDocs = documents.filter((d) => d.vehicle_id === v.id);

      for (const m of getMaintenanceAlerts(v, vehicleMaint)) {
        alerts.push({
          id: `maint-${v.id}-${m.type}`,
          kind: "maintenance",
          severity: m.status === "overdue" ? "danger" : "warning",
          title: `${label}: manutenção`,
          message: m.message,
          href: "/car",
        });
      }
      for (const d of getDocumentAlerts(vehicleDocs)) {
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
  }

  if (budgetResult.status === "fulfilled") {
    for (const row of budgetResult.value) {
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
  }

  if (goalsResult.status === "fulfilled") {
    for (const goal of goalsResult.value) {
      if (goal.status !== "active" || !goal.deadline) continue;
      const d = daysUntil(goal.deadline);
      if (d < 0) {
        alerts.push({
          id: `goal-overdue-${goal.id}`,
          kind: "goal_overdue",
          severity: "danger",
          title: goal.title,
          message: `Meta atrasada (${Math.abs(d)} dia${Math.abs(d) === 1 ? "" : "s"}).`,
          href: "/goals",
        });
      } else if (d <= 7) {
        alerts.push({
          id: `goal-due-${goal.id}`,
          kind: "goal_due",
          severity: d <= 2 ? "warning" : "info",
          title: goal.title,
          message:
            d === 0
              ? "Prazo da meta é hoje."
              : `Prazo em ${d} dia${d === 1 ? "" : "s"}.`,
          href: "/goals",
        });
      }
    }
  }

  const order = { danger: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

export async function fetchAppAlerts(opts?: {
  force?: boolean;
}): Promise<AppAlert[]> {
  const userId = await getCurrentUserId();
  const now = Date.now();

  if (
    !opts?.force &&
    alertsCache &&
    alertsCache.userId === userId &&
    now - alertsCache.at < ALERTS_TTL_MS
  ) {
    return alertsCache.data;
  }

  if (
    !opts?.force &&
    alertsInflight &&
    alertsInflight.userId === userId
  ) {
    return alertsInflight.promise;
  }

  const promise = loadAppAlertsFresh()
    .then((data) => {
      alertsCache = { userId, at: Date.now(), data };
      return data;
    })
    .finally(() => {
      if (alertsInflight?.promise === promise) {
        alertsInflight = null;
      }
    });

  alertsInflight = { userId, promise };
  return promise;
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
