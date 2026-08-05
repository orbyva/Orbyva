import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { assertTripAccess } from "@/lib/tripAccess";
import {
  deleteTransactionApi,
  insertTransaction,
} from "@/api/finance";
import {
  placeLedgerDescription,
  placeTypeToExpenseCategory,
  summarizePlaceOpinions,
  withNormalizedPlaceStatus,
} from "@/domain/places";
import { sumTripSpent } from "@/domain/travel/spent";
import type {
  PlaceOpinionSummary,
  PlaceType,
  PlaceVisit,
  PlaceVisitCreateRequest,
  PlaceVisitUpdateRequest,
} from "@/types/places";
import type { TransactionCreateRequest } from "@/types/finance";
import type { TripPlaceOpinion } from "@/types/tripSharing";

const PLACE_LIST_SELECT =
  "id, user_id, trip_id, name, type, status, rating, notes, visited_date, amount, transaction_id, address, lat, lng, geoapify_place_id, google_place_id, would_recommend, created_at, trip:trip_id(id, title, destination)";

function normalizeRows(rows: PlaceVisit[] | null): PlaceVisit[] {
  return (rows ?? []).map(withNormalizedPlaceStatus);
}

function normalizeAmount(
  status: string,
  amount?: number | null
): number | null {
  if (status === "to_visit") return null;
  return amount != null && amount > 0 ? amount : null;
}

async function deleteLinkedTransaction(
  transactionId: number | null | undefined
): Promise<void> {
  if (!transactionId) return;
  try {
    await deleteTransactionApi(transactionId);
  } catch {
    // Transação já removida / sem permissão — segue o fluxo do lugar.
  }
}

async function syncTripSpentLocal(tripId: string): Promise<void> {
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

async function findExpenseForPlace(
  placeVisitId: string
): Promise<{ id: string; trip_id: string; transaction_id: number | null } | null> {
  const { data, error } = await supabase
    .from("trip_expense")
    .select("id, trip_id, transaction_id")
    .eq("place_visit_id", placeVisitId)
    .maybeSingle();
  if (error) {
    if (/place_visit_id/i.test(error.message) || error.code === "PGRST204") {
      return null;
    }
    throw new Error(error.message);
  }
  return data;
}

async function removePlaceTripExpense(placeVisitId: string): Promise<void> {
  const existing = await findExpenseForPlace(placeVisitId);
  if (!existing) return;
  const { error } = await supabase
    .from("trip_expense")
    .delete()
    .eq("id", existing.id);
  if (error) throw new Error(error.message);
  await syncTripSpentLocal(existing.trip_id);
}

/**
 * Cria/atualiza gasto pessoal da viagem a partir do valor do lugar.
 * Reusa o mesmo transaction_id do lugar (sem duplicar no extrato).
 */
async function upsertPlaceTripExpense(params: {
  placeVisitId: string;
  tripId: string;
  name: string;
  type: PlaceType;
  amount: number;
  expenseDate: string;
  transactionId: number | null;
  userId: string;
}): Promise<void> {
  await assertTripAccess(params.tripId);
  const description = placeLedgerDescription({
    name: params.name,
    type: params.type,
  });
  const category = placeTypeToExpenseCategory(params.type);
  const existing = await findExpenseForPlace(params.placeVisitId);

  if (existing) {
    if (existing.trip_id !== params.tripId) {
      const { error: delError } = await supabase
        .from("trip_expense")
        .delete()
        .eq("id", existing.id);
      if (delError) throw new Error(delError.message);
      await syncTripSpentLocal(existing.trip_id);
    } else {
      const { error } = await supabase
        .from("trip_expense")
        .update({
          description,
          amount: params.amount,
          category,
          expense_date: params.expenseDate,
          transaction_id: params.transactionId,
          visibility: "personal",
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      await syncTripSpentLocal(params.tripId);
      return;
    }
  }

  const { error } = await supabase.from("trip_expense").insert([
    {
      trip_id: params.tripId,
      description,
      amount: params.amount,
      category,
      expense_date: params.expenseDate,
      visibility: "personal",
      created_by_user_id: params.userId,
      paid_by_user_id: params.userId,
      transaction_id: params.transactionId,
      place_visit_id: params.placeVisitId,
    },
  ]);
  if (error) {
    if (/place_visit_id/i.test(error.message) || error.code === "PGRST204") {
      // Migration ainda não aplicada — lugar/extrato seguem sem gasto de viagem.
      return;
    }
    throw new Error(error.message);
  }
  await syncTripSpentLocal(params.tripId);
}

export async function fetchPlaces(
  tripId?: string | null
): Promise<PlaceVisit[]> {
  const userId = await getCurrentUserId();

  if (tripId) {
    await assertTripAccess(tripId);
    const { data, error } = await supabase
      .from("place_visit")
      .select(PLACE_LIST_SELECT)
      .eq("trip_id", tripId)
      .order("visited_date", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return normalizeRows(data as unknown as PlaceVisit[]);
  }

  const { data, error } = await supabase
    .from("place_visit")
    .select(PLACE_LIST_SELECT)
    .eq("user_id", userId)
    .order("visited_date", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return normalizeRows(data as unknown as PlaceVisit[]);
}

/** Contagem leve para hub — sem baixar visitas. */
export async function fetchPlacesCount(): Promise<number> {
  const userId = await getCurrentUserId();
  const { count, error } = await supabase
    .from("place_visit")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return count || 0;
}

export async function fetchPlaceById(id: string): Promise<PlaceVisit | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("place_visit")
    .select(PLACE_LIST_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const place = withNormalizedPlaceStatus(data as unknown as PlaceVisit);
  if (place.user_id === userId) return place;
  if (place.trip_id) {
    try {
      await assertTripAccess(place.trip_id);
      return place;
    } catch {
      return null;
    }
  }
  return null;
}

export async function createPlace(
  place: PlaceVisitCreateRequest,
  options?: {
    transaction?: TransactionCreateRequest | null;
  }
): Promise<PlaceVisit> {
  const userId = await getCurrentUserId();
  if (place.trip_id) {
    await assertTripAccess(place.trip_id);
  }
  const status = place.status ?? (place.visited_date ? "visited" : "to_visit");
  const amount = normalizeAmount(status, place.amount);

  let transactionId: number | null = place.transaction_id ?? null;
  if (
    options?.transaction &&
    options.transaction.class_id > 0 &&
    options.transaction.value > 0 &&
    amount != null
  ) {
    transactionId = await insertTransaction({
      ...options.transaction,
      value: amount,
    });
  }

  const payload = {
    ...place,
    status,
    visited_date: status === "to_visit" ? null : place.visited_date,
    rating: status === "to_visit" ? null : place.rating,
    amount,
    transaction_id: transactionId,
    would_recommend: place.would_recommend !== false,
    user_id: userId,
  };
  const { data, error } = await supabase
    .from("place_visit")
    .insert([payload])
    .select("*, trip:trip_id(id, title, destination)")
    .single();
  if (error) {
    // Migration ainda não aplicada — salva sem colunas novas.
    if (
      /status|amount|transaction_id|lat|lng|google_place_id|geoapify_place_id/i.test(
        error.message
      ) ||
      error.code === "PGRST204"
    ) {
      const legacy = { ...payload } as Record<string, unknown>;
      delete legacy.status;
      delete legacy.amount;
      delete legacy.transaction_id;
      delete legacy.lat;
      delete legacy.lng;
      delete legacy.google_place_id;
      delete legacy.geoapify_place_id;
      const retry = await supabase
        .from("place_visit")
        .insert([{ ...legacy, user_id: userId }])
        .select("*, trip:trip_id(id, title, destination)")
        .single();
      if (retry.error) throw new Error(retry.error.message);
      return withNormalizedPlaceStatus(retry.data);
    }
    throw new Error(error.message);
  }

  if (place.trip_id && status === "visited") {
    try {
      await upsertPlaceOpinion(data.id, {
        rating: place.rating ?? null,
        notes: place.notes ?? null,
        would_recommend: place.would_recommend !== false,
      });
    } catch {
      // table may not exist yet
    }
  }

  if (place.trip_id && amount != null && status === "visited") {
    try {
      await upsertPlaceTripExpense({
        placeVisitId: data.id,
        tripId: place.trip_id,
        name: place.name,
        type: place.type,
        amount,
        expenseDate: place.visited_date ?? new Date().toISOString().split("T")[0],
        transactionId,
        userId,
      });
    } catch {
      // migration / permissão — lugar já salvo
    }
  }

  return withNormalizedPlaceStatus(data);
}

export async function updatePlace(
  data: PlaceVisitUpdateRequest,
  options?: {
    /** Cria despesa se ainda não houver vínculo. */
    transaction?: TransactionCreateRequest | null;
    /** Atualiza a despesa já vinculada. */
    syncTransaction?: {
      value: number;
      description: string;
      transaction_at: string;
      class_id?: number;
    } | null;
    /** Remove a despesa vinculada (ex.: voltou para Para visitar / zerou valor). */
    removeTransaction?: boolean;
  }
): Promise<void> {
  const userId = await getCurrentUserId();
  const existing = await fetchPlaceById(data.id);
  if (!existing) throw new Error("Lugar não encontrado.");

  const canEditPlace =
    existing.user_id === userId ||
    (existing.trip_id
      ? (await assertTripAccess(existing.trip_id)
          .then(() => true)
          .catch(() => false))
      : false);
  if (!canEditPlace) throw new Error("Sem permissão para editar este lugar.");

  const { id, ...raw } = data;
  const status =
    raw.status ??
    existing.status ??
    (raw.visited_date ?? existing.visited_date ? "visited" : "to_visit");
  const amount =
    raw.amount !== undefined || status === "to_visit"
      ? normalizeAmount(status, raw.amount)
      : existing.amount ?? null;

  let transactionId = existing.transaction_id ?? null;

  if (options?.removeTransaction || amount == null) {
    await deleteLinkedTransaction(transactionId);
    transactionId = null;
  } else if (transactionId && options?.syncTransaction) {
    const payload: Record<string, unknown> = {
      value: options.syncTransaction.value,
      description: options.syncTransaction.description,
      transaction_at: options.syncTransaction.transaction_at,
    };
    if (options.syncTransaction.class_id) {
      payload.class_id = options.syncTransaction.class_id;
    }
    const { error: txError } = await supabase
      .from("transaction")
      .update(payload)
      .eq("id", transactionId)
      .eq("user_id", userId);
    if (txError) throw new Error(txError.message);
  } else if (
    !transactionId &&
    options?.transaction &&
    options.transaction.class_id > 0 &&
    options.transaction.value > 0
  ) {
    transactionId = await insertTransaction({
      ...options.transaction,
      value: amount,
    });
  }

  const fields = {
    ...raw,
    amount,
    transaction_id: transactionId,
  };
  // Só o autor altera a row base; membros usam opinião
  if (existing.user_id === userId) {
    const { error } = await supabase
      .from("place_visit")
      .update(fields)
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  const tripId = (raw.trip_id !== undefined ? raw.trip_id : existing.trip_id) ?? null;
  const placeName = raw.name ?? existing.name;
  const placeType = (raw.type ?? existing.type) as PlaceType;
  const visitedDate =
    status === "visited"
      ? (raw.visited_date ?? existing.visited_date ??
        new Date().toISOString().split("T")[0])
      : null;

  if (existing.user_id === userId) {
    if (tripId && amount != null && status === "visited" && visitedDate) {
      await upsertPlaceTripExpense({
        placeVisitId: id,
        tripId,
        name: placeName,
        type: placeType,
        amount,
        expenseDate: visitedDate,
        transactionId,
        userId,
      });
    } else {
      await removePlaceTripExpense(id);
    }
  }

  if (tripId) {
    await upsertPlaceOpinion(id, {
      rating: fields.rating ?? existing.rating ?? null,
      notes: fields.notes ?? existing.notes ?? null,
      would_recommend:
        fields.would_recommend ?? existing.would_recommend ?? true,
    });
  }
}

export async function deletePlace(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const existing = await fetchPlaceById(id);
  if (!existing) throw new Error("Lugar não encontrado.");
  if (existing.user_id !== userId) {
    if (existing.trip_id) {
      await assertTripAccess(existing.trip_id, "owner");
    } else {
      throw new Error("Sem permissão para excluir.");
    }
  }
  // Gasto da viagem some via ON DELETE CASCADE em place_visit_id.
  const linkedExpense = await findExpenseForPlace(id);
  const { error } = await supabase.from("place_visit").delete().eq("id", id);
  if (error) throw new Error(error.message);
  if (linkedExpense) {
    await syncTripSpentLocal(linkedExpense.trip_id);
  }
  await deleteLinkedTransaction(existing.transaction_id);
}

export async function countPlacesByTrip(tripId: string): Promise<number> {
  await assertTripAccess(tripId);
  const { count, error } = await supabase
    .from("place_visit")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function fetchPlaceOpinions(
  placeVisitId: string
): Promise<TripPlaceOpinion[]> {
  const place = await fetchPlaceById(placeVisitId);
  if (!place) throw new Error("Lugar não encontrado.");

  const { data, error } = await supabase
    .from("trip_place_opinion")
    .select("*")
    .eq("place_visit_id", placeVisitId)
    .order("updated_at", { ascending: false });
  if (error) {
    if (error.message.includes("trip_place_opinion") || error.code === "42P01") {
      // Fallback: opinião do autor na própria row
      return [
        {
          id: "legacy",
          place_visit_id: placeVisitId,
          user_id: place.user_id ?? "",
          rating: place.rating,
          notes: place.notes,
          would_recommend: place.would_recommend,
        },
      ];
    }
    throw new Error(error.message);
  }

  const opinions = data ?? [];
  if (opinions.length === 0 && place.user_id) {
    return [
      {
        id: "legacy",
        place_visit_id: placeVisitId,
        user_id: place.user_id,
        rating: place.rating,
        notes: place.notes,
        would_recommend: place.would_recommend,
      },
    ];
  }

  // Enrich with display names from trip_member when possible
  if (place.trip_id && opinions.length > 0) {
    const { data: members } = await supabase
      .from("trip_member")
      .select("user_id, display_name")
      .eq("trip_id", place.trip_id);
    const nameByUser = new Map(
      (members ?? []).map((m) => [m.user_id, m.display_name as string | null])
    );
    return opinions.map((o) => ({
      ...o,
      display_name: nameByUser.get(o.user_id) ?? null,
    }));
  }

  return opinions;
}

export async function upsertPlaceOpinion(
  placeVisitId: string,
  opinion: {
    rating?: number | null;
    notes?: string | null;
    would_recommend?: boolean;
  }
): Promise<void> {
  const userId = await getCurrentUserId();
  const place = await fetchPlaceById(placeVisitId);
  if (!place?.trip_id) {
    throw new Error("Opiniões em grupo só valem para lugares de viagem.");
  }
  await assertTripAccess(place.trip_id);

  const { error } = await supabase.from("trip_place_opinion").upsert(
    {
      place_visit_id: placeVisitId,
      user_id: userId,
      rating: opinion.rating ?? null,
      notes: opinion.notes ?? null,
      would_recommend: opinion.would_recommend !== false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "place_visit_id,user_id" }
  );
  if (error) throw new Error(error.message);
}

/** Busca opiniões em lote e devolve mapa placeId → summary. */
export async function fetchOpinionSummariesForPlaces(
  places: PlaceVisit[]
): Promise<Record<string, PlaceOpinionSummary>> {
  if (places.length === 0) return {};

  const ids = places.map((p) => p.id);
  const { data, error } = await supabase
    .from("trip_place_opinion")
    .select("place_visit_id, rating, would_recommend")
    .in("place_visit_id", ids);

  const byPlace = new Map<
    string,
    { rating?: number | null; would_recommend?: boolean }[]
  >();

  if (!error && data) {
    for (const row of data) {
      const list = byPlace.get(row.place_visit_id) ?? [];
      list.push({
        rating: row.rating,
        would_recommend: row.would_recommend,
      });
      byPlace.set(row.place_visit_id, list);
    }
  }

  const result: Record<string, PlaceOpinionSummary> = {};
  for (const place of places) {
    const opinions = byPlace.get(place.id);
    if (opinions && opinions.length > 0) {
      result[place.id] = summarizePlaceOpinions(opinions);
    } else {
      // Fallback: row do lugar conta como 1 opinião
      result[place.id] = summarizePlaceOpinions([
        {
          rating: place.rating,
          would_recommend: place.would_recommend,
        },
      ]);
    }
  }
  return result;
}

export async function enrichPlacesWithOpinions(
  places: PlaceVisit[]
): Promise<PlaceVisit[]> {
  const summaries = await fetchOpinionSummariesForPlaces(places);
  return places.map((p) => ({
    ...p,
    opinionSummary: summaries[p.id] ?? null,
  }));
}
