import { createTransaction, deleteTransaction } from "@/api/finance/transactions";
import { enrichTrip, generateItineraryDays, tripLedgerDescription } from "@/domain/travel";
import { transferEndpointsTitle } from "@/domain/travel/transportModes";
import { sumTripSpent } from "@/domain/travel/spent";
import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import { assertTripAccess } from "@/lib/tripAccess";
import { ensureTripOwnerMember } from "@/api/travel/members";
import type {
  Trip,
  TripChecklistCategory,
  TripChecklistItem,
  TripExpense,
  TripExpenseCategory,
  TripInvite,
  TripItineraryDay,
  TripMilestone,
  TripMilestoneType,
  TripStatus,
  TripStop,
  TripWithChecklist,
} from "@/types/travel";

const TRIP_LIST_SELECT =
  "id, user_id, title, destination, start_date, end_date, status, notes, budget, spent, destination_lat, destination_lng, destination_place_id, origin_label, origin_lat, origin_lng, created_at";

const STOP_SELECT =
  "id, trip_id, name, place_id, lat, lng, start_date, end_date, sort_order";

async function fetchMemberTripIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("trip_member")
    .select("trip_id")
    .eq("user_id", userId);
  if (error) {
    if (error.message.includes("trip_member") || error.code === "42P01") {
      return [];
    }
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => row.trip_id as string);
}

export async function fetchTrips(): Promise<Trip[]> {
  const userId = await getCurrentUserId();
  const [ownedRes, memberIds] = await Promise.all([
    supabase
      .from("trip")
      .select(TRIP_LIST_SELECT)
      .eq("user_id", userId)
      .order("start_date", { ascending: true }),
    fetchMemberTripIds(userId),
  ]);
  if (ownedRes.error) throw new Error(ownedRes.error.message);

  const owned = (ownedRes.data ?? []) as Trip[];
  const ownedIds = new Set(owned.map((trip) => trip.id));
  const sharedIds = memberIds.filter((id) => !ownedIds.has(id));

  let shared: Trip[] = [];
  if (sharedIds.length > 0) {
    const { data, error } = await supabase
      .from("trip")
      .select(TRIP_LIST_SELECT)
      .in("id", sharedIds)
      .order("start_date", { ascending: true });
    if (error) throw new Error(error.message);
    shared = (data ?? []) as Trip[];
  }

  const byId = new Map<string, Trip>();
  for (const trip of [...owned, ...shared]) byId.set(trip.id, trip);
  return Array.from(byId.values()).sort((a, b) =>
    a.start_date.localeCompare(b.start_date)
  );
}

async function fetchChecklistProgressForTrips(
  tripIds: string[]
): Promise<Map<string, { done: number; total: number }>> {
  const map = new Map<string, { done: number; total: number }>();
  if (tripIds.length === 0) return map;
  const { data, error } = await supabase
    .from("trip_checklist_item")
    .select("trip_id, done")
    .in("trip_id", tripIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const cur = map.get(row.trip_id) ?? { done: 0, total: 0 };
    cur.total += 1;
    if (row.done) cur.done += 1;
    map.set(row.trip_id, cur);
  }
  return map;
}

export async function fetchTripsForList(): Promise<TripWithChecklist[]> {
  const raw = await fetchTrips();
  const progress = await fetchChecklistProgressForTrips(raw.map((t) => t.id));
  return raw.map((t) => enrichTrip(t, progress.get(t.id) ?? { done: 0, total: 0 }));
}

export async function fetchTripById(id: string): Promise<Trip | null> {
  const { data, error } = await supabase
    .from("trip")
    .select(TRIP_LIST_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Trip | null) ?? null;
}

export async function fetchTripStops(tripId: string): Promise<TripStop[]> {
  const { data, error } = await supabase
    .from("trip_stop")
    .select(STOP_SELECT)
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true });
  if (error) {
    if (String(error.message).includes("trip_stop") || error.code === "42P01") {
      return [];
    }
    throw new Error(error.message);
  }
  return (data ?? []) as TripStop[];
}

export type TripStopDraft = {
  name: string;
  start_date: string;
  end_date: string;
  place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
};

async function replaceTripStops(
  tripId: string,
  stops: TripStopDraft[]
): Promise<void> {
  const { error: delError } = await supabase
    .from("trip_stop")
    .delete()
    .eq("trip_id", tripId);
  if (delError) {
    if (
      String(delError.message).includes("trip_stop") ||
      delError.code === "42P01"
    ) {
      return;
    }
    throw new Error(delError.message);
  }
  if (stops.length === 0) return;
  const rows = stops
    .filter((stop) => stop.name.trim())
    .map((stop, index) => ({
      trip_id: tripId,
      name: stop.name.trim(),
      start_date: stop.start_date,
      end_date: stop.end_date,
      place_id: stop.place_id ?? null,
      lat: stop.lat ?? null,
      lng: stop.lng ?? null,
      sort_order: index,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("trip_stop").insert(rows);
  if (error) throw new Error(error.message);
}

async function seedTripDays(trip: Trip): Promise<void> {
  const days = generateItineraryDays(trip.id, trip.start_date, trip.end_date);
  if (days.length === 0) return;
  await supabase.from("trip_itinerary_day").insert(days);
}

export async function createTrip(input: {
  title: string;
  destination?: string | null;
  start_date: string;
  end_date: string;
  status: TripStatus;
  notes?: string | null;
  budget?: number | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  destination_place_id?: string | null;
  origin_label?: string | null;
  origin_lat?: number | null;
  origin_lng?: number | null;
  stops?: TripStopDraft[];
}): Promise<Trip> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("trip")
    .insert([
      {
        user_id: userId,
        title: input.title.trim(),
        destination: input.destination?.trim() || null,
        start_date: input.start_date,
        end_date: input.end_date,
        status: input.status,
        notes: input.notes?.trim() || null,
        budget: input.budget ?? null,
        destination_lat: input.destination_lat ?? null,
        destination_lng: input.destination_lng ?? null,
        destination_place_id: input.destination_place_id ?? null,
        origin_label: input.origin_label?.trim() || null,
        origin_lat: input.origin_lat ?? null,
        origin_lng: input.origin_lng ?? null,
      },
    ])
    .select(TRIP_LIST_SELECT)
    .single();
  if (error) throw new Error(error.message);
  const trip = data as Trip;
  await ensureTripOwnerMember(trip.id, userId).catch(() => undefined);
  if (input.stops && input.stops.length > 0) {
    await replaceTripStops(trip.id, input.stops);
  }
  try {
    await seedTripDays(trip);
  } catch {
    /* roteiro opcional */
  }
  return trip;
}

export async function updateTrip(input: {
  id: string;
  title: string;
  destination?: string | null;
  start_date: string;
  end_date: string;
  status: TripStatus;
  notes?: string | null;
  budget?: number | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  destination_place_id?: string | null;
  origin_label?: string | null;
  origin_lat?: number | null;
  origin_lng?: number | null;
  stops?: TripStopDraft[];
}): Promise<void> {
  const { error } = await supabase
    .from("trip")
    .update({
      title: input.title.trim(),
      destination: input.destination?.trim() || null,
      start_date: input.start_date,
      end_date: input.end_date,
      status: input.status,
      notes: input.notes?.trim() || null,
      budget: input.budget ?? null,
      destination_lat: input.destination_lat ?? null,
      destination_lng: input.destination_lng ?? null,
      destination_place_id: input.destination_place_id ?? null,
      origin_label: input.origin_label?.trim() || null,
      origin_lat: input.origin_lat ?? null,
      origin_lng: input.origin_lng ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
  if (input.stops) await replaceTripStops(input.id, input.stops);
}

export async function deleteTrip(id: string): Promise<void> {
  const { data: days } = await supabase
    .from("trip_itinerary_day")
    .select("id")
    .eq("trip_id", id);
  const dayIds = (days ?? []).map((row) => row.id as string);
  if (dayIds.length > 0) {
    await supabase
      .from("trip_itinerary_activity")
      .update({ place_visit_id: null })
      .in("day_id", dayIds);
  }
  const { error: placesError } = await supabase
    .from("place_visit")
    .delete()
    .eq("trip_id", id);
  if (placesError) throw new Error(placesError.message);
  const { error } = await supabase.from("trip").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function fetchTripChecklist(
  tripId: string
): Promise<TripChecklistItem[]> {
  const { data, error } = await supabase
    .from("trip_checklist_item")
    .select("*")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as TripChecklistItem[];
}

export async function createChecklistItem(input: {
  trip_id: string;
  title: string;
  category: TripChecklistCategory;
}): Promise<TripChecklistItem> {
  const { data, error } = await supabase
    .from("trip_checklist_item")
    .insert([
      {
        trip_id: input.trip_id,
        title: input.title.trim(),
        category: input.category,
        done: false,
        sort_order: Date.now(),
      },
    ])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TripChecklistItem;
}

export async function toggleChecklistItem(
  id: string,
  done: boolean
): Promise<void> {
  const { error } = await supabase
    .from("trip_checklist_item")
    .update({ done })
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

export async function fetchTripExpenses(tripId: string): Promise<TripExpense[]> {
  const access = await assertTripAccess(tripId);
  const { data, error } = await supabase
    .from("trip_expense")
    .select(
      "id, trip_id, description, amount, category, expense_date, visibility, created_by_user_id, paid_by_user_id, transaction_id"
    )
    .eq("trip_id", tripId)
    .order("expense_date", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []).filter((e) => {
    const visibility = e.visibility ?? "personal";
    if (visibility === "shared") return true;
    if (!e.created_by_user_id) return false;
    return e.created_by_user_id === access.userId;
  });
  if (rows.length === 0) return [];

  const ids = rows.map((e) => e.id);
  const { data: splits, error: splitError } = await supabase
    .from("trip_expense_split")
    .select("id, expense_id, user_id, amount, transaction_id")
    .in("expense_id", ids);
  if (splitError && !splitError.message.includes("trip_expense_split")) {
    throw new Error(splitError.message);
  }

  return rows.map((e) => ({
    ...(e as TripExpense),
    splits: (splits ?? []).filter((s) => s.expense_id === e.id),
  }));
}

async function syncTripSpent(tripId: string): Promise<void> {
  const [{ data, error }, { count: memberCount }] = await Promise.all([
    supabase
      .from("trip_expense")
      .select("amount, visibility")
      .eq("trip_id", tripId),
    supabase
      .from("trip_member")
      .select("*", { count: "exact", head: true })
      .eq("trip_id", tripId),
  ]);
  if (error) throw new Error(error.message);
  const sharedTrip = (memberCount ?? 0) > 1;
  const total = sumTripSpent(data ?? [], sharedTrip);
  await supabase.from("trip").update({ spent: total }).eq("id", tripId);
}

export async function createTripExpense(input: {
  trip_id: string;
  description: string;
  amount: number;
  category: TripExpenseCategory;
  expense_date: string;
  visibility?: "personal" | "shared";
  paid_by_user_id?: string | null;
  splits?: { user_id: string; amount: number }[];
  classId?: number | null;
}): Promise<TripExpense> {
  const access = await assertTripAccess(input.trip_id);
  const trip = await fetchTripById(input.trip_id);
  const visibility = input.visibility ?? "personal";
  const description = input.description.trim();
  let transactionId: number | null = null;
  if (
    visibility === "personal" &&
    input.classId &&
    input.amount > 0
  ) {
    transactionId = await createTransaction({
      class_id: input.classId,
      value: input.amount,
      description: tripLedgerDescription(trip?.title ?? "", description),
      transaction_at: input.expense_date,
    });
  }

  const { data, error } = await supabase
    .from("trip_expense")
    .insert([
      {
        trip_id: input.trip_id,
        description,
        amount: input.amount,
        category: input.category,
        expense_date: input.expense_date,
        visibility,
        created_by_user_id: access.userId,
        paid_by_user_id: input.paid_by_user_id ?? access.userId,
        transaction_id: transactionId,
      },
    ])
    .select(
      "id, trip_id, description, amount, category, expense_date, visibility, created_by_user_id, paid_by_user_id, transaction_id"
    )
    .single();
  if (error) throw new Error(error.message);

  if (visibility === "shared" && input.splits?.length) {
    const { error: splitError } = await supabase.from("trip_expense_split").insert(
      input.splits.map((s) => ({
        expense_id: data.id,
        user_id: s.user_id,
        amount: s.amount,
      }))
    );
    if (splitError) throw new Error(splitError.message);

    if (input.classId && input.amount > 0) {
      const mySplit = input.splits.find((s) => s.user_id === access.userId);
      if (mySplit && mySplit.amount > 0) {
        const txId = await createTransaction({
          class_id: input.classId,
          value: mySplit.amount,
          description: tripLedgerDescription(trip?.title ?? "", description, {
            shareSlice: true,
          }),
          transaction_at: input.expense_date,
        });
        await supabase
          .from("trip_expense_split")
          .update({ transaction_id: txId })
          .eq("expense_id", data.id)
          .eq("user_id", access.userId);
      }
    }
  }

  await syncTripSpent(input.trip_id);
  const withSplits = await fetchTripExpenses(input.trip_id);
  return withSplits.find((e) => e.id === data.id) ?? (data as TripExpense);
}

export async function registerMyExpenseSplit(
  expenseId: string,
  classId: number
): Promise<void> {
  const userId = await getCurrentUserId();
  const { data: expense, error } = await supabase
    .from("trip_expense")
    .select("trip_id, description, expense_date")
    .eq("id", expenseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!expense) throw new Error("Gasto não encontrado.");
  await assertTripAccess(expense.trip_id);
  const trip = await fetchTripById(expense.trip_id);

  const { data: split, error: splitError } = await supabase
    .from("trip_expense_split")
    .select("*")
    .eq("expense_id", expenseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (splitError) throw new Error(splitError.message);
  if (!split) throw new Error("Você não tem fatia neste gasto.");
  if (split.transaction_id) throw new Error("Fatia já registrada no extrato.");

  const txId = await createTransaction({
    class_id: classId,
    value: Number(split.amount),
    description: tripLedgerDescription(
      trip?.title ?? "",
      expense.description as string,
      { shareSlice: true }
    ),
    transaction_at: expense.expense_date as string,
  });
  const { error: upd } = await supabase
    .from("trip_expense_split")
    .update({ transaction_id: txId })
    .eq("id", split.id);
  if (upd) throw new Error(upd.message);
}

export async function updateTripExpense(input: {
  id: string;
  description: string;
  amount: number;
  category: TripExpenseCategory;
  expense_date: string;
  visibility?: "personal" | "shared";
  paid_by_user_id?: string | null;
  splits?: { user_id: string; amount: number }[];
}): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("trip_expense")
    .select(
      "trip_id, created_by_user_id, visibility, transaction_id, amount, expense_date, description"
    )
    .eq("id", input.id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error("Gasto não encontrado.");
  const access = await assertTripAccess(existing.trip_id);
  if (
    (existing.visibility ?? "personal") === "personal" &&
    existing.created_by_user_id &&
    existing.created_by_user_id !== access.userId &&
    access.role !== "owner"
  ) {
    throw new Error("Só quem criou o gasto pessoal pode editá-lo.");
  }

  const { error } = await supabase
    .from("trip_expense")
    .update({
      description: input.description.trim(),
      amount: input.amount,
      category: input.category,
      expense_date: input.expense_date,
      visibility: input.visibility ?? existing.visibility,
      paid_by_user_id: input.paid_by_user_id ?? null,
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);

  if (input.splits) {
    await supabase.from("trip_expense_split").delete().eq("expense_id", input.id);
    if (input.splits.length > 0) {
      const { error: splitError } = await supabase
        .from("trip_expense_split")
        .insert(
          input.splits.map((s) => ({
            expense_id: input.id,
            user_id: s.user_id,
            amount: s.amount,
          }))
        );
      if (splitError) throw new Error(splitError.message);
    }
  }

  const txId = existing.transaction_id as number | null;
  if (txId) {
    if (input.amount > 0) {
      const trip = await fetchTripById(existing.trip_id);
      const { error: txError } = await supabase
        .from("transaction")
        .update({
          value: input.amount,
          description: tripLedgerDescription(
            trip?.title ?? "",
            input.description.trim()
          ),
          transaction_at: input.expense_date,
        })
        .eq("id", txId)
        .eq("user_id", access.userId);
      if (txError) throw new Error(txError.message);
    } else {
      await deleteTransaction(txId);
      await supabase
        .from("trip_expense")
        .update({ transaction_id: null })
        .eq("id", input.id);
    }
  }

  await syncTripSpent(existing.trip_id);
}

export async function deleteTripExpense(id: string): Promise<void> {
  const { data: existing } = await supabase
    .from("trip_expense")
    .select("trip_id, created_by_user_id, visibility, transaction_id")
    .eq("id", id)
    .maybeSingle();
  if (existing?.trip_id) {
    const access = await assertTripAccess(existing.trip_id);
    if (
      (existing.visibility ?? "personal") === "personal" &&
      existing.created_by_user_id &&
      existing.created_by_user_id !== access.userId &&
      access.role !== "owner"
    ) {
      throw new Error("Só quem criou o gasto pessoal pode excluí-lo.");
    }
  }
  const { error } = await supabase.from("trip_expense").delete().eq("id", id);
  if (error) throw new Error(error.message);
  if (existing?.transaction_id) {
    await deleteTransaction(existing.transaction_id as number).catch(
      () => undefined
    );
  }
  if (existing?.trip_id) await syncTripSpent(existing.trip_id);
}

export async function fetchTripItinerary(
  tripId: string
): Promise<TripItineraryDay[]> {
  const { data: days, error } = await supabase
    .from("trip_itinerary_day")
    .select("*")
    .eq("trip_id", tripId)
    .order("day_number", { ascending: true });
  if (error) throw new Error(error.message);
  if (!days?.length) return [];
  const dayIds = days.map((day) => day.id);
  const { data: activities, error: actError } = await supabase
    .from("trip_itinerary_activity")
    .select(
      "id, day_id, title, activity_time, arrival_time, notes, sort_order, category, transport_mode, origin_label, origin_lat, origin_lng, origin_place_id, destination_label, destination_lat, destination_lng, destination_place_id"
    )
    .in("day_id", dayIds)
    .order("sort_order", { ascending: true });
  let rows = activities;
  if (actError) {
    const fallback = await supabase
      .from("trip_itinerary_activity")
      .select("id, day_id, title, activity_time, notes, sort_order")
      .in("day_id", dayIds)
      .order("sort_order", { ascending: true });
    if (fallback.error) throw new Error(actError.message);
    rows = fallback.data as unknown as typeof activities;
  }
  return days.map((day) => ({
    ...(day as TripItineraryDay),
    activities: (rows ?? []).filter((act) => act.day_id === day.id),
  }));
}

export async function createItineraryActivity(input: {
  day_id: string;
  title: string;
  activity_time?: string | null;
  arrival_time?: string | null;
  sort_order?: number;
  category?: string | null;
  transport_mode?: string | null;
  origin_label?: string | null;
  origin_lat?: number | null;
  origin_lng?: number | null;
  origin_place_id?: string | null;
  destination_label?: string | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  destination_place_id?: string | null;
}): Promise<void> {
  const payload: Record<string, unknown> = {
    day_id: input.day_id,
    title: input.title.trim(),
    sort_order: input.sort_order ?? Date.now(),
  };
  if (input.activity_time !== undefined) payload.activity_time = input.activity_time;
  if (input.arrival_time !== undefined) payload.arrival_time = input.arrival_time;
  if (input.category !== undefined) payload.category = input.category;
  if (input.transport_mode !== undefined) payload.transport_mode = input.transport_mode;
  if (input.origin_label !== undefined) payload.origin_label = input.origin_label;
  if (input.origin_lat !== undefined) payload.origin_lat = input.origin_lat;
  if (input.origin_lng !== undefined) payload.origin_lng = input.origin_lng;
  if (input.origin_place_id !== undefined) {
    payload.origin_place_id = input.origin_place_id;
  }
  if (input.destination_label !== undefined) {
    payload.destination_label = input.destination_label;
  }
  if (input.destination_lat !== undefined) payload.destination_lat = input.destination_lat;
  if (input.destination_lng !== undefined) payload.destination_lng = input.destination_lng;
  if (input.destination_place_id !== undefined) {
    payload.destination_place_id = input.destination_place_id;
  }
  const first = await supabase.from("trip_itinerary_activity").insert([payload]);
  if (!first.error) return;
  const retry = await supabase.from("trip_itinerary_activity").insert([
    {
      day_id: input.day_id,
      title: input.title.trim(),
      activity_time: input.activity_time ?? null,
      sort_order: input.sort_order ?? Date.now(),
    },
  ]);
  if (retry.error) throw new Error(retry.error.message);
}

export async function syncRoundTripTransfers(input: {
  tripId: string;
  home: {
    label: string;
    lat: number | null;
    lng: number | null;
    place_id: string | null;
  };
  firstStop: TripStopDraft;
  lastStop: TripStopDraft;
  mode: string;
  outboundDepart: string;
  outboundArrive: string;
  returnDepart: string;
  returnArrive: string;
  outboundId?: string | null;
  returnId?: string | null;
}): Promise<void> {
  const itinerary = await fetchTripItinerary(input.tripId);
  const days = [...itinerary].sort((a, b) => a.day_number - b.day_number);
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  if (!firstDay || !lastDay) return;

  const outboundPayload = {
    title: transferEndpointsTitle(input.home.label, input.firstStop.name),
    category: "transport",
    transport_mode: input.mode,
    activity_time: input.outboundDepart.trim() || null,
    arrival_time: input.outboundArrive.trim() || null,
    origin_label: input.home.label,
    origin_lat: input.home.lat,
    origin_lng: input.home.lng,
    origin_place_id: input.home.place_id,
    destination_label: input.firstStop.name,
    destination_lat: input.firstStop.lat ?? null,
    destination_lng: input.firstStop.lng ?? null,
    destination_place_id: input.firstStop.place_id ?? null,
    sort_order: 0,
  };
  if (input.outboundId) {
    await updateItineraryActivity({ id: input.outboundId, ...outboundPayload });
  } else {
    await createItineraryActivity({
      day_id: firstDay.id,
      ...outboundPayload,
    });
  }

  const returnPayload = {
    title: transferEndpointsTitle(input.lastStop.name, input.home.label),
    category: "transport",
    transport_mode: input.mode,
    activity_time: input.returnDepart.trim() || null,
    arrival_time: input.returnArrive.trim() || null,
    origin_label: input.lastStop.name,
    origin_lat: input.lastStop.lat ?? null,
    origin_lng: input.lastStop.lng ?? null,
    origin_place_id: input.lastStop.place_id ?? null,
    destination_label: input.home.label,
    destination_lat: input.home.lat,
    destination_lng: input.home.lng,
    destination_place_id: input.home.place_id,
    sort_order: firstDay.id === lastDay.id ? 1 : 0,
  };
  if (input.returnId && input.returnId !== input.outboundId) {
    await updateItineraryActivity({ id: input.returnId, ...returnPayload });
  } else {
    await createItineraryActivity({
      day_id: lastDay.id,
      ...returnPayload,
    });
  }
}

export async function deleteItineraryActivity(id: string): Promise<void> {
  const { error } = await supabase
    .from("trip_itinerary_activity")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateItineraryActivity(input: {
  id: string;
  title?: string;
  notes?: string | null;
  activity_time?: string | null;
  arrival_time?: string | null;
  sort_order?: number;
  category?: string | null;
  transport_mode?: string | null;
  origin_label?: string | null;
  origin_lat?: number | null;
  origin_lng?: number | null;
  origin_place_id?: string | null;
  destination_label?: string | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  destination_place_id?: string | null;
}): Promise<void> {
  const { id, ...fields } = input;
  const { error } = await supabase
    .from("trip_itinerary_activity")
    .update(fields)
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
    .update({ notes, ...(title !== undefined ? { title } : {}) })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function fetchTripMilestones(
  tripId: string
): Promise<TripMilestone[]> {
  await assertTripAccess(tripId);
  const { data, error } = await supabase
    .from("trip_milestone")
    .select("id, trip_id, title, type, due_date, done, notes")
    .eq("trip_id", tripId)
    .order("due_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as TripMilestone[];
}

export async function fetchMilestonesForTrips(
  tripIds: string[]
): Promise<TripMilestone[]> {
  if (tripIds.length === 0) return [];
  const { data, error } = await supabase
    .from("trip_milestone")
    .select("id, trip_id, title, type, due_date, done, notes")
    .in("trip_id", tripIds)
    .order("due_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as TripMilestone[];
}

export async function createTripMilestone(input: {
  trip_id: string;
  title: string;
  type: TripMilestoneType;
  due_date: string;
  notes?: string | null;
}): Promise<TripMilestone> {
  await assertTripAccess(input.trip_id);
  const { data, error } = await supabase
    .from("trip_milestone")
    .insert([
      {
        trip_id: input.trip_id,
        title: input.title.trim(),
        type: input.type,
        due_date: input.due_date,
        notes: input.notes?.trim() || null,
        done: false,
      },
    ])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TripMilestone;
}

export async function updateTripMilestone(input: {
  id: string;
  title?: string;
  type?: TripMilestoneType;
  due_date?: string;
  done?: boolean;
  notes?: string | null;
}): Promise<void> {
  const { id, ...fields } = input;
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

function inviteToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function tripInviteUrl(token: string): string {
  return `https://orbyva.app/travel/invite/${token}`;
}

export function tripInviteAppUrl(token: string): string {
  return `orbyva://travel/invite/${token}`;
}

export async function createTripInvite(tripId: string): Promise<TripInvite> {
  const userId = await getCurrentUserId();
  const expires = new Date();
  expires.setDate(expires.getDate() + 14);
  const { data, error } = await supabase
    .from("trip_invite")
    .insert([
      {
        trip_id: tripId,
        token: inviteToken(),
        created_by: userId,
        status: "pending",
        expires_at: expires.toISOString(),
      },
    ])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TripInvite;
}

export async function listTripInvites(tripId: string): Promise<TripInvite[]> {
  const { data, error } = await supabase
    .from("trip_invite")
    .select("id, trip_id, token, email, status, expires_at")
    .eq("trip_id", tripId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TripInvite[];
}

export async function revokeTripInvite(id: string): Promise<void> {
  const { error } = await supabase
    .from("trip_invite")
    .update({ status: "revoked" })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
