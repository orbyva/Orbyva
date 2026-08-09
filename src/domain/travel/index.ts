import type {
  Trip,
  TripActivityCategory,
  TripChecklistCategory,
  TripChecklistItem,
  TripExpense,
  TripFull,
  TripItineraryDay,
  TripMilestone,
  TripWithChecklist,
} from "@/types/travel";
import { PLACE_TYPE_LABELS } from "@/domain/places";
import { sumTripSpent } from "./spent";

export { sumTripSpent } from "./spent";
export {
  TRIP_LEDGER_PREFIX,
  tripLedgerDescription,
  isTripLedgerDescription,
  sumTripSpendFromTransactions,
} from "./ledger";

export const TRIP_STATUS_LABELS: Record<string, string> = {
  planning: "Planejando",
  upcoming: "Próxima",
  ongoing: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
};

/**
 * Viagem encerrada: concluída, cancelada ou com data final anterior a hoje.
 * Roteiro vira somente leitura e não calcula deslocamentos.
 */
export function isTripFinished(params: {
  endDate: string | null | undefined;
  status?: string | null;
  todayIso: string;
}): boolean {
  if (params.status === "completed" || params.status === "cancelled") {
    return true;
  }
  if (!params.endDate) return false;
  return params.endDate.slice(0, 10) < params.todayIso.slice(0, 10);
}

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

/** Tipos de visita no roteiro — lugares + deslocamento entre cidades. */
export const ACTIVITY_CATEGORY_LABELS: Record<TripActivityCategory, string> = {
  ...PLACE_TYPE_LABELS,
  transport: "Deslocamento",
};

const LEGACY_ACTIVITY_CATEGORY: Record<string, TripActivityCategory> = {
  flight: "transport",
  activity: "attraction",
};

/** Normaliza categoria salva (inclui valores legados flight/activity). */
export function normalizeTripActivityCategory(
  value: string | null | undefined
): TripActivityCategory {
  if (!value) return "attraction";
  if (value in LEGACY_ACTIVITY_CATEGORY) {
    return LEGACY_ACTIVITY_CATEGORY[value]!;
  }
  if (value === "transport") return "transport";
  if (value in PLACE_TYPE_LABELS) {
    return value as TripActivityCategory;
  }
  return "attraction";
}

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

export type ItineraryDaySyncRow = {
  id: string;
  date: string | null;
  day_number: number;
  title: string | null;
};

export type ItineraryDateSyncPlan = {
  insert: Omit<TripItineraryDay, "id" | "activities">[];
  deleteIds: string[];
  updates: Array<{
    id: string;
    day_number: number;
    title: string | null;
  }>;
};

function isDefaultDayTitle(title: string | null | undefined): boolean {
  if (!title?.trim()) return true;
  return /^Dia\s+\d+$/i.test(title.trim());
}

/**
 * Alinha dias do roteiro ao intervalo [startDate, endDate].
 * Mantém o dia pela data (atividades intactas); remove datas fora do intervalo;
 * cria dias faltantes; renumerar `day_number` (e título padrão “Dia N”).
 */
export function planItineraryDateSync(
  tripId: string,
  startDate: string,
  endDate: string,
  existing: ItineraryDaySyncRow[]
): ItineraryDateSyncPlan {
  const desired = generateItineraryDays(tripId, startDate, endDate);
  const desiredDates = new Set(
    desired.map((d) => d.date).filter((d): d is string => Boolean(d))
  );

  const byDate = new Map<string, ItineraryDaySyncRow>();
  const deleteIds: string[] = [];

  for (const day of existing) {
    const date = day.date?.slice(0, 10) || null;
    if (!date || !desiredDates.has(date)) {
      deleteIds.push(day.id);
      continue;
    }
    if (byDate.has(date)) {
      deleteIds.push(day.id);
      continue;
    }
    byDate.set(date, day);
  }

  const insert: ItineraryDateSyncPlan["insert"] = [];
  const updates: ItineraryDateSyncPlan["updates"] = [];

  for (const d of desired) {
    const date = d.date;
    if (!date) continue;
    const ex = byDate.get(date);
    if (!ex) {
      insert.push(d);
      continue;
    }
    const nextTitle = isDefaultDayTitle(ex.title)
      ? `Dia ${d.day_number}`
      : ex.title;
    if (ex.day_number !== d.day_number || nextTitle !== ex.title) {
      updates.push({
        id: ex.id,
        day_number: d.day_number,
        title: nextTitle,
      });
    }
  }

  return { insert, deleteIds, updates };
}

export function enrichTrip(
  trip: Trip,
  checklist: TripChecklistItem[],
  progress?: { done: number; total: number }
): TripWithChecklist {
  const done = progress?.done ?? checklist.filter((c) => c.done).length;
  const total = progress?.total ?? checklist.length;
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
    checklistDone: done,
    checklistTotal: total,
    checklistProgress: total > 0 ? Math.round((done / total) * 100) : 0,
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
