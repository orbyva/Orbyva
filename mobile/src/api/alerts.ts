import {
  budgetMonthIso,
  fetchMonthlyBudgetSummary,
  fetchRecurringForDashboard,
} from "@/api/finance/dashboard";
import { fetchTasks } from "@/api/tasks/tasks";
import { buildAppAlerts, type AppAlert } from "@/domain/alerts";
import { countOpenTaskBuckets, todayIsoDate } from "@/domain/tasks/listView";

export type { AppAlert };

let alertsCache: AppAlert[] | null = null;
const listeners = new Set<(alerts: AppAlert[]) => void>();

function notify() {
  if (!alertsCache) return;
  for (const listener of listeners) listener(alertsCache);
}

export function seedAppAlerts(data: AppAlert[]) {
  alertsCache = data;
  notify();
}

export function subscribeAppAlerts(listener: (alerts: AppAlert[]) => void) {
  listeners.add(listener);
  if (alertsCache) listener(alertsCache);
  return () => {
    listeners.delete(listener);
  };
}

export async function fetchAppAlerts(): Promise<AppAlert[]> {
  const now = new Date();
  const [recurring, budgets, tasks] = await Promise.all([
    fetchRecurringForDashboard(),
    fetchMonthlyBudgetSummary(
      budgetMonthIso(now.getFullYear(), now.getMonth() + 1)
    ).catch(() => []),
    fetchTasks().catch(() => []),
  ]);
  const overdueTasks = countOpenTaskBuckets(tasks, todayIsoDate()).overdue;
  const alerts = buildAppAlerts(recurring, budgets, overdueTasks);
  seedAppAlerts(alerts);
  return alerts;
}

export function peekAppAlerts(): AppAlert[] | null {
  return alertsCache;
}
