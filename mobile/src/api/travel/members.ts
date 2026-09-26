import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import { assertTripAccess } from "@/lib/tripAccess";
import type { TripInvite, TripMember } from "@/types/travel";

async function currentDisplayName(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const meta = data.user?.user_metadata as
    | { full_name?: string; name?: string }
    | undefined;
  return (
    meta?.full_name?.trim() ||
    meta?.name?.trim() ||
    data.user?.email?.split("@")[0] ||
    "Viajante"
  );
}

export async function ensureTripOwnerMember(
  tripId: string,
  ownerUserId: string
): Promise<void> {
  const currentId = await getCurrentUserId();
  const canStamp = currentId === ownerUserId;
  const payload: Record<string, unknown> = {
    trip_id: tripId,
    user_id: ownerUserId,
    role: "owner",
  };
  if (canStamp) {
    payload.display_name = await currentDisplayName();
  }
  const { error } = await supabase
    .from("trip_member")
    .upsert(payload, { onConflict: "trip_id,user_id" });
  if (error && !error.message.includes("trip_member")) {
    throw new Error(error.message);
  }
}

export async function listTripMembers(tripId: string): Promise<TripMember[]> {
  await assertTripAccess(tripId);
  const { data, error } = await supabase
    .from("trip_member")
    .select("id, trip_id, user_id, role, display_name")
    .eq("trip_id", tripId)
    .order("joined_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as TripMember[];
}

export async function fetchInviteByToken(
  token: string
): Promise<(TripInvite & { trip_title?: string }) | null> {
  const { data, error } = await supabase.rpc("get_trip_invite_by_token", {
    p_token: token,
  });
  if (error) {
    if (
      error.code === "PGRST202" ||
      error.message.includes("get_trip_invite_by_token")
    ) {
      throw new Error(
        "Convites temporariamente indisponíveis. Tente mais tarde."
      );
    }
    throw new Error(error.message);
  }
  if (!data) return null;
  return data as TripInvite & { trip_title?: string };
}

export async function acceptTripInvite(token: string): Promise<string> {
  const { data: rpcTripId, error: rpcError } = await supabase.rpc(
    "accept_trip_invite",
    { p_token: token }
  );
  if (rpcError) {
    throw new Error(
      rpcError.message.includes("accept_trip_invite") ||
        rpcError.code === "PGRST202"
        ? "Não foi possível aceitar o convite. Tente mais tarde."
        : rpcError.message
    );
  }
  if (!rpcTripId) throw new Error("Convite inválido.");
  return rpcTripId as string;
}

export async function removeTripMember(
  tripId: string,
  memberUserId: string
): Promise<void> {
  const access = await assertTripAccess(tripId, "owner");
  if (memberUserId === access.userId) {
    throw new Error("Você não pode remover a si mesmo como dono.");
  }
  const { error } = await supabase
    .from("trip_member")
    .delete()
    .eq("trip_id", tripId)
    .eq("user_id", memberUserId);
  if (error) throw new Error(error.message);
}

export async function leaveTrip(tripId: string): Promise<void> {
  const access = await assertTripAccess(tripId);
  if (access.isOwner) {
    throw new Error("O dono não pode sair, transfira ou exclua a viagem.");
  }
  const { error } = await supabase
    .from("trip_member")
    .delete()
    .eq("trip_id", tripId)
    .eq("user_id", access.userId);
  if (error) throw new Error(error.message);
}

export function extractInviteToken(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/travel\/invite\/([^/?#]+)/i);
  return match?.[1] ?? trimmed;
}
