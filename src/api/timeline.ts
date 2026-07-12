import {
  calculateInstallments,
  fetchRecurringTransactions,
  getRecurringDueAlerts,
  resolvePaymentStartDate,
} from "@/api/recurring";
import { fetchVehicles, fetchAllMaintenances, fetchDocuments } from "@/api/car";
import { fetchGoals } from "@/api/goals";
import { fetchHabits, fetchAllHabitLogs } from "@/api/habits";
import { fetchHomeProfiles, fetchHomeMaintenances } from "@/api/home";
import { fetchPlaces } from "@/api/places";
import { fetchTrips, fetchTripMilestones } from "@/api/travel";
import { getMaintenanceAlerts, getDocumentAlerts } from "@/domain/car";
import { getHomeMaintenanceSchedule } from "@/domain/home";
import { isCompletedToday } from "@/domain/habits";
import { getDaysUntil } from "@/domain/travel";
import { GOAL_CATEGORY_LABELS } from "@/domain/goals";
import type { TimelineItem, LifeDashboardSummary } from "@/types/timeline";
import { fetchValueByNatureForMonth } from "@/api/finance";

const MODULE_LABELS: Record<string, string> = {
  finance: "Finanças",
  car: "Carro",
  home: "Casa",
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

  const items: TimelineItem[] = [];

  const inRange = (date: string) => date >= minIso && date <= maxIso;

  // Finance - recurring installments
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

    for (const alert of alerts) {
      if (!inRange(alert.dueDate)) continue;
      items.push({
        id: `finance-${alert.recurring.id}-${alert.installmentNumber}`,
        date: alert.dueDate,
        module: "finance",
        title: alert.recurring.description || "Parcela",
        subtitle: `Parcela ${alert.installmentNumber}`,
        status: alert.status === "overdue" ? "overdue" : resolveStatus(alert.dueDate, todayIso),
        link: "/finance/recurring",
      });
    }
  } catch { /* tables may not exist yet */ }

  // Car
  try {
    const vehicles = await fetchVehicles();
    for (const vehicle of vehicles) {
      const [maintenances, documents] = await Promise.all([
        fetchAllMaintenances(vehicle.id),
        fetchDocuments(vehicle.id),
      ]);
      const maintAlerts = getMaintenanceAlerts(vehicle, maintenances);
      const docAlerts = getDocumentAlerts(documents);

      for (const alert of maintAlerts) {
        const date = alert.nextDate ?? todayIso;
        if (!inRange(date)) continue;
        items.push({
          id: `car-maint-${vehicle.id}-${alert.type}`,
          date,
          module: "car",
          title: alert.label,
          subtitle: vehicle.plate ?? `${vehicle.brand} ${vehicle.model}`,
          status: alert.status === "overdue" ? "overdue" : resolveStatus(date, todayIso),
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
          status: alert.status === "overdue" ? "overdue" : resolveStatus(date, todayIso),
          link: "/car",
        });
      }
    }
  } catch { /* ignore */ }

  // Home
  try {
    const homes = await fetchHomeProfiles();
    for (const home of homes) {
      const maintenances = await fetchHomeMaintenances(home.id);
      const schedule = getHomeMaintenanceSchedule(maintenances);
      for (const item of schedule) {
        if (!item.nextDate || !inRange(item.nextDate)) continue;
        if (item.status === "ok" || item.status === "none") continue;
        items.push({
          id: `home-${home.id}-${item.type}`,
          date: item.nextDate,
          module: "home",
          title: item.label,
          subtitle: home.name,
          status: item.status === "overdue" ? "overdue" : resolveStatus(item.nextDate, todayIso),
          link: "/home",
        });
      }
    }
  } catch { /* ignore */ }

  // Goals deadlines
  try {
    const goals = await fetchGoals();
    for (const goal of goals.filter((g) => g.status === "active" && g.deadline)) {
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
  } catch { /* ignore */ }

  // Travel
  try {
    const trips = await fetchTrips().then((t) =>
      t.filter((trip) => trip.status !== "cancelled" && trip.status !== "completed")
    );
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
    }
  } catch { /* ignore */ }

  // Habits today
  try {
    const [habits, logs] = await Promise.all([fetchHabits(), fetchAllHabitLogs()]);
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
  } catch { /* ignore */ }

  return items.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const statusOrder = { overdue: 0, today: 1, upcoming: 2, completed: 3, info: 4 };
    return statusOrder[a.status] - statusOrder[b.status];
  });
}

export async function fetchLifeDashboardSummary(): Promise<LifeDashboardSummary> {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  let activeGoals = 0;
  let habitsTodayTotal = 0;
  let habitsTodayDone = 0;
  let upcomingTrips = 0;
  let totalPlaces = 0;
  let overdueAlerts = 0;
  let upcomingAlerts = 0;
  let balance: number | undefined;
  let expenseTotal: number | undefined;

  try {
    const goals = await fetchGoals();
    activeGoals = goals.filter((g) => g.status === "active").length;
  } catch { /* ignore */ }

  try {
    const [habits, logs] = await Promise.all([fetchHabits(), fetchAllHabitLogs()]);
    habitsTodayTotal = habits.length;
    habitsTodayDone = habits.filter((h) =>
      isCompletedToday(logs.filter((l) => l.habit_id === h.id))
    ).length;
  } catch { /* ignore */ }

  try {
    const trips = await fetchTrips();
    upcomingTrips = trips.filter(
      (t) =>
        t.status !== "cancelled" &&
        t.status !== "completed" &&
        getDaysUntil(t.start_date) >= 0
    ).length;
  } catch { /* ignore */ }

  try {
    const places = await fetchPlaces();
    totalPlaces = places.length;
  } catch { /* ignore */ }

  try {
    const timeline = await fetchTimelineItems(30, 0);
    overdueAlerts = timeline.filter((t) => t.status === "overdue").length;
    upcomingAlerts = timeline.filter(
      (t) => t.status === "upcoming" || t.status === "today"
    ).length;
  } catch { /* ignore */ }

  try {
    const finance = await fetchValueByNatureForMonth(year, month);
    if (finance) {
      balance = finance.receita_total - finance.despesa_total;
      expenseTotal = finance.despesa_total;
    }
  } catch { /* ignore */ }

  return {
    activeGoals,
    habitsTodayTotal,
    habitsTodayDone,
    upcomingTrips,
    totalPlaces,
    overdueAlerts,
    upcomingAlerts,
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
