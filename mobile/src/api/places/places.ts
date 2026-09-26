import {
  normalizePlaceStatus,
  withNormalizedPlaceStatus,
} from "@/domain/places";
import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import { createTransaction } from "@/api/finance/transactions";
import type {
  PlaceStatus,
  PlaceType,
  PlaceVisit,
  PlaceVisitOccurrence,
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
  return withNormalizedPlaceStatus({
    ...(row as unknown as PlaceVisit),
    trip: asTrip(row.trip),
  });
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
