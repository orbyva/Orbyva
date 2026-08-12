import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type { TripMemberRole } from "@/types/tripSharing";

export type TripAccess = {
  tripId: string;
  userId: string;
  role: TripMemberRole;
  isOwner: boolean;
};

/**
 * Garante acesso à viagem (dono ou membro).
 * Dono da linha `trip.user_id` conta como owner mesmo sem row em trip_member.
 */
export async function assertTripAccess(
  tripId: string,
  minRole: TripMemberRole = "editor"
): Promise<TripAccess> {
  const userId = await getCurrentUserId();

  const { data: trip, error: tripError } = await supabase
    .from("trip")
    .select("id, user_id")
    .eq("id", tripId)
    .maybeSingle();
  if (tripError) throw new Error(tripError.message);
  if (!trip) throw new Error("Viagem não encontrada.");

  if (trip.user_id === userId) {
    return { tripId, userId, role: "owner", isOwner: true };
  }

  const { data: member, error: memberError } = await supabase
    .from("trip_member")
    .select("role")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .maybeSingle();
  if (memberError) throw new Error(memberError.message);
  if (!member) throw new Error("Viagem não encontrada.");

  const role = member.role as TripMemberRole;
  if (minRole === "owner" && role !== "owner") {
    throw new Error("Apenas o dono da viagem pode fazer isso.");
  }

  return { tripId, userId, role, isOwner: role === "owner" };
}

export async function getTripAccess(
  tripId: string
): Promise<TripAccess | null> {
  try {
    return await assertTripAccess(tripId, "editor");
  } catch {
    return null;
  }
}

/** IDs de viagens em que o usuário é membro (não necessariamente dono da row). */
export async function fetchMemberTripIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("trip_member")
    .select("trip_id")
    .eq("user_id", userId);
  if (error) {
    // Tabela ainda não migrada, ignora
    if (error.message.includes("trip_member") || error.code === "42P01") {
      return [];
    }
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => r.trip_id);
}
