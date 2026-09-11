import { fetchAllBooks } from "@/api/books/books";
import { fetchFleetOverview } from "@/api/car/car";
import { fetchRecurringForDashboard } from "@/api/finance/dashboard";
import { fetchGoals } from "@/api/goals/goals";
import { fetchHabitsWithLogs } from "@/api/habits/habits";
import { fetchAllMovies } from "@/api/movies/movies";
import { fetchAllAlbums } from "@/api/music/albums";
import { fetchPlaces } from "@/api/places/places";
import { fetchTasks } from "@/api/tasks/tasks";
import { fetchTrips } from "@/api/travel/travel";
import { getLatestReadDate } from "@/domain/books";
import { getDocumentAlerts, getMaintenanceAlerts } from "@/domain/car";
import { isCompletedToday } from "@/domain/habits";
import { getLatestWatchedDate } from "@/domain/movies";
import { getLatestListenedDate } from "@/domain/music";
import {
  addDaysIso,
  getTodayIso,
  resolveTimelineStatus,
} from "@/domain/timeline";
import { openTopLevelTasks } from "@/domain/tasks/listView";
import { formatBRL } from "@/lib/currency";
import type { Recurring } from "@/types/recurring";
import type { PersonalGoal } from "@/types/goals";
import type { Book } from "@/types/books";
import type { Maintenance, Vehicle, VehicleDocument } from "@/types/car";
import type { Habit, HabitLog } from "@/types/habits";
import type { Movie } from "@/types/movies";
import { MovieStatus } from "@/types/movies";
import type { Album } from "@/types/music";
import type { PlaceVisit } from "@/types/places";
import type { Task } from "@/types/tasks";
import type { TimelineItem, TimelineModule } from "@/types/timeline";
import type { Trip } from "@/types/travel";

const STATUS_ORDER: Record<TimelineItem["status"], number> = {
  overdue: 0,
  today: 1,
  upcoming: 2,
  completed: 3,
  info: 4,
};

function inWindow(date: string, minIso: string, maxIso: string): boolean {
  return date >= minIso && date <= maxIso;
}

function collectRecurringItems(
  recurring: Recurring[],
  todayIso: string,
  minIso: string,
  maxIso: string
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const rec of recurring) {
    if (!Array.isArray(rec.installments)) continue;
    const paid = rec.paid_parcels || [];
    for (const installment of rec.installments) {
      if (paid.includes(installment.number)) continue;
      if (!inWindow(installment.dueDate, minIso, maxIso)) continue;
      const overdue = installment.dueDate < todayIso;
      items.push({
        id: `finance-${rec.id}-${installment.number}`,
        date: installment.dueDate,
        module: "finance",
        title: rec.description || rec.class?.name || "Parcela",
        subtitle: `Parcela ${installment.number} · ${formatBRL(Number(rec.value) || 0)}`,
        status: resolveTimelineStatus(installment.dueDate, todayIso, overdue),
        href: "/finance",
      });
    }
  }
  return items;
}

function collectTaskItems(
  tasks: Task[],
  todayIso: string,
  minIso: string,
  maxIso: string
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const task of openTopLevelTasks(tasks)) {
    if (task.is_medication || task.is_consultation) continue;
    if (!task.due_date) continue;
    if (!inWindow(task.due_date, minIso, maxIso)) continue;
    const overdue = task.due_date < todayIso;
    items.push({
      id: `task-${task.id}`,
      date: task.due_date,
      module: "tasks",
      title: task.title,
      subtitle: overdue ? "Tarefa atrasada" : "Tarefa",
      status: resolveTimelineStatus(task.due_date, todayIso, overdue),
      href: "/tasks",
    });
  }
  return items;
}

function collectHealthItems(
  tasks: Task[],
  todayIso: string,
  minIso: string,
  maxIso: string
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const task of tasks) {
    if (!task.is_medication && !task.is_consultation) continue;
    if (task.status === "done") continue;
    if (!task.due_date || !inWindow(task.due_date, minIso, maxIso)) continue;
    const overdue = task.due_date < todayIso;
    items.push({
      id: `health-${task.id}`,
      date: task.due_date,
      module: "habits",
      title: task.title,
      subtitle: task.is_consultation ? "Consulta" : "Dose",
      status: resolveTimelineStatus(task.due_date, todayIso, overdue),
      href: "/health",
    });
  }
  return items;
}

function collectGoalItems(
  goals: PersonalGoal[],
  todayIso: string,
  minIso: string,
  maxIso: string
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const goal of goals) {
    if (goal.status !== "active" || !goal.deadline) continue;
    if (!inWindow(goal.deadline, minIso, maxIso)) continue;
    const overdue = goal.deadline < todayIso;
    items.push({
      id: `goal-${goal.id}`,
      date: goal.deadline,
      module: "goals",
      title: goal.title,
      subtitle: "Prazo da meta",
      status: resolveTimelineStatus(goal.deadline, todayIso, overdue),
      href: "/goals",
    });
  }
  return items;
}

function collectTripItems(
  trips: Trip[],
  todayIso: string,
  minIso: string,
  maxIso: string
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const trip of trips) {
    if (trip.status === "cancelled") continue;
    for (const [date, subtitle] of [
      [trip.start_date, "Início da viagem"],
      [trip.end_date, "Fim da viagem"],
    ] as const) {
      if (!inWindow(date, minIso, maxIso)) continue;
      items.push({
        id: `travel-${trip.id}-${subtitle}`,
        date,
        module: "travel",
        title: trip.title,
        subtitle,
        status: resolveTimelineStatus(date, todayIso, date < todayIso),
        href: "/travel",
      });
    }
  }
  return items;
}

function collectContentItems(
  movies: Movie[],
  books: Book[],
  albums: Album[],
  todayIso: string,
  minIso: string,
  maxIso: string
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const movie of movies) {
    if (movie.status !== MovieStatus.WATCHED) continue;
    const date = getLatestWatchedDate(movie.watched_dates);
    if (!date || !inWindow(date, minIso, maxIso)) continue;
    items.push({
      id: `cinema-${movie.imdb_id}`,
      date,
      module: "cinema",
      title: movie.title,
      subtitle: "Assistido",
      status: date === todayIso ? "today" : "completed",
      href: "/movies",
    });
  }
  for (const book of books) {
    if (book.status !== "read") continue;
    const date = getLatestReadDate(book.read_dates);
    if (!date || !inWindow(date, minIso, maxIso)) continue;
    items.push({
      id: `book-${book.google_id}`,
      date,
      module: "cinema",
      title: book.title,
      subtitle: "Lido",
      status: date === todayIso ? "today" : "completed",
      href: "/books",
    });
  }
  for (const album of albums) {
    if (album.status !== "listened") continue;
    const date = getLatestListenedDate(album.listened_dates);
    if (!date || !inWindow(date, minIso, maxIso)) continue;
    items.push({
      id: `album-${album.musicbrainz_id}`,
      date,
      module: "cinema",
      title: album.title,
      subtitle: "Ouvido",
      status: date === todayIso ? "today" : "completed",
      href: "/music",
    });
  }
  return items;
}

function collectCarItems(
  vehicles: Vehicle[],
  maintenances: Maintenance[],
  documents: VehicleDocument[],
  todayIso: string,
  minIso: string,
  maxIso: string
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const vehicle of vehicles) {
    const vehicleMaint = maintenances.filter((m) => m.vehicle_id === vehicle.id);
    const vehicleDocs = documents.filter((d) => d.vehicle_id === vehicle.id);
    const plate = vehicle.plate ?? `${vehicle.brand} ${vehicle.model}`.trim();
    for (const alert of getMaintenanceAlerts(vehicle, vehicleMaint)) {
      const date = alert.nextDate ?? todayIso;
      if (!inWindow(date, minIso, maxIso)) continue;
      items.push({
        id: `car-maint-${vehicle.id}-${alert.type}`,
        date,
        module: "car",
        title: alert.label,
        subtitle: plate,
        status:
          alert.status === "overdue"
            ? "overdue"
            : resolveTimelineStatus(date, todayIso),
        href: "/cars",
      });
    }
    for (const alert of getDocumentAlerts(vehicleDocs)) {
      const date = alert.document.due_date;
      if (!inWindow(date, minIso, maxIso)) continue;
      items.push({
        id: `car-doc-${alert.document.id}`,
        date,
        module: "car",
        title: alert.message,
        subtitle: plate,
        status:
          alert.status === "overdue"
            ? "overdue"
            : resolveTimelineStatus(date, todayIso),
        href: "/cars",
      });
    }
  }
  return items;
}

function collectHabitItems(
  habits: Habit[],
  logs: HabitLog[],
  todayIso: string
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const habit of habits) {
    const habitLogs = logs.filter((l) => l.habit_id === habit.id);
    if (isCompletedToday(habitLogs, todayIso)) continue;
    items.push({
      id: `habit-${habit.id}-${todayIso}`,
      date: todayIso,
      module: "habits",
      title: habit.name,
      subtitle: "Hábito pendente hoje",
      status: "today",
      href: "/habits",
    });
  }
  return items;
}

function collectPlaceItems(
  places: PlaceVisit[],
  todayIso: string,
  minIso: string,
  maxIso: string
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const place of places) {
    const date = place.visited_date;
    if (!date || !inWindow(date, minIso, maxIso)) continue;
    items.push({
      id: `place-${place.id}`,
      date,
      module: "places",
      title: place.name,
      subtitle: place.status === "visited" ? "Visitado" : "Lugar",
      status: date === todayIso ? "today" : "completed",
      href: "/places",
    });
  }
  return items;
}

function sortTimeline(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  });
}

export const TIMELINE_MODULE_LABELS: Record<TimelineModule, string> = {
  finance: "Finanças",
  tasks: "Tarefas",
  car: "Veículos",
  travel: "Viagens",
  goals: "Metas",
  habits: "Hábitos",
  places: "Lugares",
  cinema: "Conteúdo",
};

/** Timeline: finanças, tarefas, vida e conteúdo. */
export async function fetchFinanceTimeline(
  daysAhead = 90,
  daysBehind = 14
): Promise<TimelineItem[]> {
  const [recurring, tasks, trips, goals, movies, books, albums, fleet, habitsBundle, places] =
    await Promise.all([
      fetchRecurringForDashboard(),
      fetchTasks().catch(() => []),
      fetchTrips().catch(() => []),
      fetchGoals().catch(() => []),
      fetchAllMovies().catch(() => []),
      fetchAllBooks().catch(() => []),
      fetchAllAlbums().catch(() => []),
      fetchFleetOverview().catch(() => ({
        vehicles: [],
        maintenances: [],
        documents: [],
        fuelLogs: [],
      })),
      fetchHabitsWithLogs().catch(() => ({ habits: [], logs: [] })),
      fetchPlaces().catch(() => []),
    ]);
  return assembleFinanceTimeline(
    recurring,
    daysAhead,
    daysBehind,
    tasks,
    trips,
    goals,
    movies,
    books,
    albums,
    {
      vehicles: fleet.vehicles,
      maintenances: fleet.maintenances,
      documents: fleet.documents,
      habits: habitsBundle.habits,
      habitLogs: habitsBundle.logs,
      places,
    }
  );
}

export function assembleFinanceTimeline(
  recurring: Recurring[],
  daysAhead: number,
  daysBehind: number,
  tasks: Task[] = [],
  trips: Trip[] = [],
  goals: PersonalGoal[] = [],
  movies: Movie[] = [],
  books: Book[] = [],
  albums: Album[] = [],
  extra?: {
    vehicles?: Vehicle[];
    maintenances?: Maintenance[];
    documents?: VehicleDocument[];
    habits?: Habit[];
    habitLogs?: HabitLog[];
    places?: PlaceVisit[];
  }
): TimelineItem[] {
  const todayIso = getTodayIso();
  const minIso = addDaysIso(todayIso, -daysBehind);
  const maxIso = addDaysIso(todayIso, daysAhead);
  return sortTimeline([
    ...collectRecurringItems(recurring, todayIso, minIso, maxIso),
    ...collectTaskItems(tasks, todayIso, minIso, maxIso),
    ...collectHealthItems(tasks, todayIso, minIso, maxIso),
    ...collectTripItems(trips, todayIso, minIso, maxIso),
    ...collectGoalItems(goals, todayIso, minIso, maxIso),
    ...collectContentItems(movies, books, albums, todayIso, minIso, maxIso),
    ...collectCarItems(
      extra?.vehicles ?? [],
      extra?.maintenances ?? [],
      extra?.documents ?? [],
      todayIso,
      minIso,
      maxIso
    ),
    ...collectHabitItems(extra?.habits ?? [], extra?.habitLogs ?? [], todayIso),
    ...collectPlaceItems(extra?.places ?? [], todayIso, minIso, maxIso),
  ]);
}
