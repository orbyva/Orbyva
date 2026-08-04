import { fetchRecurringTransactions } from "@/api/recurring";
import {
  fetchVehicles,
  fetchMaintenancesForVehicles,
  fetchDocumentsForVehicles,
} from "@/api/car";
import { fetchMonthlyBudgetSummary } from "@/api/finance";
import { fetchGoals } from "@/api/goals";
import { fetchSeriesWithEpisodeNotify } from "@/api/movies";
import { fetchEpisodesForSeries } from "@/api/movieEpisodes";
import {
  calculateInstallments,
  getRecurringDueAlerts,
  resolvePaymentStartDate,
} from "@/domain/recurring";
import { getDocumentAlerts, getMaintenanceAlerts } from "@/domain/car";
import { getCurrentUserId } from "@/lib/auth-user";
import {
  fetchTvMetaTmdb,
  isTmdbConfigured,
  parseTmdbTvId,
  type TmdbAirEpisode,
} from "@/lib/tmdb";
import type { RecurringDueAlert } from "@/types/recurring";

export type AppAlertKind =
  | "recurring_overdue"
  | "recurring_upcoming"
  | "maintenance"
  | "document"
  | "budget"
  | "goal_due"
  | "goal_overdue"
  | "series_episode";

export type AppAlert = {
  id: string;
  kind: AppAlertKind;
  severity: "danger" | "warning" | "info" | "success";
  title: string;
  message: string;
  href: string;
};

const ALERTS_TTL_MS = 90_000;
/** Só alerta episódios que estrearam há no máx. N dias (ou saem hoje). */
const SERIES_ALERT_LOOKBACK_DAYS = 14;
const SERIES_ALERT_MAX = 8;

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

function pickEpisodeForAlert(
  meta: {
    last_episode_to_air?: TmdbAirEpisode | null;
    next_episode_to_air?: TmdbAirEpisode | null;
  }
): TmdbAirEpisode | null {
  const last = meta.last_episode_to_air;
  const next = meta.next_episode_to_air;
  if (next?.air_date) {
    const d = daysUntil(next.air_date.slice(0, 10));
    if (d <= 0 && d >= -SERIES_ALERT_LOOKBACK_DAYS) return next;
  }
  if (last?.air_date) {
    const d = daysUntil(last.air_date.slice(0, 10));
    if (d <= 0 && d >= -SERIES_ALERT_LOOKBACK_DAYS) return last;
  }
  return null;
}

export function invalidateAppAlertsCache() {
  alertsCache = null;
  alertsInflight = null;
}

async function loadSeriesEpisodeAlerts(): Promise<AppAlert[]> {
  if (!isTmdbConfigured()) return [];

  try {
    const series = await fetchSeriesWithEpisodeNotify();
    if (series.length === 0) return [];

    const limited = series.slice(0, SERIES_ALERT_MAX);
    const alerts: AppAlert[] = [];

    await Promise.all(
      limited.map(async (movie) => {
        const tmdbId = parseTmdbTvId(movie.imdb_id, movie.tmdb_tv_id);
        if (!tmdbId) return;

        const [meta, progress] = await Promise.all([
          fetchTvMetaTmdb(tmdbId),
          fetchEpisodesForSeries(movie.imdb_id),
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

        const air = ep.air_date.slice(0, 10);
        const d = daysUntil(air);
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
  const alerts: AppAlert[] = [];

  const [recurringResult, vehiclesResult, budgetResult, goalsResult, seriesResult] =
    await Promise.allSettled([
      fetchRecurringTransactions(),
      fetchVehicles(),
      fetchMonthlyBudgetSummary(budgetMonthIso()),
      fetchGoals(),
      loadSeriesEpisodeAlerts(),
    ]);

  if (recurringResult.status === "fulfilled") {
    const withInstallments = recurringResult.value.map((rec) => ({
      ...rec,
      installments: calculateInstallments(
        resolvePaymentStartDate(rec),
        rec.due_day,
        rec.installment_count,
        rec.validity,
        rec.frequency
      ),
    }));
    for (const a of getRecurringDueAlerts(withInstallments)) {
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
      const isIncome = row.nature_name === "Receita";
      alerts.push({
        id: `budget-${row.id}`,
        kind: "budget",
        severity: isIncome ? "success" : "danger",
        title: isIncome
          ? "Receita acima do previsto"
          : "Orçamento estourado",
        message: isIncome
          ? `${name} superou a meta — ótimo sinal.`
          : `${name} passou do planejado.`,
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

  if (seriesResult.status === "fulfilled") {
    alerts.push(...seriesResult.value);
  }

  const order = { danger: 0, warning: 1, info: 2, success: 3 };
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
