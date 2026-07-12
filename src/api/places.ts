import { supabase } from "@/lib/supabase";
import type {
  PlaceVisit,
  PlaceVisitCreateRequest,
  PlaceVisitUpdateRequest,
} from "@/types/places";

async function getCurrentUserId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Usuário não autenticado.");
  return user.id;
}

export async function fetchPlaces(tripId?: string | null): Promise<PlaceVisit[]> {
  let query = supabase
    .from("place_visit")
    .select("*, trip:trip_id(id, title, destination)")
    .order("visited_date", { ascending: false });

  if (tripId) query = query.eq("trip_id", tripId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchPlaceById(id: string): Promise<PlaceVisit | null> {
  const { data, error } = await supabase
    .from("place_visit")
    .select("*, trip:trip_id(id, title, destination)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createPlace(
  place: PlaceVisitCreateRequest
): Promise<PlaceVisit> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("place_visit")
    .insert([{ ...place, user_id: userId }])
    .select("*, trip:trip_id(id, title, destination)")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updatePlace(
  data: PlaceVisitUpdateRequest
): Promise<void> {
  const { id, ...fields } = data;
  const { error } = await supabase
    .from("place_visit")
    .update(fields)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deletePlace(id: string): Promise<void> {
  const { error } = await supabase.from("place_visit").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function countPlacesByTrip(tripId: string): Promise<number> {
  const { count, error } = await supabase
    .from("place_visit")
    .select("*", { count: "exact", head: true })
    .eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
