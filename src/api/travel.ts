import { supabase } from "@/lib/supabase";
import { deleteTransactionApi, insertTransaction } from "@/api/finance";
import type { TransactionCreateRequest } from "@/types/finance";
import {
  generateItineraryDays,
  planItineraryDateSync,
} from "@/domain/travel";
import type {
  Trip,
  TripChecklistCreateRequest,
  TripChecklistItem,
  TripChecklistUpdateRequest,
  TripCreateRequest,
  TripExpense,
  TripExpenseCreateRequest,
  TripExpenseUpdateRequest,
  TripFull,
  TripItineraryActivity,
  TripItineraryActivityCreateRequest,
  TripItineraryActivityUpdateRequest,
  TripItineraryDay,
  TripMilestone,
  TripMilestoneCreateRequest,
  TripMilestoneUpdateRequest,
  TripStop,
  TripUpdateRequest,
  TripWithChecklist,
} from "@/types/travel";
import type { PlaceVisit } from "@/types/places";
import type { TripMember, TripMemberRole } from "@/types/tripSharing";
import { enrichTrip, enrichTripFull } from "@/domain/travel";
import { destinationFieldsFromStops } from "@/domain/travel/tripStops";
import type { TripStopInput } from "@/domain/travel/tripStops";
import { tripLedgerDescription } from "@/domain/travel/ledger";
import { getCurrentUserId } from "@/lib/auth-user";
import { assertTripAccess, fetchMemberTripIds } from "@/lib/tripAccess";
import { ensureTripOwnerMember } from "@/api/tripMembers";

// ── Trips ────────────────────────────────────────────────────────────

const TRIP_LIST_SELECT =
  "id, user_id, title, destination, destination_lat, destination_lng, destination_place_id, start_date, end_date, budget, spent, status, notes, origin_lat, origin_lng, origin_label, created_at, updated_at";

const STOP_SELECT =
  "id, trip_id, name, place_id, lat, lng, start_date, end_date, sort_order, created_at";

export async function fetchTrips(): Promise<Trip[]> {
  const userId = await getCurrentUserId();

  // Owned + membership em paralelo (antes era sequencial).
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
  const ownedIds = new Set(owned.map((t) => t.id));
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
  for (const t of [...owned, ...shared]) byId.set(t.id, t);
  return Array.from(byId.values()).sort((a, b) =>
    a.start_date.localeCompare(b.start_date)
  );
}

/** Progresso de checklist por viagem (só trip_id + done, lista). */
export async function fetchChecklistProgressForTrips(
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

/** Lista pronta para /travel: viagens + progresso de checklist. */
export async function fetchTripsForList(): Promise<TripWithChecklist[]> {
  const raw = await fetchTrips();
  const progress = await fetchChecklistProgressForTrips(raw.map((t) => t.id));
  return raw.map((t) =>
    enrichTrip(t, [], progress.get(t.id) ?? { done: 0, total: 0 })
  );
}

export async function fetchTripById(id: string): Promise<Trip | null> {
  try {
    await assertTripAccess(id);
  } catch {
    return null;
  }
  const { data, error } = await supabase
    .from("trip")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Places no detalhe, sem embed de trip (já temos a viagem). */
const PLACE_DETAIL_SELECT =
  "id, user_id, trip_id, name, type, status, rating, notes, visited_date, amount, transaction_id, address, lat, lng, geoapify_place_id, google_place_id, would_recommend, created_at";

const EXPENSE_SELECT =
  "id, trip_id, description, amount, category, expense_date, transaction_id, visibility, created_by_user_id, paid_by_user_id, place_visit_id, created_at";

const DAY_SELECT = "id, trip_id, day_number, date, title, notes";

const ACTIVITY_SELECT =
  "id, day_id, title, activity_time, arrival_time, notes, place_visit_id, sort_order, link_url, is_reserved, category, visit_status, completed_at, skipped_at, transport_mode, origin_label, origin_lat, origin_lng, origin_place_id, destination_label, destination_lat, destination_lng, destination_place_id, created_by_user_id, created_by_name, created_by_avatar";

const MILESTONE_SELECT =
  "id, trip_id, title, type, due_date, done, notes";

const MEMBER_SELECT =
  "id, trip_id, user_id, role, display_name, avatar_url, joined_at";

const SPLIT_SELECT = "id, expense_id, user_id, amount, transaction_id, display_name";

export type TripDetailBundle = {
  trip: TripFull;
  places: PlaceVisit[];
  members: TripMember[];
};

/**
 * Cold load do detalhe: trip + filhos na mesma wave; activities/splits depois.
 * Sem checklist (não usado na tela). Sem assertTripAccess separado.
 */
export async function fetchTripDetailBundle(
  id: string
): Promise<TripDetailBundle | null> {
  const userId = await getCurrentUserId();

  // Wave 1: trip + tudo que depende só de trip_id (RLS filtra o resto).
  const [tripRes, expensesRes, daysRes, milestonesRes, placesRes, membersRes, stopsRes] =
    await Promise.all([
      supabase.from("trip").select(TRIP_LIST_SELECT).eq("id", id).maybeSingle(),
      supabase
        .from("trip_expense")
        .select(EXPENSE_SELECT)
        .eq("trip_id", id)
        .order("expense_date", { ascending: false }),
      supabase
        .from("trip_itinerary_day")
        .select(DAY_SELECT)
        .eq("trip_id", id)
        .order("day_number", { ascending: true }),
      supabase
        .from("trip_milestone")
        .select(MILESTONE_SELECT)
        .eq("trip_id", id)
        .order("due_date", { ascending: true }),
      supabase
        .from("place_visit")
        .select(PLACE_DETAIL_SELECT)
        .eq("trip_id", id)
        .order("visited_date", { ascending: false, nullsFirst: false }),
      supabase
        .from("trip_member")
        .select(MEMBER_SELECT)
        .eq("trip_id", id)
        .order("joined_at", { ascending: true }),
      supabase
        .from("trip_stop")
        .select(STOP_SELECT)
        .eq("trip_id", id)
        .order("sort_order", { ascending: true }),
    ]);

  if (tripRes.error) throw new Error(tripRes.error.message);
  if (!tripRes.data) return null;

  const trip = tripRes.data as Trip;
  const members = (membersRes.error ? [] : (membersRes.data ?? [])) as TripMember[];

  let role: TripMemberRole = "owner";
  if (trip.user_id !== userId) {
    const me = members.find((m) => m.user_id === userId);
    if (!me) return null;
    role = me.role;
  }

  if (expensesRes.error) throw new Error(expensesRes.error.message);
  if (daysRes.error) throw new Error(daysRes.error.message);
  if (milestonesRes.error) throw new Error(milestonesRes.error.message);
  if (placesRes.error) throw new Error(placesRes.error.message);
  if (membersRes.error) {
    if (
      !String(membersRes.error.message).includes("trip_member") &&
      membersRes.error.code !== "42P01"
    ) {
      throw new Error(membersRes.error.message);
    }
  }

  let stops: TripStop[] = [];
  if (stopsRes.error) {
    if (
      !String(stopsRes.error.message).includes("trip_stop") &&
      stopsRes.error.code !== "42P01"
    ) {
      throw new Error(stopsRes.error.message);
    }
  } else {
    stops = (stopsRes.data ?? []) as TripStop[];
  }

  const days = (daysRes.data ?? []) as TripItineraryDay[];
  const milestones = (milestonesRes.data ?? []) as TripMilestone[];
  const places = (placesRes.data ?? []) as unknown as PlaceVisit[];

  const expensesRaw = ((expensesRes.data ?? []) as TripExpense[]).filter((e) => {
    const visibility = e.visibility ?? "personal";
    if (visibility === "shared") return true;
    if (!e.created_by_user_id) return false;
    return e.created_by_user_id === userId;
  });

  const dayIds = days.map((d) => d.id);
  const expenseIds = expensesRaw.map((e) => e.id);

  // Wave 2: filhos de day/expense.
  const [activitiesRes, splitsRes] = await Promise.all([
    dayIds.length > 0
      ? supabase
          .from("trip_itinerary_activity")
          .select(ACTIVITY_SELECT)
          .in("day_id", dayIds)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] as TripItineraryActivity[], error: null }),
    expenseIds.length > 0
      ? supabase
          .from("trip_expense_split")
          .select(SPLIT_SELECT)
          .in("expense_id", expenseIds)
      : Promise.resolve({
          data: [] as NonNullable<TripExpense["splits"]>,
          error: null,
        }),
  ]);

  if (activitiesRes.error) throw new Error(activitiesRes.error.message);
  if (
    splitsRes.error &&
    !String(splitsRes.error.message ?? "").includes("trip_expense_split")
  ) {
    throw new Error(splitsRes.error.message);
  }

  const activities = (activitiesRes.data ?? []) as TripItineraryActivity[];
  const splits = splitsRes.error ? [] : (splitsRes.data ?? []);

  const itinerary: TripItineraryDay[] = days.map((day) => ({
    ...day,
    activities: activities.filter((a) => a.day_id === day.id),
  }));

  const expenses: TripExpense[] = expensesRaw.map((e) => ({
    ...e,
    splits: splits.filter((s) => s.expense_id === e.id),
  }));

  const isShared = members.length > 1 || role === "editor";
  const full = enrichTripFull(
    trip,
    [], // checklist não entra no detalhe
    expenses,
    itinerary,
    milestones,
    places.length,
    isShared
  );

  return {
    trip: {
      ...full,
      stops,
      myRole: role,
      isShared,
    },
    places,
    members,
  };
}

/** @deprecated Prefer `fetchTripDetailBundle` no detalhe. */
export async function fetchTripFull(id: string): Promise<TripFull | null> {
  const bundle = await fetchTripDetailBundle(id);
  return bundle?.trip ?? null;
}

/**
 * Só dias + atividades (para ida/volta e sync leve).
 * Sem expenses/places/members, bem mais barato que o bundle completo.
 */
export async function fetchTripItineraryLite(
  tripId: string
): Promise<TripItineraryDay[]> {
  const { data: days, error: daysError } = await supabase
    .from("trip_itinerary_day")
    .select(DAY_SELECT)
    .eq("trip_id", tripId)
    .order("day_number", { ascending: true });
  if (daysError) throw new Error(daysError.message);
  const list = (days ?? []) as TripItineraryDay[];
  if (list.length === 0) return [];

  const { data: activities, error: actError } = await supabase
    .from("trip_itinerary_activity")
    .select(ACTIVITY_SELECT)
    .in(
      "day_id",
      list.map((d) => d.id)
    )
    .order("sort_order", { ascending: true });
  if (actError) throw new Error(actError.message);

  const byDay = new Map<string, TripItineraryActivity[]>();
  for (const act of (activities ?? []) as TripItineraryActivity[]) {
    const bucket = byDay.get(act.day_id);
    if (bucket) bucket.push(act);
    else byDay.set(act.day_id, [act]);
  }

  return list.map((day) => ({
    ...day,
    activities: byDay.get(day.id) ?? [],
  }));
}

export async function fetchTripStops(
  tripId: string,
  opts?: { skipAccessCheck?: boolean }
): Promise<TripStop[]> {
  if (!opts?.skipAccessCheck) {
    await assertTripAccess(tripId);
  }
  const { data, error } = await supabase
    .from("trip_stop")
    .select(STOP_SELECT)
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true });
  if (error) {
    if (
      String(error.message).includes("trip_stop") ||
      error.code === "42P01"
    ) {
      return [];
    }
    throw new Error(error.message);
  }
  return (data ?? []) as TripStop[];
}

export async function replaceTripStops(
  tripId: string,
  stops: TripStopInput[],
  opts?: { skipAccessCheck?: boolean }
): Promise<TripStop[]> {
  if (!opts?.skipAccessCheck) {
    await assertTripAccess(tripId);
  }
  const { error: delError } = await supabase
    .from("trip_stop")
    .delete()
    .eq("trip_id", tripId);
  if (delError) {
    if (
      String(delError.message).includes("trip_stop") ||
      delError.code === "42P01"
    ) {
      return [];
    }
    throw new Error(delError.message);
  }

  if (stops.length === 0) return [];

  const rows = stops.map((s, i) => ({
    trip_id: tripId,
    name: s.name.trim(),
    place_id: s.place_id?.trim() || null,
    lat: s.lat ?? null,
    lng: s.lng ?? null,
    start_date: s.start_date,
    end_date: s.end_date,
    sort_order: s.sort_order ?? i,
  }));

  const { data, error } = await supabase
    .from("trip_stop")
    .insert(rows)
    .select(STOP_SELECT)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as TripStop[];
}

function normalizeStopInputs(
  stops: TripCreateRequest["stops"] | undefined
): TripStopInput[] {
  if (!stops?.length) return [];
  return stops.map((s, i) => ({
    name: s.name,
    place_id: s.place_id ?? null,
    lat: s.lat ?? null,
    lng: s.lng ?? null,
    start_date: s.start_date,
    end_date: s.end_date,
    sort_order: s.sort_order ?? i,
  }));
}

export async function createTrip(trip: TripCreateRequest): Promise<Trip> {
  const userId = await getCurrentUserId();
  const stopInputs = normalizeStopInputs(trip.stops);
  const fromStops = destinationFieldsFromStops(stopInputs);
  const { stops, ...tripFields } = trip;
  void stops;
  const row = {
    ...tripFields,
    destination: fromStops.destination ?? tripFields.destination ?? null,
    destination_lat:
      fromStops.destination_lat ?? tripFields.destination_lat ?? null,
    destination_lng:
      fromStops.destination_lng ?? tripFields.destination_lng ?? null,
    destination_place_id:
      fromStops.destination_place_id ??
      tripFields.destination_place_id ??
      null,
    user_id: userId,
  };

  const { data, error } = await supabase
    .from("trip")
    .insert([row])
    .select()
    .single();
  if (error) throw new Error(error.message);

  try {
    await ensureTripOwnerMember(data.id, userId);
  } catch {
    // migration may not be applied yet
  }

  if (stopInputs.length > 0) {
    await replaceTripStops(data.id, stopInputs, { skipAccessCheck: true });
  }

  await seedTripDefaults(data);
  return data;
}

async function seedTripDefaults(trip: Trip): Promise<void> {
  const days = generateItineraryDays(trip.id, trip.start_date, trip.end_date);
  if (days.length > 0) {
    await supabase.from("trip_itinerary_day").insert(days);
  }
}

/** Alinha `trip_itinerary_day` ao intervalo atual da viagem. */
async function syncItineraryDaysToTripDates(
  tripId: string,
  startDate: string,
  endDate: string
): Promise<void> {
  const { data: days, error } = await supabase
    .from("trip_itinerary_day")
    .select("id, date, day_number, title")
    .eq("trip_id", tripId);
  if (error) throw new Error(error.message);

  const plan = planItineraryDateSync(tripId, startDate, endDate, days ?? []);

  if (plan.deleteIds.length > 0) {
    const { error: actError } = await supabase
      .from("trip_itinerary_activity")
      .delete()
      .in("day_id", plan.deleteIds);
    if (actError) throw new Error(actError.message);

    const { error: dayError } = await supabase
      .from("trip_itinerary_day")
      .delete()
      .in("id", plan.deleteIds);
    if (dayError) throw new Error(dayError.message);
  }

  for (const u of plan.updates) {
    const { error: updError } = await supabase
      .from("trip_itinerary_day")
      .update({ day_number: u.day_number, title: u.title })
      .eq("id", u.id);
    if (updError) throw new Error(updError.message);
  }

  if (plan.insert.length > 0) {
    const { error: insError } = await supabase
      .from("trip_itinerary_day")
      .insert(plan.insert);
    if (insError) throw new Error(insError.message);
  }
}

export async function updateTrip(data: TripUpdateRequest): Promise<void> {
  const { id, stops, ...fields } = data;
  await assertTripAccess(id);

  const { data: before, error: beforeError } = await supabase
    .from("trip")
    .select("start_date, end_date")
    .eq("id", id)
    .maybeSingle();
  if (beforeError) throw new Error(beforeError.message);
  if (!before) throw new Error("Viagem não encontrada.");

  const stopInputs =
    stops !== undefined ? normalizeStopInputs(stops) : undefined;
  const patch = { ...fields };
  if (stopInputs) {
    const fromStops = destinationFieldsFromStops(stopInputs);
    patch.destination = fromStops.destination;
    patch.destination_lat = fromStops.destination_lat;
    patch.destination_lng = fromStops.destination_lng;
    patch.destination_place_id = fromStops.destination_place_id;
  }

  const { error } = await supabase
    .from("trip")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  if (stopInputs) {
    await replaceTripStops(id, stopInputs);
  }

  const nextStart =
    typeof patch.start_date === "string" ? patch.start_date : before.start_date;
  const nextEnd =
    typeof patch.end_date === "string" ? patch.end_date : before.end_date;
  const datesChanged =
    nextStart !== before.start_date || nextEnd !== before.end_date;
  if (datesChanged) {
    await syncItineraryDaysToTripDates(id, nextStart, nextEnd);
  }
}

export async function deleteTrip(id: string): Promise<void> {
  await assertTripAccess(id, "owner");
  const userId = await getCurrentUserId();

  // Desvincula visitas do roteiro antes de apagar lugares (evita FK).
  const { data: days, error: daysError } = await supabase
    .from("trip_itinerary_day")
    .select("id")
    .eq("trip_id", id);
  if (daysError) throw new Error(daysError.message);
  const dayIds = (days ?? []).map((d) => d.id as string);
  if (dayIds.length > 0) {
    const { error: unlinkError } = await supabase
      .from("trip_itinerary_activity")
      .update({ place_visit_id: null })
      .in("day_id", dayIds);
    if (unlinkError) throw new Error(unlinkError.message);
  }

  // Lugares da viagem (para visitar / visitados), alinhado ao diálogo de exclusão.
  const { error: placesError } = await supabase
    .from("place_visit")
    .delete()
    .eq("trip_id", id);
  if (placesError) throw new Error(placesError.message);

  const { error } = await supabase
    .from("trip")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

// ── Checklist ────────────────────────────────────────────────────────

export async function fetchTripChecklist(tripId: string): Promise<TripChecklistItem[]> {
  await assertTripAccess(tripId);
  const { data, error } = await supabase
    .from("trip_checklist_item")
    .select("*")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Checklist de várias viagens em uma query (lista / cards). */
export async function fetchChecklistsForTrips(
  tripIds: string[]
): Promise<TripChecklistItem[]> {
  if (tripIds.length === 0) return [];
  const { data, error } = await supabase
    .from("trip_checklist_item")
    .select("*")
    .in("trip_id", tripIds)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createChecklistItem(
  item: TripChecklistCreateRequest
): Promise<TripChecklistItem> {
  await assertTripAccess(item.trip_id);
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
  const { data: existing, error: fetchError } = await supabase
    .from("trip_checklist_item")
    .select("trip_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error("Item não encontrado.");
  await assertTripAccess(existing.trip_id);

  const { error } = await supabase
    .from("trip_checklist_item")
    .update(fields)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteChecklistItem(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("trip_checklist_item")
    .select("trip_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error("Item não encontrado.");
  await assertTripAccess(existing.trip_id);

  const { error } = await supabase
    .from("trip_checklist_item")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Expenses ─────────────────────────────────────────────────────────

export async function fetchTripExpenses(tripId: string): Promise<TripExpense[]> {
  const access = await assertTripAccess(tripId);
  const { data, error } = await supabase
    .from("trip_expense")
    .select("*")
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
    .select("*")
    .in("expense_id", ids);
  if (splitError && !splitError.message.includes("trip_expense_split")) {
    throw new Error(splitError.message);
  }

  return rows.map((e) => ({
    ...e,
    splits: (splits ?? []).filter((s) => s.expense_id === e.id),
  }));
}

import { sumTripSpent } from "@/domain/travel/spent";

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

export async function createTripExpense(
  expense: TripExpenseCreateRequest,
  transaction?: TransactionCreateRequest | null
): Promise<TripExpense> {
  const access = await assertTripAccess(expense.trip_id);
  const { splits, ...rest } = expense;
  const visibility = rest.visibility ?? "personal";

  let transactionId: number | null = null;
  if (
    visibility === "personal" &&
    transaction &&
    transaction.class_id > 0 &&
    transaction.value > 0
  ) {
    transactionId = await insertTransaction(transaction);
  }

  const { data, error } = await supabase
    .from("trip_expense")
    .insert([
      {
        ...rest,
        visibility,
        created_by_user_id: access.userId,
        paid_by_user_id: rest.paid_by_user_id ?? access.userId,
        transaction_id: transactionId,
      },
    ])
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (visibility === "shared" && splits?.length) {
    const { error: splitError } = await supabase.from("trip_expense_split").insert(
      splits.map((s) => ({
        expense_id: data.id,
        user_id: s.user_id,
        amount: s.amount,
      }))
    );
    if (splitError) throw new Error(splitError.message);

    // Opcional: registrar fatia do criador no ledger
    if (transaction && transaction.class_id > 0 && transaction.value > 0) {
      const mySplit = splits.find((s) => s.user_id === access.userId);
      if (mySplit && mySplit.amount > 0) {
        const txId = await insertTransaction({
          ...transaction,
          value: mySplit.amount,
          description:
            transaction.description ||
            tripLedgerDescription("compartilhada", expense.description, {
              shareSlice: true,
            }),
        });
        await supabase
          .from("trip_expense_split")
          .update({ transaction_id: txId })
          .eq("expense_id", data.id)
          .eq("user_id", access.userId);
      }
    }
  }

  await syncTripSpent(expense.trip_id);
  const withSplits = await fetchTripExpenses(expense.trip_id);
  return withSplits.find((e) => e.id === data.id) ?? data;
}

/** Registra a fatia do usuário atual no extrato pessoal. */
export async function registerMyExpenseSplit(
  expenseId: string,
  transaction: TransactionCreateRequest
): Promise<void> {
  const userId = await getCurrentUserId();
  const { data: expense, error } = await supabase
    .from("trip_expense")
    .select("trip_id, description")
    .eq("id", expenseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!expense) throw new Error("Gasto não encontrado.");
  await assertTripAccess(expense.trip_id);

  const { data: split, error: splitError } = await supabase
    .from("trip_expense_split")
    .select("*")
    .eq("expense_id", expenseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (splitError) throw new Error(splitError.message);
  if (!split) throw new Error("Você não tem fatia neste gasto.");
  if (split.transaction_id) throw new Error("Fatia já registrada no extrato.");

  const txId = await insertTransaction({
    ...transaction,
    value: Number(split.amount),
    description:
      transaction.description ||
      tripLedgerDescription("compartilhada", expense.description, {
        shareSlice: true,
      }),
  });
  const { error: upd } = await supabase
    .from("trip_expense_split")
    .update({ transaction_id: txId })
    .eq("id", split.id);
  if (upd) throw new Error(upd.message);
}

export async function updateTripExpense(
  data: TripExpenseUpdateRequest,
  options?: {
    /** Atualiza a transação vinculada (valor, data, descrição, classe). */
    syncTransaction?: {
      value: number;
      description: string;
      transaction_at: string;
      class_id?: number;
    } | null;
  }
): Promise<void> {
  const { id, splits, ...fields } = data as TripExpenseUpdateRequest & {
    splits?: { user_id: string; amount: number }[];
  };
  const { data: existing, error: fetchError } = await supabase
    .from("trip_expense")
    .select(
      "trip_id, created_by_user_id, visibility, place_visit_id, transaction_id, amount, expense_date, description"
    )
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error("Gasto não encontrado.");
  const access = await assertTripAccess(existing.trip_id);
  const userId = access.userId;

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
    .update(fields)
    .eq("id", id);
  if (error) throw new Error(error.message);

  if (splits) {
    await supabase.from("trip_expense_split").delete().eq("expense_id", id);
    if (splits.length > 0) {
      const { error: splitError } = await supabase
        .from("trip_expense_split")
        .insert(
          splits.map((s) => ({
            expense_id: id,
            user_id: s.user_id,
            amount: s.amount,
          }))
        );
      if (splitError) throw new Error(splitError.message);
    }
  }

  const nextAmount =
    fields.amount !== undefined ? Number(fields.amount) : Number(existing.amount);
  const nextDate = fields.expense_date ?? existing.expense_date;
  const nextDescription =
    fields.description ?? (existing.description as string);

  // Gasto veio de um lugar → espelha valor/data no lugar.
  if (existing.place_visit_id) {
    const placePatch: Record<string, unknown> = {
      amount: nextAmount > 0 ? nextAmount : null,
    };
    if (fields.expense_date) {
      placePatch.visited_date = fields.expense_date;
    }
    if (!(nextAmount > 0)) {
      placePatch.transaction_id = null;
    }
    const { error: placeError } = await supabase
      .from("place_visit")
      .update(placePatch)
      .eq("id", existing.place_visit_id);
    if (placeError) throw new Error(placeError.message);
  }

  const txId = existing.transaction_id as number | null;
  if (txId) {
    if (nextAmount > 0) {
      const sync = options?.syncTransaction;
      const payload: Record<string, unknown> = {
        value: sync?.value ?? nextAmount,
        description: sync?.description ?? nextDescription,
        transaction_at:
          sync?.transaction_at ??
          new Date(`${nextDate}T12:00:00`).toISOString(),
      };
      if (sync?.class_id) {
        payload.class_id = sync.class_id;
      }
      const { error: txError } = await supabase
        .from("transaction")
        .update(payload)
        .eq("id", txId)
        .eq("user_id", userId);
      if (txError) throw new Error(txError.message);
    } else {
      await deleteTransactionApi(txId);
      await supabase
        .from("trip_expense")
        .update({ transaction_id: null })
        .eq("id", id);
      if (existing.place_visit_id) {
        await supabase
          .from("place_visit")
          .update({ transaction_id: null })
          .eq("id", existing.place_visit_id);
      }
    }
  }

  await syncTripSpent(fields.trip_id ?? existing.trip_id);
}

export async function deleteTripExpense(
  id: string,
  tripId: string
): Promise<void> {
  const access = await assertTripAccess(tripId);
  const { data: existing } = await supabase
    .from("trip_expense")
    .select(
      "created_by_user_id, visibility, place_visit_id, transaction_id"
    )
    .eq("id", id)
    .maybeSingle();
  if (
    existing &&
    (existing.visibility ?? "personal") === "personal" &&
    existing.created_by_user_id &&
    existing.created_by_user_id !== access.userId &&
    access.role !== "owner"
  ) {
    throw new Error("Só quem criou o gasto pessoal pode excluí-lo.");
  }

  const placeVisitId = existing?.place_visit_id as string | null | undefined;
  const transactionId = existing?.transaction_id as number | null | undefined;

  const { error } = await supabase.from("trip_expense").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (placeVisitId) {
    const { error: placeError } = await supabase
      .from("place_visit")
      .update({ amount: null, transaction_id: null })
      .eq("id", placeVisitId);
    if (placeError) throw new Error(placeError.message);
  }

  if (transactionId) {
    try {
      await deleteTransactionApi(transactionId);
    } catch {
      // já removida
    }
  }

  await syncTripSpent(tripId);
}

// ── Itinerary ────────────────────────────────────────────────────────

const TRANSFER_ENDPOINT_KEYS = [
  "origin_label",
  "origin_lat",
  "origin_lng",
  "origin_place_id",
  "destination_label",
  "destination_lat",
  "destination_lng",
  "destination_place_id",
] as const;

function stripMissingActivityColumns(
  payload: Record<string, unknown>,
  message: string
): { payload: Record<string, unknown>; stripped: boolean } {
  let next = { ...payload };
  let stripped = false;
  const drop = (key: string) => {
    if (!(key in next)) return;
    const { [key]: _removed, ...rest } = next;
    void _removed;
    next = rest;
    stripped = true;
  };
  if (message.includes("arrival_time")) drop("arrival_time");
  if (message.includes("transport_mode")) drop("transport_mode");
  if (message.includes("transport_scope")) drop("transport_scope");
  // Endpoints vão juntos: se o schema ainda não tem uma, remove o bloco todo.
  if (TRANSFER_ENDPOINT_KEYS.some((key) => message.includes(key))) {
    for (const key of TRANSFER_ENDPOINT_KEYS) drop(key);
  }
  return { payload: next, stripped };
}

export async function fetchTripItinerary(tripId: string): Promise<TripItineraryDay[]> {
  await assertTripAccess(tripId);
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
  // RLS cobre acesso, evita waterfall day → assertTripAccess.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Usuário não autenticado.");
  const meta = user.user_metadata as
    | {
        full_name?: string;
        name?: string;
        avatar_url?: string;
        picture?: string;
      }
    | undefined;
  const userId = user.id;
  const created_by_name =
    meta?.full_name?.trim() ||
    meta?.name?.trim() ||
    user.email?.split("@")[0] ||
    "Viajante";
  const created_by_avatar =
    meta?.avatar_url?.trim() || meta?.picture?.trim() || null;

  const withAuthor = {
    ...activity,
    created_by_user_id: userId,
    created_by_name,
    created_by_avatar,
  };

  const first = await supabase
    .from("trip_itinerary_activity")
    .insert([withAuthor])
    .select()
    .single();

  if (!first.error) return first.data;

  const msg = first.error.message;
  const missingAuthor =
    msg.includes("created_by") || first.error.code === "PGRST204";
  const stripped = stripMissingActivityColumns({ ...withAuthor }, msg);
  if (!stripped.stripped && !missingAuthor) throw new Error(msg);

  const payload: Record<string, unknown> = stripped.payload;

  let retry = await supabase
    .from("trip_itinerary_activity")
    .insert([payload])
    .select()
    .single();

  if (
    retry.error &&
    (retry.error.message.includes("created_by") ||
      retry.error.code === "PGRST204")
  ) {
    const {
      created_by_user_id: _u,
      created_by_name: _n,
      created_by_avatar: _v,
      ...rest
    } = payload;
    void _u;
    void _n;
    void _v;
    retry = await supabase
      .from("trip_itinerary_activity")
      .insert([rest])
      .select()
      .single();
  }

  if (retry.error) {
    const again = stripMissingActivityColumns(
      payload,
      retry.error.message
    );
    if (again.stripped) {
      retry = await supabase
        .from("trip_itinerary_activity")
        .insert([again.payload])
        .select()
        .single();
    }
  }

  if (retry.error) throw new Error(retry.error.message);
  return {
    ...retry.data,
    created_by_user_id: userId,
    created_by_name,
    created_by_avatar,
  };
}

export async function updateItineraryActivity(
  data: TripItineraryActivityUpdateRequest
): Promise<void> {
  const { id, ...fields } = data;
  // Update direto (RLS cobre acesso), sem day/trip/assert extras.
  const { error } = await supabase
    .from("trip_itinerary_activity")
    .update(fields)
    .eq("id", id);
  if (!error) return;

  const msg = error.message;
  const { payload: patch, stripped } = stripMissingActivityColumns(
    { ...fields } as Record<string, unknown>,
    msg
  );
  if (!stripped) throw new Error(msg);

  const retry = await supabase
    .from("trip_itinerary_activity")
    .update(patch)
    .eq("id", id);
  if (retry.error) throw new Error(retry.error.message);
}

/** Checklist da visita: completed | skipped | pending (desfazer). */
export async function setItineraryVisitStatus(
  id: string,
  status: "pending" | "completed" | "skipped"
): Promise<void> {
  const now = new Date().toISOString();
  const patch =
    status === "completed"
      ? {
          visit_status: "completed" as const,
          completed_at: now,
          skipped_at: null,
        }
      : status === "skipped"
        ? {
            visit_status: "skipped" as const,
            skipped_at: now,
            completed_at: null,
          }
        : {
            visit_status: "pending" as const,
            completed_at: null,
            skipped_at: null,
          };

  // Update direto (RLS cobre acesso), sem assert + fetches extras.
  const { error } = await supabase
    .from("trip_itinerary_activity")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteItineraryActivity(id: string): Promise<void> {
  // Delete direto (RLS cobre acesso), sem assert + fetches extras.
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
  // Update direto (RLS cobre acesso).
  const { error } = await supabase
    .from("trip_itinerary_day")
    .update({ notes, ...(title !== undefined ? { title } : {}) })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Milestones ───────────────────────────────────────────────────────

export async function fetchTripMilestones(tripId: string): Promise<TripMilestone[]> {
  await assertTripAccess(tripId);
  const { data, error } = await supabase
    .from("trip_milestone")
    .select("*")
    .eq("trip_id", tripId)
    .order("due_date", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Milestones de várias viagens em uma query (timeline / hub). */
export async function fetchMilestonesForTrips(
  tripIds: string[]
): Promise<TripMilestone[]> {
  if (tripIds.length === 0) return [];
  const { data, error } = await supabase
    .from("trip_milestone")
    .select("*")
    .in("trip_id", tripIds)
    .order("due_date", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createTripMilestone(
  milestone: TripMilestoneCreateRequest
): Promise<TripMilestone> {
  await assertTripAccess(milestone.trip_id);
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
  const { data: existing, error: fetchError } = await supabase
    .from("trip_milestone")
    .select("trip_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error("Prazo não encontrado.");
  await assertTripAccess(existing.trip_id);

  const { error } = await supabase
    .from("trip_milestone")
    .update(fields)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTripMilestone(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("trip_milestone")
    .select("trip_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error("Prazo não encontrado.");
  await assertTripAccess(existing.trip_id);

  const { error } = await supabase.from("trip_milestone").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Re-export for Travel list page
export { enrichTrip } from "@/domain/travel";
