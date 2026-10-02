import {
  normalizePlaceStatus,
  summarizePlaceOpinions,
  withNormalizedPlaceStatus,
} from "@/domain/places";
import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import { assertTripAccess } from "@/lib/tripAccess";
import { createTransaction } from "@/api/finance/transactions";
import type {
  PlaceStatus,
  PlaceType,
  PlaceVisit,
  PlaceVisitOccurrence,
  TripPlaceOpinion,
} from "@/types/places";

const PLACE_LIST_SELECT =
  "id, user_id, trip_id, name, type, status, rating, notes, visited_date, amount, transaction_id, address, lat, lng, google_place_id, would_recommend, created_at, trip:trip_id(id, title, destination)";

function asTrip(value: unknown): PlaceVisit["trip"] {
  if (Array.isArray(value)) {
    const first = value[0] as PlaceVisit["trip"] | undefined;
    return first ?? null;
  }
  if (value && typeof value === "object" && "id" in value && "title" in value) {
    return value as PlaceVisit["trip"];
  }
  return null;
}

function normalizeRows(rows: unknown): PlaceVisit[] {
  return ((rows as Array<Record<string, unknown>> | null) ?? []).map((row) =>
    withNormalizedPlaceStatus({
      ...(row as unknown as PlaceVisit),
      trip: asTrip(row.trip),
    })
  );
}

export async function fetchPlaces(): Promise<PlaceVisit[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("place_visit")
    .select(PLACE_LIST_SELECT)
    .eq("user_id", userId)
    .order("visited_date", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return normalizeRows(data);
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
  const row = data as unknown as Record<string, unknown>;
  const place = withNormalizedPlaceStatus({
    ...(row as unknown as PlaceVisit),
    trip: asTrip(row.trip),
  });
  if (place.user_id === userId) return place;
  return place.trip_id ? place : null;
}

export async function createPlace(input: {
  name: string;
  type: PlaceType;
  status: PlaceStatus;
  address?: string | null;
  notes?: string | null;
  trip_id?: string | null;
  rating?: number | null;
  visited_date?: string | null;
  would_recommend?: boolean;
  lat?: number | null;
  lng?: number | null;
  google_place_id?: string | null;
  amount?: number | null;
  classId?: number | null;
}): Promise<PlaceVisit> {
  const userId = await getCurrentUserId();
  const status = input.status ?? (input.visited_date ? "visited" : "to_visit");
  const amount =
    status === "visited" && input.amount != null && input.amount > 0
      ? input.amount
      : null;
  let transactionId: number | null = null;
  if (amount && input.classId) {
    transactionId = await createTransaction({
      class_id: input.classId,
      value: amount,
      description: input.name.trim(),
      transaction_at: input.visited_date || new Date().toISOString().slice(0, 10),
    });
  }
  const payload = {
    name: input.name.trim(),
    type: input.type,
    status,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
    trip_id: input.trip_id || null,
    rating: status === "visited" ? input.rating ?? null : null,
    visited_date: status === "visited" ? input.visited_date ?? null : null,
    would_recommend: input.would_recommend !== false,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    google_place_id: input.google_place_id ?? null,
    amount,
    transaction_id: transactionId,
    user_id: userId,
  };
  const { data, error } = await supabase
    .from("place_visit")
    .insert([payload])
    .select(PLACE_LIST_SELECT)
    .single();
  if (error) throw new Error(error.message);
  const row = data as unknown as Record<string, unknown>;
  const created = withNormalizedPlaceStatus({
    ...(row as unknown as PlaceVisit),
    trip: asTrip(row.trip),
  });
  await syncOwnOpinion({ ...input, id: created.id, status });
  return created;
}

export async function updatePlace(input: {
  id: string;
  name: string;
  type: PlaceType;
  status: PlaceStatus;
  address?: string | null;
  notes?: string | null;
  trip_id?: string | null;
  rating?: number | null;
  visited_date?: string | null;
  would_recommend?: boolean;
  lat?: number | null;
  lng?: number | null;
  google_place_id?: string | null;
  amount?: number | null;
}): Promise<void> {
  const userId = await getCurrentUserId();
  const status = input.status;
  const { error } = await supabase
    .from("place_visit")
    .update({
      name: input.name.trim(),
      type: input.type,
      status,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
      trip_id: input.trip_id || null,
      rating: status === "visited" ? input.rating ?? null : null,
      visited_date: status === "visited" ? input.visited_date ?? null : null,
      would_recommend: input.would_recommend !== false,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      google_place_id: input.google_place_id ?? null,
      amount: status === "visited" ? input.amount ?? null : null,
    })
    .eq("id", input.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  await syncOwnOpinion(input);
}

/** Vincula um lugar salvo (sem viagem) a esta viagem. */
export async function linkPlaceToTrip(
  placeId: string,
  tripId: string
): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("place_visit")
    .update({ trip_id: tripId })
    .eq("id", placeId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function fetchPlaceVisitOccurrences(
  placeVisitId: string
): Promise<PlaceVisitOccurrence[]> {
  const { data, error } = await supabase
    .from("place_visit_occurrence")
    .select(
      "id, place_visit_id, user_id, visited_date, rating, notes, amount, would_recommend, transaction_id, created_at"
    )
    .eq("place_visit_id", placeVisitId)
    .order("visited_date", { ascending: false });
  if (error) {
    if (
      /place_visit_occurrence/i.test(error.message) ||
      error.code === "42P01"
    ) {
      return [];
    }
    throw new Error(error.message);
  }
  return (data ?? []) as PlaceVisitOccurrence[];
}

export async function createPlaceVisitOccurrence(input: {
  place_visit_id: string;
  visited_date: string;
  rating?: number | null;
  notes?: string | null;
  amount?: number | null;
  classId?: number | null;
}): Promise<void> {
  const userId = await getCurrentUserId();
  let transactionId: number | null = null;
  if (input.amount && input.amount > 0 && input.classId) {
    const place = await fetchPlaceById(input.place_visit_id);
    transactionId = await createTransaction({
      class_id: input.classId,
      value: input.amount,
      description: place?.name ?? "Visita",
      transaction_at: input.visited_date,
    });
  }
  const { error } = await supabase.from("place_visit_occurrence").insert([
    {
      place_visit_id: input.place_visit_id,
      user_id: userId,
      visited_date: input.visited_date,
      rating: input.rating ?? null,
      notes: input.notes?.trim() || null,
      amount: input.amount ?? null,
      would_recommend: true,
      transaction_id: transactionId,
    },
  ]);
  if (error) throw new Error(error.message);
}

export async function deletePlaceVisitOccurrence(id: string): Promise<void> {
  const { error } = await supabase
    .from("place_visit_occurrence")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

function isMissingOpinionTable(error: { message: string; code?: string }): boolean {
  return error.message.includes("trip_place_opinion") || error.code === "42P01";
}

/** A opinião do autor gravada na própria linha do lugar, usada quando não há `trip_place_opinion`. */
function legacyOpinion(place: PlaceVisit): TripPlaceOpinion {
  return {
    id: "legacy",
    place_visit_id: place.id,
    user_id: place.user_id ?? "",
    rating: place.rating,
    notes: place.notes,
    would_recommend: place.would_recommend,
  };
}

/** Opiniões dos membros da viagem sobre o lugar, com o nome de cada um quando houver. */
export async function fetchPlaceOpinions(placeVisitId: string): Promise<TripPlaceOpinion[]> {
  const place = await fetchPlaceById(placeVisitId);
  if (!place) throw new Error("Lugar não encontrado.");

  const { data, error } = await supabase
    .from("trip_place_opinion")
    .select("*")
    .eq("place_visit_id", placeVisitId)
    .order("updated_at", { ascending: false });
  if (error) {
    if (isMissingOpinionTable(error)) return [legacyOpinion(place)];
    throw new Error(error.message);
  }

  const opinions = (data ?? []) as TripPlaceOpinion[];
  if (opinions.length === 0) return place.user_id ? [legacyOpinion(place)] : [];
  if (!place.trip_id) return opinions;

  const { data: members } = await supabase
    .from("trip_member")
    .select("user_id, display_name")
    .eq("trip_id", place.trip_id);
  const nameByUser = new Map(
    ((members ?? []) as { user_id: string; display_name: string | null }[]).map((m) => [
      m.user_id,
      m.display_name,
    ])
  );
  return opinions.map((o) => ({ ...o, display_name: nameByUser.get(o.user_id) ?? null }));
}

/** Grava a opinião do usuário atual sobre um lugar de viagem (uma por membro). */
export async function upsertPlaceOpinion(
  placeVisitId: string,
  opinion: { rating?: number | null; notes?: string | null; would_recommend?: boolean }
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
      notes: opinion.notes?.trim() || null,
      would_recommend: opinion.would_recommend !== false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "place_visit_id,user_id" }
  );
  if (error) throw new Error(error.message);
}

/** Resumo das opiniões em lote; lugar sem opinião gravada conta a própria linha como uma. */
export async function enrichPlacesWithOpinions(places: PlaceVisit[]): Promise<PlaceVisit[]> {
  if (places.length === 0) return places;
  const { data, error } = await supabase
    .from("trip_place_opinion")
    .select("place_visit_id, rating, would_recommend")
    .in(
      "place_visit_id",
      places.map((p) => p.id)
    );

  const byPlace = new Map<string, { rating?: number | null; would_recommend?: boolean }[]>();
  if (!error && data) {
    for (const row of data as {
      place_visit_id: string;
      rating: number | null;
      would_recommend: boolean;
    }[]) {
      const list = byPlace.get(row.place_visit_id) ?? [];
      list.push({ rating: row.rating, would_recommend: row.would_recommend });
      byPlace.set(row.place_visit_id, list);
    }
  }
  return places.map((place) => ({
    ...place,
    opinionSummary: summarizePlaceOpinions(
      byPlace.get(place.id) ?? [{ rating: place.rating, would_recommend: place.would_recommend }]
    ),
  }));
}

/** Lugar de viagem visitado: a opinião do autor também vai para `trip_place_opinion`. */
async function syncOwnOpinion(place: {
  id: string;
  trip_id?: string | null;
  status: PlaceStatus;
  rating?: number | null;
  notes?: string | null;
  would_recommend?: boolean;
}): Promise<void> {
  if (!place.trip_id || place.status !== "visited") return;
  try {
    await upsertPlaceOpinion(place.id, {
      rating: place.rating ?? null,
      notes: place.notes ?? null,
      would_recommend: place.would_recommend !== false,
    });
  } catch {
    // tabela ainda não existe / sem acesso: o lugar já foi salvo
  }
}

export async function deletePlace(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("place_visit")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export { normalizePlaceStatus };
