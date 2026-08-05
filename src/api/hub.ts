import { fetchGoals } from "@/api/goals";
import { fetchHabitsWithLogs } from "@/api/habits";
import { fetchTrips, fetchMilestonesForTrips } from "@/api/travel";
import { fetchPlacesCount } from "@/api/places";
import { fetchMovieListMeta } from "@/api/movies";
import {
  fetchLatestTransactionAt,
  fetchMonthlyBudgetSummary,
  fetchValueByNatureForMonth,
} from "@/api/finance";
import { fetchRecurringTransactions, getRecurringDueAlerts } from "@/api/recurring";
import {
  fetchVehicles,
  fetchMaintenancesForVehicles,
  fetchDocumentsForVehicles,
} from "@/api/car";
import {
  buildLifeDashboardSummary,
  fetchTimelineItems,
  getUpcomingTimeline,
} from "@/api/timeline";
import {
  buildAppAlertsFromDomains,
  enrichAppAlertsWithSeries,
  seedAppAlertsCache,
  type AppAlert,
} from "@/api/alerts";
import { getTodayIso } from "@/domain/habits";
import {
  calculateInstallments,
  resolvePaymentStartDate,
} from "@/domain/recurring";
import { previousYearMonth } from "@/domain/finance/insights";
import { supabase } from "@/lib/supabase";
import type { LifeDashboardSummary, TimelineItem } from "@/types/timeline";
import type { Habit, HabitLog } from "@/types/habits";
import type { MonthlyBudgetSummary, ValueByNatureYearMonth } from "@/types/finance";
import type { RecurringDueAlert, Recurring } from "@/types/recurring";
import type { Movie } from "@/types/movies";
import type { PersonalGoal } from "@/types/goals";
import type { Trip, TripMilestone } from "@/types/travel";
import type { Vehicle, Maintenance, VehicleDocument } from "@/types/car";

function budgetMonthIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export type HomeBundle = {
  summary: LifeDashboardSummary;
  timeline: TimelineItem[];
  upcoming: TimelineItem[];
  alerts: AppAlert[];
  habits: Habit[];
  habitLogs: HabitLog[];
  budgetRows: MonthlyBudgetSummary[];
  recurringAlerts: RecurringDueAlert[];
  lastMovie: Movie | null;
  latestTransactionAt: string | null;
  prevMonthTotals: { despesa_total: number } | null;
  year: number;
  month: number;
  /** Domínios para enriquecer alertas de série após o first paint. */
  alertDomains: {
    recurring: Recurring[];
    vehicles: Vehicle[];
    maintenances: Maintenance[];
    documents: VehicleDocument[];
    budgets: MonthlyBudgetSummary[];
    goals: PersonalGoal[];
  };
};

type HomeEdgePayload = {
  goals: PersonalGoal[];
  habits: Habit[];
  habitLogs: HabitLog[];
  trips: Trip[];
  placesCount: number;
  toWatchTotal: number;
  watchedLatest: Movie | null;
  financeMonth: ValueByNatureYearMonth | null;
  prevFinance: ValueByNatureYearMonth | null;
  recurring: Recurring[];
  vehicles: Vehicle[];
  maintenances: Maintenance[];
  documents: VehicleDocument[];
  milestones: TripMilestone[];
  budgets: MonthlyBudgetSummary[];
  latestAt: string | null;
  year: number;
  month: number;
};

async function fetchHomeDomainsViaEdge(
  year: number,
  month: number,
  todayIso: string
): Promise<HomeEdgePayload | null> {
  try {
    const { data, error } = await supabase.functions.invoke("home-bundle", {
      body: { year, month, today_iso: todayIso },
    });
    if (error || !data || data.error) return null;
    return data as HomeEdgePayload;
  } catch {
    return null;
  }
}

async function fetchHomeDomainsLocal(
  year: number,
  month: number,
  todayIso: string
): Promise<HomeEdgePayload> {
  const prev = previousYearMonth(year, month);
  const now = new Date(year, month - 1, 1);

  const [
    goals,
    habitsBundle,
    trips,
    placesCount,
    toWatchMeta,
    watchedMeta,
    financeMonth,
    prevFinance,
    recurring,
    vehicles,
    budgets,
    latestAt,
  ] = await Promise.all([
    fetchGoals().catch(() => []),
    fetchHabitsWithLogs({ fromDate: todayIso }),
    fetchTrips().catch(() => []),
    fetchPlacesCount().catch(() => 0),
    fetchMovieListMeta("to_watch").catch(() => ({
      total: 0,
      latest: null as Movie | null,
    })),
    fetchMovieListMeta("watched", { includeLatest: true }).catch(() => ({
      total: 0,
      latest: null as Movie | null,
    })),
    fetchValueByNatureForMonth(year, month).catch(() => null),
    fetchValueByNatureForMonth(prev.year, prev.month).catch(() => null),
    fetchRecurringTransactions().catch(() => []),
    fetchVehicles().catch(() => []),
    fetchMonthlyBudgetSummary(budgetMonthIso(now)).catch(() => []),
    fetchLatestTransactionAt().catch(() => null),
  ]);

  const activeTrips = trips.filter(
    (t) => t.status !== "cancelled" && t.status !== "completed"
  );
  const vehicleIds = vehicles.map((v) => v.id);

  const [maintenances, documents, milestones] = await Promise.all([
    vehicleIds.length
      ? fetchMaintenancesForVehicles(vehicleIds).catch(() => [])
      : Promise.resolve([]),
    vehicleIds.length
      ? fetchDocumentsForVehicles(vehicleIds).catch(() => [])
      : Promise.resolve([]),
    fetchMilestonesForTrips(activeTrips.map((t) => t.id)).catch(() => []),
  ]);

  return {
    goals,
    habits: habitsBundle.habits,
    habitLogs: habitsBundle.logs,
    trips,
    placesCount,
    toWatchTotal: toWatchMeta.total,
    watchedLatest: watchedMeta.latest,
    financeMonth,
    prevFinance,
    recurring,
    vehicles,
    maintenances,
    documents,
    milestones,
    budgets,
    latestAt,
    year,
    month,
  };
}

function assembleHomeBundle(domains: HomeEdgePayload): HomeBundle {
  const {
    goals,
    habits,
    habitLogs,
    trips,
    placesCount,
    toWatchTotal,
    watchedLatest,
    financeMonth,
    prevFinance,
    recurring,
    vehicles,
    maintenances,
    documents,
    budgets,
    latestAt,
    year,
    month,
  } = domains;

  const alerts = buildAppAlertsFromDomains({
    recurring,
    vehicles,
    maintenances,
    documents,
    budgets,
    goals,
    seriesAlerts: [],
  });
  void seedAppAlertsCache(alerts);

  const summary = buildLifeDashboardSummary({
    goals,
    habits,
    habitLogs,
    trips,
    placesCount,
    moviesToWatch: toWatchTotal,
    finance: financeMonth,
  });

  // timeline is async — caller awaits fetchTimeline in loadHomeBundle
  return {
    summary,
    timeline: [],
    upcoming: [],
    alerts,
    habits,
    habitLogs,
    budgetRows: budgets,
    recurringAlerts: [],
    lastMovie: watchedLatest,
    latestTransactionAt: latestAt,
    prevMonthTotals: prevFinance
      ? { despesa_total: prevFinance.despesa_total }
      : null,
    year,
    month,
    alertDomains: {
      recurring,
      vehicles,
      maintenances,
      documents,
      budgets,
      goals,
    },
  };
}

/**
 * Cold load do /home: tenta Edge `home-bundle` (1 request); fallback local.
 * Alertas de série (TMDB) ficam de fora — enriquecer com `enrichHomeAlertsWithSeries`.
 */
export async function loadHomeBundle(): Promise<HomeBundle> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const todayIso = getTodayIso(now);

  const domains =
    (await fetchHomeDomainsViaEdge(year, month, todayIso)) ??
    (await fetchHomeDomainsLocal(year, month, todayIso));

  const partial = assembleHomeBundle(domains);

  const timeline = await fetchTimelineItems(30, 7, {
    recurring: domains.recurring,
    vehicles: domains.vehicles,
    maintenances: domains.maintenances,
    documents: domains.documents,
    goals: domains.goals,
    trips: domains.trips,
    milestones: domains.milestones,
    habits: domains.habits,
    habitLogs: domains.habitLogs,
  });

  const upcoming = getUpcomingTimeline(timeline, 7);
  const withAlerts: LifeDashboardSummary = {
    ...partial.summary,
    overdueAlerts: timeline.filter((t) => t.status === "overdue").length,
    upcomingAlerts: timeline.filter(
      (t) => t.status === "upcoming" || t.status === "today"
    ).length,
  };

  const withInstallments = domains.recurring.map((rec) => ({
    ...rec,
    installments: calculateInstallments(
      resolvePaymentStartDate(rec),
      rec.due_day,
      rec.installment_count,
      rec.validity,
      rec.frequency
    ),
  }));

  return {
    ...partial,
    summary: withAlerts,
    timeline,
    upcoming,
    recurringAlerts: getRecurringDueAlerts(withInstallments).slice(0, 3),
  };
}

/** Depois do first paint: busca TMDB e atualiza sino + lista do hub. */
export async function enrichHomeAlertsWithSeries(
  domains: HomeBundle["alertDomains"]
): Promise<AppAlert[]> {
  return enrichAppAlertsWithSeries(domains);
}
