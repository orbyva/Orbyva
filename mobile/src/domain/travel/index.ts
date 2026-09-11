import type { Trip, TripStatus, TripWithChecklist } from "@/types/travel";

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  planning: "Planejando",
  upcoming: "Próxima",
  ongoing: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
};

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

export function tripListBucket(trip: Trip, todayIso: string): "active" | "done" {
  return isTripFinished({
    endDate: trip.end_date,
    status: trip.status,
    todayIso,
  })
    ? "done"
    : "active";
}

export function enrichTrip(
  trip: Trip,
  progress?: { done: number; total: number }
): TripWithChecklist {
  const done = progress?.done ?? 0;
  const total = progress?.total ?? 0;
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
    checklist: [],
    checklistDone: done,
    checklistTotal: total,
    checklistProgress: total > 0 ? Math.round((done / total) * 100) : 0,
    daysUntilStart: daysUntilStart >= 0 ? daysUntilStart : null,
  };
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

export function generateItineraryDays(
  tripId: string,
  startDate: string,
  endDate: string
): Array<{
  trip_id: string;
  day_number: number;
  date: string;
  title: string;
  notes: null;
}> {
  const duration = getTripDuration(startDate, endDate);
  const days: Array<{
    trip_id: string;
    day_number: number;
    date: string;
    title: string;
    notes: null;
  }> = [];
  const start = new Date(`${startDate}T12:00:00`);
  for (let i = 0; i < duration; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    days.push({
      trip_id: tripId,
      day_number: i + 1,
      date: `${y}-${m}-${d}`,
      title: `Dia ${i + 1}`,
      notes: null,
    });
  }
  return days;
}

export { tripLedgerDescription } from "./ledger";
