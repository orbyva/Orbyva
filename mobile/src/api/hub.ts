import { type AppAlert } from "@/api/alerts";
import {
  budgetMonthIso,
  fetchLatestTransactionAt,
  fetchMonthlyBudgetSummary,
  fetchRecurringForDashboard,
  fetchValueByNatureForMonth,
} from "@/api/finance/dashboard";
import { fetchHubHabits, isCompletedToday } from "@/api/life/hubExtras";
import { fetchMovieListMeta } from "@/api/movies/movies";
import { fetchOpenTasksLite } from "@/api/tasks/tasks";
import { fetchFinanceTimeline } from "@/api/timeline";
import { buildAppAlerts } from "@/domain/alerts";
import { previousYearMonth } from "@/domain/finance/insights";
import { getRecurringDueAlerts } from "@/domain/recurring/alerts";
import { countOpenTaskBuckets, todayIsoDate } from "@/domain/tasks/listView";
import { addDaysIso, getTodayIso } from "@/domain/timeline";
import type { MonthlyBudgetSummary } from "@/types/finance";
import type { RecurringDueAlert } from "@/types/recurring";
import type { Movie } from "@/types/movies";
import type { TimelineItem } from "@/types/timeline";

export type HubBudgetHighlight = {
  planned: number;
  spent: number;
  pct: number;
};

export type HubHabitToday = {
  id: string;
  name: string;
  done: boolean;
};

export type HubDaySummary = {
  habitsCount: number;
  habitsDone: number;
  habits: HubHabitToday[];
  tasksOverdue: number;
  tasksToday: number;
  nextPayment: RecurringDueAlert | null;
  lastMovie: Movie | null;
  moviesToWatch: number;
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
  recent: TimelineItem[];
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
    hubHabits,
    toWatchMeta,
    watchedMeta,
  ] = await Promise.all([
    fetchValueByNatureForMonth(year, month),
    fetchValueByNatureForMonth(prev.year, prev.month),
    fetchMonthlyBudgetSummary(budgetMonthIso(year, month)),
    fetchRecurringForDashboard(),
    fetchLatestTransactionAt().catch(() => null),
    fetchOpenTasksLite().catch(() => []),
    fetchHubHabits(todayIso).catch(() => ({ habits: [], logs: [] })),
    fetchMovieListMeta("to_watch").catch(() => ({ total: 0, latest: null })),
    fetchMovieListMeta("watched", { includeLatest: true }).catch(() => ({
      total: 0,
      latest: null,
    })),
  ]);

  const taskBuckets = countOpenTaskBuckets(tasks, todayIsoDate());
  const recurringAlerts = getRecurringDueAlerts(recurring);
  const alerts = buildAppAlerts({
    recurring,
    budgets,
    overdueTasks: taskBuckets.overdue,
  });

  const timeline = await fetchFinanceTimeline(7, 14).catch(() => []);
  const upcoming = timeline.filter(
    (item) =>
      item.status !== "completed" &&
      item.date >= todayIso &&
      item.date <= addDaysIso(todayIso, 7)
  );
  const recent = timeline
    .filter((item) => item.status === "completed" || item.date < todayIso)
    .sort((a, b) => b.date.localeCompare(a.date));

  const habitRows = hubHabits.habits.map((habit) => ({
    id: habit.id,
    name: habit.name,
    done: isCompletedToday(
      hubHabits.logs.filter((log) => log.habit_id === habit.id),
      todayIso
    ),
  }));

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
    recent,
    latestTransactionAt: latestAt,
    day: {
      habitsCount: habitRows.length,
      habitsDone: habitRows.filter((habit) => habit.done).length,
      habits: habitRows,
      tasksOverdue: taskBuckets.overdue,
      tasksToday: taskBuckets.today,
      nextPayment: recurringAlerts[0] ?? null,
      lastMovie: watchedMeta.latest,
      moviesToWatch: toWatchMeta.total,
    },
  };
}
