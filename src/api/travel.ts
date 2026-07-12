import { supabase } from "@/lib/supabase";
import type { TransactionCreateRequest } from "@/types/finance";
import {
  DEFAULT_CHECKLIST_TEMPLATE,
  generateItineraryDays,
} from "@/domain/travel";
import { countPlacesByTrip } from "@/api/places";
import type {
  Trip,
  TripChecklistCreateRequest,
  TripChecklistItem,
  TripChecklistUpdateRequest,
  TripCreateRequest,
  TripExpense,
  TripExpenseCreateRequest,
  TripFull,
  TripItineraryActivity,
  TripItineraryActivityCreateRequest,
  TripItineraryDay,
  TripMilestone,
  TripMilestoneCreateRequest,
  TripMilestoneUpdateRequest,
  TripUpdateRequest,
} from "@/types/travel";
import { enrichTripFull } from "@/domain/travel";

async function getCurrentUserId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Usuário não autenticado.");
  return user.id;
}

// ── Trips ────────────────────────────────────────────────────────────

export async function fetchTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from("trip")
    .select("*")
    .order("start_date", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchTripById(id: string): Promise<Trip | null> {
  const { data, error } = await supabase
    .from("trip")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchTripFull(id: string): Promise<TripFull | null> {
  const trip = await fetchTripById(id);
  if (!trip) return null;

  const [checklist, expenses, itinerary, milestones, placesCount] =
    await Promise.all([
      fetchTripChecklist(id),
      fetchTripExpenses(id),
      fetchTripItinerary(id),
      fetchTripMilestones(id),
      countPlacesByTrip(id),
    ]);

  return enrichTripFull(
    trip,
    checklist,
    expenses,
    itinerary,
    milestones,
    placesCount
  );
}

export async function createTrip(trip: TripCreateRequest): Promise<Trip> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("trip")
    .insert([{ ...trip, user_id: userId }])
    .select()
    .single();
  if (error) throw new Error(error.message);

  await seedTripDefaults(data);
  return data;
}

async function seedTripDefaults(trip: Trip): Promise<void> {
  const checklistItems = DEFAULT_CHECKLIST_TEMPLATE.map((item, i) => ({
    trip_id: trip.id,
    title: item.title,
    category: item.category,
    done: false,
    sort_order: i + 1,
  }));
  await supabase.from("trip_checklist_item").insert(checklistItems);

  const days = generateItineraryDays(trip.id, trip.start_date, trip.end_date);
  if (days.length > 0) {
    await supabase.from("trip_itinerary_day").insert(days);
  }
}

export async function updateTrip(data: TripUpdateRequest): Promise<void> {
  const { id, ...fields } = data;
  const { error } = await supabase
    .from("trip")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTrip(id: string): Promise<void> {
  const { error } = await supabase.from("trip").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Checklist ────────────────────────────────────────────────────────

export async function fetchTripChecklist(tripId: string): Promise<TripChecklistItem[]> {
  const { data, error } = await supabase
    .from("trip_checklist_item")
    .select("*")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createChecklistItem(
  item: TripChecklistCreateRequest
): Promise<TripChecklistItem> {
  const { data, error } = await supabase
    .from("trip_checklist_item")
    .insert([item])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateChecklistItem(
  data: TripChecklistUpdateRequest
): Promise<void> {
  const { id, ...fields } = data;
  const { error } = await supabase
    .from("trip_checklist_item")
    .update(fields)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteChecklistItem(id: string): Promise<void> {
  const { error } = await supabase
    .from("trip_checklist_item")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Expenses ─────────────────────────────────────────────────────────

export async function fetchTripExpenses(tripId: string): Promise<TripExpense[]> {
  const { data, error } = await supabase
    .from("trip_expense")
    .select("*")
    .eq("trip_id", tripId)
    .order("expense_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function syncTripSpent(tripId: string): Promise<void> {
  const expenses = await fetchTripExpenses(tripId);
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  await supabase.from("trip").update({ spent: total }).eq("id", tripId);
}

export async function createTripExpense(
  expense: TripExpenseCreateRequest,
  transaction?: TransactionCreateRequest | null
): Promise<TripExpense> {
  let transactionId: number | null = null;

  if (transaction && transaction.class_id > 0 && transaction.value > 0) {
    const { data: txData, error: txError } = await supabase
      .from("transaction")
      .insert([transaction])
      .select("id")
      .single();
    if (txError) throw new Error(txError.message);
    transactionId = txData?.id ?? null;
  }

  const { data, error } = await supabase
    .from("trip_expense")
    .insert([{ ...expense, transaction_id: transactionId }])
    .select()
    .single();
  if (error) throw new Error(error.message);

  await syncTripSpent(expense.trip_id);
  return data;
}

export async function deleteTripExpense(
  id: string,
  tripId: string
): Promise<void> {
  const { error } = await supabase.from("trip_expense").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await syncTripSpent(tripId);
}

// ── Itinerary ────────────────────────────────────────────────────────

export async function fetchTripItinerary(tripId: string): Promise<TripItineraryDay[]> {
  const { data: days, error } = await supabase
    .from("trip_itinerary_day")
    .select("*")
    .eq("trip_id", tripId)
    .order("day_number", { ascending: true });
  if (error) throw new Error(error.message);
  if (!days?.length) return [];

  const dayIds = days.map((d) => d.id);
  const { data: activities, error: actError } = await supabase
    .from("trip_itinerary_activity")
    .select("*")
    .in("day_id", dayIds)
    .order("sort_order", { ascending: true });
  if (actError) throw new Error(actError.message);

  return days.map((day) => ({
    ...day,
    activities: (activities ?? []).filter((a) => a.day_id === day.id),
  }));
}

export async function createItineraryActivity(
  activity: TripItineraryActivityCreateRequest
): Promise<TripItineraryActivity> {
  const { data, error } = await supabase
    .from("trip_itinerary_activity")
    .insert([activity])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteItineraryActivity(id: string): Promise<void> {
  const { error } = await supabase
    .from("trip_itinerary_activity")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateItineraryDayNotes(
  id: string,
  notes: string | null,
  title?: string | null
): Promise<void> {
  const { error } = await supabase
    .from("trip_itinerary_day")
    .update({ notes, ...(title != null ? { title } : {}) })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Milestones ───────────────────────────────────────────────────────

export async function fetchTripMilestones(tripId: string): Promise<TripMilestone[]> {
  const { data, error } = await supabase
    .from("trip_milestone")
    .select("*")
    .eq("trip_id", tripId)
    .order("due_date", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createTripMilestone(
  milestone: TripMilestoneCreateRequest
): Promise<TripMilestone> {
  const { data, error } = await supabase
    .from("trip_milestone")
    .insert([milestone])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateTripMilestone(
  data: TripMilestoneUpdateRequest
): Promise<void> {
  const { id, ...fields } = data;
  const { error } = await supabase
    .from("trip_milestone")
    .update(fields)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTripMilestone(id: string): Promise<void> {
  const { error } = await supabase.from("trip_milestone").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Re-export for Travel list page
export { enrichTrip } from "@/domain/travel";
