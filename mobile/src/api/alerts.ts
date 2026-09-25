import { fetchFleetOverview } from "@/api/car/car";
import {
  budgetMonthIso,
  fetchMonthlyBudgetSummary,
  fetchRecurringForDashboard,
} from "@/api/finance/dashboard";
import { fetchGoals } from "@/api/goals/goals";
import { fetchTvAirEpisodesTmdb, parseTmdbTvId } from "@/api/movies/catalog";
import { fetchEpisodesForSeries } from "@/api/movies/episodes";
import { fetchSeriesWithEpisodeNotify } from "@/api/movies/movies";
import { fetchTasks } from "@/api/tasks/tasks";
import {
  buildAppAlerts,
  daysUntilIso,
  pickEpisodeForAlert,
  type AppAlert,
} from "@/domain/alerts";
import { countOpenTaskBuckets, todayIsoDate } from "@/domain/tasks/listView";
import { tmdbApiKey } from "@/lib/env";

export type { AppAlert };
export type { AppAlertKind } from "@/domain/alerts";

const SERIES_ALERT_MAX = 8;

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

export function invalidateAppAlertsCache() {
  alertsCache = null;
}

export function subscribeAppAlerts(listener: (alerts: AppAlert[]) => void) {
  listeners.add(listener);
  if (alertsCache) listener(alertsCache);
  return () => {
    listeners.delete(listener);
  };
}

export function peekAppAlerts(): AppAlert[] | null {
  return alertsCache;
}

async function loadSeriesEpisodeAlerts(): Promise<AppAlert[]> {
  if (!tmdbApiKey) return [];
  try {
    const series = await fetchSeriesWithEpisodeNotify();
    if (series.length === 0) return [];
    const alerts: AppAlert[] = [];
    await Promise.all(
      series.slice(0, SERIES_ALERT_MAX).map(async (movie) => {
        const tmdbId = parseTmdbTvId(movie.imdb_id, movie.tmdb_tv_id);
        if (!tmdbId) return;
        const [meta, progress] = await Promise.all([
          fetchTvAirEpisodesTmdb(tmdbId),
          fetchEpisodesForSeries(movie.imdb_id).catch(() => []),
        ]);
        if (!meta) return;
        const ep = pickEpisodeForAlert(meta);
        if (!ep?.air_date) return;
        const watched = progress.some(
          (p) =>
            p.season_number === ep.season_number &&
            p.episode_number === ep.episode_number &&
            p.status === "watched"
        );
        if (watched) return;
        const d = daysUntilIso(ep.air_date);
        const label = `T${ep.season_number}E${ep.episode_number}`;
        const epName = ep.name?.trim();
        alerts.push({
          id: `series-${movie.imdb_id}-${ep.season_number}-${ep.episode_number}`,
          kind: "series_episode",
          severity: d === 0 ? "warning" : "info",
          title: movie.title,
          message:
            d === 0
              ? `${label}${epName ? ` · ${epName}` : ""} sai hoje.`
              : d < 0
                ? `${label}${epName ? ` · ${epName}` : ""} disponível (${Math.abs(d)} dia${Math.abs(d) === 1 ? "" : "s"}).`
                : `${label} em breve.`,
          href: "/movies",
        });
      })
    );
    return alerts;
  } catch {
    return [];
  }
}

async function loadAppAlertsFresh(): Promise<AppAlert[]> {
  const now = new Date();
  const [recurring, budgets, tasks, fleet, goals] = await Promise.all([
    fetchRecurringForDashboard(),
    fetchMonthlyBudgetSummary(
      budgetMonthIso(now.getFullYear(), now.getMonth() + 1)
    ).catch(() => []),
    fetchTasks().catch(() => []),
    fetchFleetOverview().catch(() => ({
      vehicles: [],
      maintenances: [],
      documents: [],
      fuelLogs: [],
    })),
    fetchGoals().catch(() => []),
  ]);
  const overdueTasks = countOpenTaskBuckets(tasks, todayIsoDate()).overdue;
  return buildAppAlerts({
    recurring,
    budgets,
    overdueTasks,
    vehicles: fleet.vehicles,
    maintenances: fleet.maintenances,
    documents: fleet.documents,
    goals,
    seriesAlerts: [],
  });
}

export async function fetchAppAlerts(): Promise<AppAlert[]> {
  const base = await loadAppAlertsFresh();
  seedAppAlerts(base);
  void loadSeriesEpisodeAlerts()
    .then((seriesAlerts) => {
      if (!alertsCache) return;
      const without = alertsCache.filter((a) => a.kind !== "series_episode");
      if (seriesAlerts.length === 0) {
        seedAppAlerts(without);
        return;
      }
      const order = { danger: 0, warning: 1, info: 2, success: 3 };
      seedAppAlerts(
        [...without, ...seriesAlerts].sort(
          (a, b) => order[a.severity] - order[b.severity]
        )
      );
    })
    .catch(() => undefined);
  return peekAppAlerts() ?? base;
}
