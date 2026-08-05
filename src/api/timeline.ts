import {
  calculateInstallments,
  fetchRecurringTransactions,
  getRecurringDueAlerts,
  resolvePaymentStartDate,
} from "@/api/recurring";
import {
  fetchVehicles,
  fetchMaintenancesForVehicles,
  fetchDocumentsForVehicles,
} from "@/api/car";
import { fetchGoals } from "@/api/goals";
import { fetchHabitsWithLogs } from "@/api/habits";
import { fetchPlaces } from "@/api/places";
import { fetchTrips, fetchMilestonesForTrips } from "@/api/travel";
import { fetchMovieListMeta } from "@/api/movies";
import { getMaintenanceAlerts, getDocumentAlerts } from "@/domain/car";
import { getTodayIso, isCompletedToday } from "@/domain/habits";
import { getDaysUntil } from "@/domain/travel";
import { GOAL_CATEGORY_LABELS } from "@/domain/goals";
import type { TimelineItem, LifeDashboardSummary } from "@/types/timeline";
import type { Habit, HabitLog } from "@/types/habits";
import type { PersonalGoal } from "@/types/goals";
import type { Trip, TripMilestone } from "@/types/travel";
import type { Vehicle, Maintenance, VehicleDocument } from "@/types/car";
import type { Recurring } from "@/types/recurring";
import { fetchValueByNatureForMonth } from "@/api/finance";

const MODULE_LABELS: Record<string, string> = {
  finance: "Finanças",
  car: "Veículos",
  travel: "Viagens",
  goals: "Metas",
  habits: "Hábitos",
  places: "Lugares",
  cinema: "Cinema",
};

export { MODULE_LABELS };

function resolveStatus(
  dateIso: string,
  todayIso: string,
  isOverdue = false
): TimelineItem["status"] {
  if (isOverdue || dateIso < todayIso) return "overdue";
  if (dateIso === todayIso) return "today";
  return "upcoming";
}

/** Dados de domínio já carregados — evita refetch no hub. */
export type TimelinePrefetch = {
  recurring?: Recurring[];
  vehicles?: Vehicle[];
  maintenances?: Maintenance[];
  documents?: VehicleDocument[];
  goals?: PersonalGoal[];
  trips?: Trip[];
  milestones?: TripMilestone[];
  habits?: Habit[];
  habitLogs?: HabitLog[];
};

/** Carrega domínios uma vez para Timeline / hub (sem TMDB). */
export async function loadTimelineDomains(): Promise<TimelinePrefetch> {
  const todayIso = getTodayIso();
  const [recurring, vehicles, goals, trips, habitsBundle] = await Promise.all([
    fetchRecurringTransactions().catch(() => [] as Recurring[]),
    fetchVehicles().catch(() => [] as Vehicle[]),
    fetchGoals().catch(() => [] as PersonalGoal[]),
    fetchTrips().catch(() => [] as Trip[]),
    fetchHabitsWithLogs({ fromDate: todayIso }).catch(() => ({
      habits: [] as Habit[],
      logs: [] as HabitLog[],
    })),
  ]);

  const vehicleIds = vehicles.map((v) => v.id);
  const activeTripIds = trips
    .filter((t) => t.status !== "cancelled" && t.status !== "completed")
    .map((t) => t.id);

  const [maintenances, documents, milestones] = await Promise.all([
    vehicleIds.length
      ? fetchMaintenancesForVehicles(vehicleIds).catch(() => [])
      : Promise.resolve([] as Maintenance[]),
    vehicleIds.length
      ? fetchDocumentsForVehicles(vehicleIds).catch(() => [])
      : Promise.resolve([] as VehicleDocument[]),
    fetchMilestonesForTrips(activeTripIds).catch(() => [] as TripMilestone[]),
  ]);

  return {
    recurring,
    vehicles,
    maintenances,
    documents,
    goals,
    trips,
    milestones,
    habits: habitsBundle.habits,
    habitLogs: habitsBundle.logs,
  };
}

export async function fetchTimelineItems(
  daysAhead = 60,
  daysBehind = 14,
  prefetch?: TimelinePrefetch
): Promise<TimelineItem[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = getTodayIso(today);
  const minDate = new Date(today);
  minDate.setDate(minDate.getDate() - daysBehind);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + daysAhead);
  const minIso = getTodayIso(minDate);
  const maxIso = getTodayIso(maxDate);

  const inRange = (date: string) => date >= minIso && date <= maxIso;

  const [financeItems, carItems, goalItems, travelItems, habitItems] =
    await Promise.all([
      collectFinanceTimeline(inRange, todayIso, prefetch?.recurring),
      collectCarTimeline(
        inRange,
        todayIso,
        prefetch
          ? {
              vehicles: prefetch.vehicles,
              maintenances: prefetch.maintenances,
              documents: prefetch.documents,
            }
          : undefined
      ),
      collectGoalsTimeline(inRange, todayIso, prefetch?.goals),
      collectTravelTimeline(
        inRange,
        todayIso,
        prefetch
          ? { trips: prefetch.trips, milestones: prefetch.milestones }
          : undefined
      ),
      collectHabitsTimeline(todayIso, prefetch),
    ]);

  const items = [
    ...financeItems,
    ...carItems,
    ...goalItems,
    ...travelItems,
    ...habitItems,
  ];

  return items.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const statusOrder = {
      overdue: 0,
      today: 1,
      upcoming: 2,
      completed: 3,
      info: 4,
    };
    return statusOrder[a.status] - statusOrder[b.status];
  });
}

async function collectFinanceTimeline(
  inRange: (date: string) => boolean,
  todayIso: string,
  recurringPrefetch?: Recurring[]
): Promise<TimelineItem[]> {
  try {
    const recurring =
      recurringPrefetch ?? (await fetchRecurringTransactions());
    const withInstallments = recurring.map((rec) => ({
      ...rec,
      installments: calculateInstallments(
        resolvePaymentStartDate(rec),
        rec.due_day,
        rec.installment_count,
        rec.validity,
        rec.frequency
      ),
    }));
    const alerts = getRecurringDueAlerts(withInstallments);
    const items: TimelineItem[] = [];
    for (const alert of alerts) {
      if (!inRange(alert.dueDate)) continue;
      items.push({
        id: `finance-${alert.recurring.id}-${alert.installmentNumber}`,
        date: alert.dueDate,
        module: "finance",
        title: alert.recurring.description || "Parcela",
        subtitle: `Parcela ${alert.installmentNumber}`,
        status:
          alert.status === "overdue"
            ? "overdue"
            : resolveStatus(alert.dueDate, todayIso),
        link: "/finance/recurring",
      });
    }
    return items;
  } catch {
    return [];
  }
}

async function collectCarTimeline(
  inRange: (date: string) => boolean,
  todayIso: string,
  prefetch?: {
    vehicles?: Vehicle[];
    maintenances?: Maintenance[];
    documents?: VehicleDocument[];
  }
): Promise<TimelineItem[]> {
  try {
    const vehicles = prefetch?.vehicles ?? (await fetchVehicles());
    if (vehicles.length === 0) return [];
    const vehicleIds = vehicles.map((v) => v.id);
    const [maintenances, documents] = await Promise.all([
      prefetch?.maintenances
        ? Promise.resolve(prefetch.maintenances)
        : fetchMaintenancesForVehicles(vehicleIds),
      prefetch?.documents
        ? Promise.resolve(prefetch.documents)
        : fetchDocumentsForVehicles(vehicleIds),
    ]);

    const items: TimelineItem[] = [];
    for (const vehicle of vehicles) {
      const vehicleMaint = maintenances.filter(
        (m) => m.vehicle_id === vehicle.id
      );
      const vehicleDocs = documents.filter((d) => d.vehicle_id === vehicle.id);
      const maintAlerts = getMaintenanceAlerts(vehicle, vehicleMaint);
      const docAlerts = getDocumentAlerts(vehicleDocs);

      for (const alert of maintAlerts) {
        const date = alert.nextDate ?? todayIso;
        if (!inRange(date)) continue;
        items.push({
          id: `car-maint-${vehicle.id}-${alert.type}`,
          date,
          module: "car",
          title: alert.label,
          subtitle: vehicle.plate ?? `${vehicle.brand} ${vehicle.model}`,
          status:
            alert.status === "overdue"
              ? "overdue"
              : resolveStatus(date, todayIso),
          link: "/car",
        });
      }
      for (const alert of docAlerts) {
        const date = alert.document.due_date;
        if (!inRange(date)) continue;
        items.push({
          id: `car-doc-${alert.document.id}`,
          date,
          module: "car",
          title: alert.message,
          status:
            alert.status === "overdue"
              ? "overdue"
              : resolveStatus(date, todayIso),
          link: "/car",
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

async function collectGoalsTimeline(
  inRange: (date: string) => boolean,
  todayIso: string,
  goalsPrefetch?: PersonalGoal[]
): Promise<TimelineItem[]> {
  try {
    const goals = goalsPrefetch ?? (await fetchGoals());
    const items: TimelineItem[] = [];
    for (const goal of goals.filter(
      (g) => g.status === "active" && g.deadline
    )) {
      const date = goal.deadline!;
      if (!inRange(date)) continue;
      items.push({
        id: `goal-${goal.id}`,
        date,
        module: "goals",
        title: goal.title,
        subtitle: GOAL_CATEGORY_LABELS[goal.category],
        status: resolveStatus(date, todayIso),
        link: "/goals",
      });
    }
    return items;
  } catch {
    return [];
  }
}

async function collectTravelTimeline(
  inRange: (date: string) => boolean,
  todayIso: string,
  prefetch?: { trips?: Trip[]; milestones?: TripMilestone[] }
): Promise<TimelineItem[]> {
  try {
    const trips = (
      prefetch?.trips ?? (await fetchTrips())
    ).filter(
      (trip) => trip.status !== "cancelled" && trip.status !== "completed"
    );

    const milestones =
      prefetch?.milestones ??
      (await fetchMilestonesForTrips(trips.map((t) => t.id)));

    const milestonesByTrip = new Map<string, TripMilestone[]>();
    for (const m of milestones) {
      const list = milestonesByTrip.get(m.trip_id) ?? [];
      list.push(m);
      milestonesByTrip.set(m.trip_id, list);
    }

    const items: TimelineItem[] = [];
    for (const trip of trips) {
      if (inRange(trip.start_date)) {
        items.push({
          id: `trip-start-${trip.id}`,
          date: trip.start_date,
          module: "travel",
          title: `Início: ${trip.title}`,
          subtitle: trip.destination ?? undefined,
          status: resolveStatus(trip.start_date, todayIso),
          link: `/travel/${trip.id}`,
        });
      }
      if (inRange(trip.end_date)) {
        items.push({
          id: `trip-end-${trip.id}`,
          date: trip.end_date,
          module: "travel",
          title: `Fim: ${trip.title}`,
          subtitle: trip.destination ?? undefined,
          status: resolveStatus(trip.end_date, todayIso),
          link: `/travel/${trip.id}`,
        });
      }
      for (const m of (milestonesByTrip.get(trip.id) ?? []).filter(
        (ms) => !ms.done
      )) {
        if (!inRange(m.due_date)) continue;
        const overdue = m.due_date < todayIso;
        items.push({
          id: `trip-ms-${m.id}`,
          date: m.due_date,
          module: "travel",
          title: m.title,
          subtitle: trip.title,
          status: overdue ? "overdue" : resolveStatus(m.due_date, todayIso),
          link: `/travel/${trip.id}`,
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

async function collectHabitsTimeline(
  todayIso: string,
  prefetch?: TimelinePrefetch
): Promise<TimelineItem[]> {
  try {
    let habits = prefetch?.habits;
    let logs = prefetch?.habitLogs;
    if (!habits || !logs) {
      const bundle = await fetchHabitsWithLogs({ fromDate: todayIso });
      habits = bundle.habits;
      logs = bundle.logs;
    }
    const items: TimelineItem[] = [];
    for (const habit of habits) {
      const habitLogs = logs.filter((l) => l.habit_id === habit.id);
      if (!isCompletedToday(habitLogs)) {
        items.push({
          id: `habit-${habit.id}-${todayIso}`,
          date: todayIso,
          module: "habits",
          title: habit.name,
          subtitle: "Hábito pendente hoje",
          status: "today",
          link: "/habits",
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

export function buildLifeDashboardSummary(input: {
  goals: PersonalGoal[];
  habits: Habit[];
  habitLogs: HabitLog[];
  trips: Trip[];
  placesCount: number;
  moviesToWatch: number;
  finance: { receita_total: number; despesa_total: number } | null;
}): LifeDashboardSummary {
  const activeGoals = input.goals.filter((g) => g.status === "active").length;
  const habitsTodayTotal = input.habits.length;
  const habitsTodayDone = input.habits.filter((h) =>
    isCompletedToday(input.habitLogs.filter((l) => l.habit_id === h.id))
  ).length;
  const upcomingTrips = input.trips.filter(
    (t) =>
      t.status !== "cancelled" &&
      t.status !== "completed" &&
      getDaysUntil(t.start_date) >= 0
  ).length;

  let balance: number | undefined;
  let expenseTotal: number | undefined;
  if (input.finance) {
    balance = input.finance.receita_total - input.finance.despesa_total;
    expenseTotal = input.finance.despesa_total;
  }

  return {
    activeGoals,
    habitsTodayTotal,
    habitsTodayDone,
    upcomingTrips,
    totalPlaces: input.placesCount,
    moviesToWatch: input.moviesToWatch,
    overdueAlerts: 0,
    upcomingAlerts: 0,
    balance,
    expenseTotal,
  };
}

export async function fetchLifeDashboardSummary(): Promise<LifeDashboardSummary> {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const todayIso = getTodayIso(now);

  const [
    goalsResult,
    habitsResult,
    tripsResult,
    placesResult,
    moviesResult,
    financeResult,
  ] = await Promise.allSettled([
    fetchGoals(),
    fetchHabitsWithLogs({ fromDate: todayIso }),
    fetchTrips(),
    fetchPlaces(),
    fetchMovieListMeta("to_watch"),
    fetchValueByNatureForMonth(year, month),
  ]);

  return buildLifeDashboardSummary({
    goals: goalsResult.status === "fulfilled" ? goalsResult.value : [],
    habits:
      habitsResult.status === "fulfilled" ? habitsResult.value.habits : [],
    habitLogs:
      habitsResult.status === "fulfilled" ? habitsResult.value.logs : [],
    trips: tripsResult.status === "fulfilled" ? tripsResult.value : [],
    placesCount:
      placesResult.status === "fulfilled" ? placesResult.value.length : 0,
    moviesToWatch:
      moviesResult.status === "fulfilled" ? moviesResult.value.total : 0,
    finance:
      financeResult.status === "fulfilled" ? financeResult.value : null,
  });
}

export function groupTimelineByDate(
  items: TimelineItem[]
): { date: string; dateLabel: string; items: TimelineItem[] }[] {
  const map = new Map<string, TimelineItem[]>();
  for (const item of items) {
    const group = map.get(item.date) ?? [];
    group.push(item);
    map.set(item.date, group);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, groupItems]) => ({
      date,
      dateLabel: date.split("-").reverse().join("/"),
      items: groupItems,
    }));
}

export function getUpcomingTimeline(
  items: TimelineItem[],
  days = 7
): TimelineItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const max = new Date(today);
  max.setDate(max.getDate() + days);
  const todayIso = today.toISOString().split("T")[0];
  const maxIso = max.toISOString().split("T")[0];

  return items.filter(
    (item) => item.date >= todayIso && item.date <= maxIso
  );
}
