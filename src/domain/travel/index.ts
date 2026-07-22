import type {
  Trip,
  TripChecklistCategory,
  TripChecklistItem,
  TripExpense,
  TripFull,
  TripItineraryDay,
  TripMilestone,
  TripWithChecklist,
} from "@/types/travel";
import { sumTripSpent } from "@/domain/travel/spent";

export const TRIP_STATUS_LABELS: Record<string, string> = {
  planning: "Planejando",
  upcoming: "Próxima",
  ongoing: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export const CHECKLIST_CATEGORY_LABELS: Record<string, string> = {
  documents: "Documentos",
  transport: "Transporte",
  lodging: "Hospedagem",
  packing: "Mala",
  other: "Outro",
};

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  transport: "Transporte",
  lodging: "Hospedagem",
  food: "Alimentação",
  activity: "Passeio",
  shopping: "Compras",
  other: "Outro",
};

export const MILESTONE_TYPE_LABELS: Record<string, string> = {
  flight: "Voo",
  hotel: "Hotel",
  document: "Documento",
  activity: "Atividade",
  other: "Outro",
};

export const DEFAULT_CHECKLIST_TEMPLATE: {
  title: string;
  category: TripChecklistCategory;
}[] = [
  { title: "Verificar documentos (RG/passaporte)", category: "documents" },
  { title: "Contratar seguro viagem", category: "documents" },
  { title: "Reservar passagem/transporte", category: "transport" },
  { title: "Reservar hospedagem", category: "lodging" },
  { title: "Fazer check-in online", category: "transport" },
  { title: "Separar roupas e mala", category: "packing" },
  { title: "Carregar adaptador/tomada", category: "packing" },
  { title: "Baixar mapas offline", category: "other" },
];

export function getDaysUntil(dateIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateIso}T12:00:00`);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function getTripDuration(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

export function generateItineraryDays(
  tripId: string,
  startDate: string,
  endDate: string
): Omit<TripItineraryDay, "id" | "activities">[] {
  const duration = getTripDuration(startDate, endDate);
  const days: Omit<TripItineraryDay, "id" | "activities">[] = [];
  const start = new Date(`${startDate}T12:00:00`);

  for (let i = 0; i < duration; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    days.push({
      trip_id: tripId,
      day_number: i + 1,
      date: date.toISOString().split("T")[0],
      title: `Dia ${i + 1}`,
      notes: null,
    });
  }
  return days;
}

export function enrichTrip(
  trip: Trip,
  checklist: TripChecklistItem[]
): TripWithChecklist {
  const done = checklist.filter((c) => c.done).length;
  const daysUntilStart = getDaysUntil(trip.start_date);

  let status = trip.status;
  if (status !== "cancelled" && status !== "completed") {
    if (daysUntilStart < 0 && getDaysUntil(trip.end_date) >= 0) status = "ongoing";
    else if (daysUntilStart >= 0 && daysUntilStart <= 30) status = "upcoming";
    else if (daysUntilStart > 30) status = "planning";
    else if (getDaysUntil(trip.end_date) < 0) status = "completed";
  }

  return {
    ...trip,
    status,
    checklist,
    checklistProgress:
      checklist.length > 0 ? Math.round((done / checklist.length) * 100) : 0,
    daysUntilStart: daysUntilStart >= 0 ? daysUntilStart : null,
  };
}

export function enrichTripFull(
  trip: Trip,
  checklist: TripChecklistItem[],
  expenses: TripExpense[],
  itinerary: TripItineraryDay[],
  milestones: TripMilestone[],
  placesCount: number,
  sharedTrip = false
): TripFull {
  const base = enrichTrip(trip, checklist);
  const expenseTotal = sumTripSpent(expenses, sharedTrip);
  const budgetRemaining =
    trip.budget != null ? trip.budget - expenseTotal : null;

  return {
    ...base,
    expenses,
    itinerary,
    milestones,
    placesCount,
    expenseTotal,
    budgetRemaining,
    spent: expenseTotal,
  };
}

export function groupChecklistByCategory(
  items: TripChecklistItem[]
): Record<TripChecklistCategory, TripChecklistItem[]> {
  const groups: Record<TripChecklistCategory, TripChecklistItem[]> = {
    documents: [],
    transport: [],
    lodging: [],
    packing: [],
    other: [],
  };
  for (const item of items) {
    groups[item.category].push(item);
  }
  return groups;
}
