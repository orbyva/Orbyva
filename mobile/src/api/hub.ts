import { seedAppAlerts, type AppAlert } from "@/api/alerts";
import {
  budgetMonthIso,
  fetchLatestTransactionAt,
  fetchMonthlyBudgetSummary,
  fetchRecurringForDashboard,
  fetchValueByNatureForMonth,
} from "@/api/finance/dashboard";
import { fetchOpenTasksLite } from "@/api/tasks/tasks";
import { assembleFinanceTimeline } from "@/api/timeline";
import { buildAppAlerts } from "@/domain/alerts";
import { previousYearMonth } from "@/domain/finance/insights";
import { getRecurringDueAlerts } from "@/domain/recurring/alerts";
import { countOpenTaskBuckets, todayIsoDate } from "@/domain/tasks/listView";
import { addDaysIso, getTodayIso } from "@/domain/timeline";
import type { MonthlyBudgetSummary } from "@/types/finance";
import type { RecurringDueAlert } from "@/types/recurring";
import type { TimelineItem } from "@/types/timeline";

export type HubBudgetHighlight = {
  planned: number;
  spent: number;
  pct: number;
};

export type HubDaySummary = {
  habitsCount: number;
  habitsDone: number;
  tasksOverdue: number;
  tasksToday: number;
  nextPayment: RecurringDueAlert | null;
};

export type HubBundle = {
  year: number;
  month: number;
  receita: number;
  despesa: number;
  prevDespesa: number | null;
  budgetHighlight: HubBudgetHighlight | null;
  recurringAlerts: RecurringDueAlert[];
  alerts: AppAlert[];
  upcoming: TimelineItem[];
  latestTransactionAt: string | null;
  day: HubDaySummary;
};

function expenseBudgetRows(rows: MonthlyBudgetSummary[]): MonthlyBudgetSummary[] {
  const expenses = rows.filter((b) => /despesa/i.test(b.nature_name || ""));
  const parents = expenses.filter((b) => b.class_id == null);
  return parents.length > 0 ? parents : expenses;
}

function budgetHighlightFromRows(
  rows: MonthlyBudgetSummary[]
): HubBudgetHighlight | null {
  const list = expenseBudgetRows(rows);
  if (list.length === 0) return null;
  const planned = list.reduce((s, b) => s + Number(b.planned_value || 0), 0);
  const spent = list.reduce((s, b) => s + Number(b.spent_value || 0), 0);
  if (planned <= 0 && spent <= 0) return null;
  return {
    planned,
    spent,
    pct: planned > 0 ? (spent / planned) * 100 : 0,
  };
}

export async function loadHubBundle(): Promise<HubBundle> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const prev = previousYearMonth(year, month);
  const todayIso = getTodayIso(now);

  const [
    current,
    previous,
    budgets,
    recurring,
    latestAt,
    tasks,
  ] = await Promise.all([
    fetchValueByNatureForMonth(year, month),
    fetchValueByNatureForMonth(prev.year, prev.month),
    fetchMonthlyBudgetSummary(budgetMonthIso(year, month)),
    fetchRecurringForDashboard(),
    fetchLatestTransactionAt().catch(() => null),
    fetchOpenTasksLite().catch(() => []),
  ]);

  const taskBuckets = countOpenTaskBuckets(tasks, todayIsoDate());
  const recurringAlerts = getRecurringDueAlerts(recurring);
  const alerts = buildAppAlerts(recurring, budgets, taskBuckets.overdue);
  seedAppAlerts(alerts);

  const upcoming = assembleFinanceTimeline(recurring, 7, 0, tasks).filter(
    (item) => item.date >= todayIso && item.date <= addDaysIso(todayIso, 7)
  );

  return {
    year,
    month,
    receita: current?.receita_total ?? 0,
    despesa: current?.despesa_total ?? 0,
    prevDespesa: previous ? previous.despesa_total : null,
    budgetHighlight: budgetHighlightFromRows(budgets),
    recurringAlerts: recurringAlerts.slice(0, 3),
    alerts,
    upcoming,
    latestTransactionAt: latestAt,
    day: {
      habitsCount: 0,
      habitsDone: 0,
      tasksOverdue: taskBuckets.overdue,
      tasksToday: taskBuckets.today,
      nextPayment: recurringAlerts[0] ?? null,
    },
  };
}
