import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { assertTripAccess } from "@/lib/tripAccess";
import { summarizePlaceOpinions } from "@/domain/places";
import type {
  PlaceOpinionSummary,
  PlaceVisit,
  PlaceVisitCreateRequest,
  PlaceVisitUpdateRequest,
} from "@/types/places";
import type { TripPlaceOpinion } from "@/types/tripSharing";

export async function fetchPlaces(
  tripId?: string | null
): Promise<PlaceVisit[]> {
  const userId = await getCurrentUserId();

  if (tripId) {
    await assertTripAccess(tripId);
    const { data, error } = await supabase
      .from("place_visit")
      .select("*, trip:trip_id(id, title, destination)")
      .eq("trip_id", tripId)
      .order("visited_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  const { data, error } = await supabase
    .from("place_visit")
    .select("*, trip:trip_id(id, title, destination)")
    .eq("user_id", userId)
    .order("visited_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchPlaceById(id: string): Promise<PlaceVisit | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("place_visit")
    .select("*, trip:trip_id(id, title, destination)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  if (data.user_id === userId) return data;
  if (data.trip_id) {
    try {
      await assertTripAccess(data.trip_id);
      return data;
    } catch {
      return null;
    }
  }
  return null;
}

export async function createPlace(
  place: PlaceVisitCreateRequest
): Promise<PlaceVisit> {
  const userId = await getCurrentUserId();
  if (place.trip_id) {
    await assertTripAccess(place.trip_id);
  }
  const { data, error } = await supabase
    .from("place_visit")
    .insert([{ ...place, user_id: userId }])
    .select("*, trip:trip_id(id, title, destination)")
    .single();
  if (error) throw new Error(error.message);

  if (place.trip_id) {
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

  return data;
}

export async function updatePlace(
  data: PlaceVisitUpdateRequest
): Promise<void> {
  const userId = await getCurrentUserId();
  const existing = await fetchPlaceById(data.id);
  if (!existing) throw new Error("Lugar não encontrado.");

  const canEditPlace =
    existing.user_id === userId ||
    (existing.trip_id
      ? (await assertTripAccess(existing.trip_id).then(() => true).catch(() => false))
      : false);
  if (!canEditPlace) throw new Error("Sem permissão para editar este lugar.");

  const { id, ...fields } = data;
  // Só o autor altera a row base; membros usam opinião
  if (existing.user_id === userId) {
    const { error } = await supabase
      .from("place_visit")
      .update(fields)
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  if (existing.trip_id) {
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
  const { error } = await supabase.from("place_visit").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function countPlacesByTrip(tripId: string): Promise<number> {
  await assertTripAccess(tripId);
  const { count, error } = await supabase
    .from("place_visit")
    .select("*", { count: "exact", head: true })
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
