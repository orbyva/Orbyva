import {
  calculateInstallments,
  fetchRecurringTransactions,
  getRecurringDueAlerts,
  resolvePaymentStartDate,
} from "@/api/recurring";
import { fetchVehicles, fetchMaintenancesForVehicles, fetchDocumentsForVehicles } from "@/api/car";
import { fetchGoals } from "@/api/goals";
import { fetchHabits, fetchAllHabitLogs } from "@/api/habits";
import { fetchPlaces } from "@/api/places";
import { fetchTrips, fetchTripMilestones } from "@/api/travel";
import { fetchMovies } from "@/api/movies";
import { getMaintenanceAlerts, getDocumentAlerts } from "@/domain/car";
import { isCompletedToday } from "@/domain/habits";
import { getDaysUntil } from "@/domain/travel";
import { GOAL_CATEGORY_LABELS } from "@/domain/goals";
import type { TimelineItem, LifeDashboardSummary } from "@/types/timeline";
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

export async function fetchTimelineItems(
  daysAhead = 60,
  daysBehind = 14
): Promise<TimelineItem[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString().split("T")[0];
  const minDate = new Date(today);
  minDate.setDate(minDate.getDate() - daysBehind);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + daysAhead);
  const minIso = minDate.toISOString().split("T")[0];
  const maxIso = maxDate.toISOString().split("T")[0];

  const inRange = (date: string) => date >= minIso && date <= maxIso;

  const [financeItems, carItems, goalItems, travelItems, habitItems] =
    await Promise.all([
      collectFinanceTimeline(inRange, todayIso),
      collectCarTimeline(inRange, todayIso),
      collectGoalsTimeline(inRange, todayIso),
      collectTravelTimeline(inRange, todayIso),
      collectHabitsTimeline(todayIso),
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
  todayIso: string
): Promise<TimelineItem[]> {
  try {
    const recurring = await fetchRecurringTransactions();
    const withInstallments = recurring.map((rec) => ({
      ...rec,
      installments: calculateInstallments(
        resolvePaymentStartDate(rec),
        rec.due_day,
        rec.installment_count,
        rec.validity
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
  todayIso: string
): Promise<TimelineItem[]> {
  try {
    const vehicles = await fetchVehicles();
    if (vehicles.length === 0) return [];
    const vehicleIds = vehicles.map((v) => v.id);
    const [maintenances, documents] = await Promise.all([
      fetchMaintenancesForVehicles(vehicleIds),
      fetchDocumentsForVehicles(vehicleIds),
    ]);

    const items: TimelineItem[] = [];
    for (const vehicle of vehicles) {
      const vehicleMaint = maintenances.filter((m) => m.vehicle_id === vehicle.id);
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
  todayIso: string
): Promise<TimelineItem[]> {
  try {
    const goals = await fetchGoals();
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
  todayIso: string
): Promise<TimelineItem[]> {
  try {
    const trips = (await fetchTrips()).filter(
      (trip) => trip.status !== "cancelled" && trip.status !== "completed"
    );
    const perTrip = await Promise.all(
      trips.map(async (trip) => {
        const items: TimelineItem[] = [];
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
        const milestones = await fetchTripMilestones(trip.id);
        for (const m of milestones.filter((ms) => !ms.done)) {
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
        return items;
      })
    );
    return perTrip.flat();
  } catch {
    return [];
  }
}

async function collectHabitsTimeline(
  todayIso: string
): Promise<TimelineItem[]> {
  try {
    const [habits, logs] = await Promise.all([
      fetchHabits(),
      fetchAllHabitLogs(),
    ]);
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

export async function fetchLifeDashboardSummary(): Promise<LifeDashboardSummary> {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [
    goalsResult,
    habitsResult,
    tripsResult,
    placesResult,
    moviesResult,
    financeResult,
  ] = await Promise.allSettled([
    fetchGoals(),
    Promise.all([fetchHabits(), fetchAllHabitLogs()]),
    fetchTrips(),
    fetchPlaces(),
    fetchMovies("to_watch", 1, 1),
    fetchValueByNatureForMonth(year, month),
  ]);

  let activeGoals = 0;
  if (goalsResult.status === "fulfilled") {
    activeGoals = goalsResult.value.filter((g) => g.status === "active").length;
  }

  let habitsTodayTotal = 0;
  let habitsTodayDone = 0;
  if (habitsResult.status === "fulfilled") {
    const [habits, logs] = habitsResult.value;
    habitsTodayTotal = habits.length;
    habitsTodayDone = habits.filter((h) =>
      isCompletedToday(logs.filter((l) => l.habit_id === h.id))
    ).length;
  }

  let upcomingTrips = 0;
  if (tripsResult.status === "fulfilled") {
    upcomingTrips = tripsResult.value.filter(
      (t) =>
        t.status !== "cancelled" &&
        t.status !== "completed" &&
        getDaysUntil(t.start_date) >= 0
    ).length;
  }

  const totalPlaces =
    placesResult.status === "fulfilled" ? placesResult.value.length : 0;
  const moviesToWatch =
    moviesResult.status === "fulfilled" ? moviesResult.value.total : 0;

  let balance: number | undefined;
  let expenseTotal: number | undefined;
  if (financeResult.status === "fulfilled" && financeResult.value) {
    balance =
      financeResult.value.receita_total - financeResult.value.despesa_total;
    expenseTotal = financeResult.value.despesa_total;
  }

  // Alertas vêm do timeline na página — evita segundo fetch pesado aqui
  return {
    activeGoals,
    habitsTodayTotal,
    habitsTodayDone,
    upcomingTrips,
    totalPlaces,
    moviesToWatch,
    overdueAlerts: 0,
    upcomingAlerts: 0,
    balance,
    expenseTotal,
  };
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
