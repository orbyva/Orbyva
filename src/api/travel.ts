import { supabase } from "@/lib/supabase";
import { deleteTransactionApi, insertTransaction } from "@/api/finance";
import type { TransactionCreateRequest } from "@/types/finance";
import {
  generateItineraryDays,
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
  TripUpdateRequest,
  TripWithChecklist,
} from "@/types/travel";
import type { PlaceVisit } from "@/types/places";
import type { TripMember, TripMemberRole } from "@/types/tripSharing";
import { enrichTrip, enrichTripFull } from "@/domain/travel";
import { tripLedgerDescription } from "@/domain/travel/ledger";
import { getCurrentUserId } from "@/lib/auth-user";
import { assertTripAccess, fetchMemberTripIds } from "@/lib/tripAccess";
import { ensureTripOwnerMember } from "@/api/tripMembers";

// ── Trips ────────────────────────────────────────────────────────────

const TRIP_LIST_SELECT =
  "id, user_id, title, destination, start_date, end_date, budget, spent, status, notes, origin_lat, origin_lng, origin_label, created_at, updated_at";

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

/** Progresso de checklist por viagem (só trip_id + done — lista). */
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

/** Places no detalhe — sem embed de trip (já temos a viagem). */
const PLACE_DETAIL_SELECT =
  "id, user_id, trip_id, name, type, status, rating, notes, visited_date, amount, transaction_id, address, lat, lng, geoapify_place_id, google_place_id, would_recommend, created_at";

const EXPENSE_SELECT =
  "id, trip_id, description, amount, category, expense_date, transaction_id, visibility, created_by_user_id, paid_by_user_id, place_visit_id, created_at";

const DAY_SELECT = "id, trip_id, day_number, date, title, notes";

const ACTIVITY_SELECT =
  "id, day_id, title, activity_time, notes, place_visit_id, sort_order, link_url, is_reserved, category, visit_status, completed_at, skipped_at, created_by_user_id, created_by_name, created_by_avatar";

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
  const [tripRes, expensesRes, daysRes, milestonesRes, placesRes, membersRes] =
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

export async function createTrip(trip: TripCreateRequest): Promise<Trip> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("trip")
    .insert([{ ...trip, user_id: userId }])
    .select()
    .single();
  if (error) throw new Error(error.message);

  await seedTripDefaults(data);
  try {
    await ensureTripOwnerMember(data.id, userId);
  } catch {
    // migration may not be applied yet
  }
  return data;
}

async function seedTripDefaults(trip: Trip): Promise<void> {
  const days = generateItineraryDays(trip.id, trip.start_date, trip.end_date);
  if (days.length > 0) {
    await supabase.from("trip_itinerary_day").insert(days);
  }
}

export async function updateTrip(data: TripUpdateRequest): Promise<void> {
  const { id, ...fields } = data;
  await assertTripAccess(id);
  const { error } = await supabase
    .from("trip")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTrip(id: string): Promise<void> {
  await assertTripAccess(id, "owner");
  const userId = await getCurrentUserId();
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
  const { data: day, error: dayError } = await supabase
    .from("trip_itinerary_day")
    .select("trip_id")
    .eq("id", activity.day_id)
    .maybeSingle();
  if (dayError) throw new Error(dayError.message);
  if (!day) throw new Error("Dia do roteiro não encontrado.");
  await assertTripAccess(day.trip_id);

  const userId = await getCurrentUserId();
  const { data: auth } = await supabase.auth.getUser();
  const meta = auth.user?.user_metadata as
    | {
        full_name?: string;
        name?: string;
        avatar_url?: string;
        picture?: string;
      }
    | undefined;
  const created_by_name =
    meta?.full_name?.trim() ||
    meta?.name?.trim() ||
    auth.user?.email?.split("@")[0] ||
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

  // Colunas de autor ainda não migradas — cria sem elas
  const missingAuthorCols =
    first.error.message.includes("created_by") ||
    first.error.code === "PGRST204";
  if (!missingAuthorCols) throw new Error(first.error.message);

  const fallback = await supabase
    .from("trip_itinerary_activity")
    .insert([activity])
    .select()
    .single();
  if (fallback.error) throw new Error(fallback.error.message);
  return {
    ...fallback.data,
    created_by_user_id: userId,
    created_by_name,
    created_by_avatar,
  };
}

export async function updateItineraryActivity(
  data: TripItineraryActivityUpdateRequest
): Promise<void> {
  const { id, ...fields } = data;
  const { data: existing, error: fetchError } = await supabase
    .from("trip_itinerary_activity")
    .select("day_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error("Atividade não encontrada.");

  const { data: day, error: dayError } = await supabase
    .from("trip_itinerary_day")
    .select("trip_id")
    .eq("id", existing.day_id)
    .maybeSingle();
  if (dayError) throw new Error(dayError.message);
  if (!day) throw new Error("Dia do roteiro não encontrado.");
  await assertTripAccess(day.trip_id);

  const { error } = await supabase
    .from("trip_itinerary_activity")
    .update(fields)
    .eq("id", id);
  if (error) throw new Error(error.message);
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

  // Update direto (RLS cobre acesso) — sem assert + fetches extras.
  const { error } = await supabase
    .from("trip_itinerary_activity")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteItineraryActivity(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("trip_itinerary_activity")
    .select("day_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error("Atividade não encontrada.");

  const { data: day, error: dayError } = await supabase
    .from("trip_itinerary_day")
    .select("trip_id")
    .eq("id", existing.day_id)
    .maybeSingle();
  if (dayError) throw new Error(dayError.message);
  if (!day) throw new Error("Dia do roteiro não encontrado.");
  await assertTripAccess(day.trip_id);

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
  const { data: day, error: dayError } = await supabase
    .from("trip_itinerary_day")
    .select("trip_id")
    .eq("id", id)
    .maybeSingle();
  if (dayError) throw new Error(dayError.message);
  if (!day) throw new Error("Dia do roteiro não encontrado.");
  await assertTripAccess(day.trip_id);

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
