import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { assertTripAccess } from "@/lib/tripAccess";
import type { TripInvite, TripMember } from "@/types/tripSharing";

function inviteToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

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

async function currentAvatarUrl(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  const meta = data.user?.user_metadata as
    | { avatar_url?: string; picture?: string }
    | undefined;
  return meta?.avatar_url?.trim() || meta?.picture?.trim() || null;
}

/** Garante row de owner em trip_member (idempotente). */
export async function ensureTripOwnerMember(
  tripId: string,
  ownerUserId: string
): Promise<void> {
  const currentId = await getCurrentUserId();
  // Só preenche nome/avatar com os dados de quem está logado se for o dono
  const canStampIdentity = currentId === ownerUserId;
  const [name, avatar] = canStampIdentity
    ? await Promise.all([currentDisplayName(), currentAvatarUrl()])
    : [null, null];

  const payload: Record<string, unknown> = {
    trip_id: tripId,
    user_id: ownerUserId,
    role: "owner",
  };
  if (canStampIdentity) {
    payload.display_name = name;
    payload.avatar_url = avatar;
  }

  const { error } = await supabase
    .from("trip_member")
    .upsert(payload, { onConflict: "trip_id,user_id" });

  if (!error) return;

  // Coluna avatar_url ainda não existe — tenta sem ela
  if (error.message.includes("avatar_url") || error.code === "PGRST204") {
    const { avatar_url: _a, ...withoutAvatar } = payload;
    const retry = await supabase
      .from("trip_member")
      .upsert(withoutAvatar, { onConflict: "trip_id,user_id" });
    if (retry.error && !retry.error.message.includes("trip_member")) {
      throw new Error(retry.error.message);
    }
    return;
  }

  if (!error.message.includes("trip_member")) {
    throw new Error(error.message);
  }
}

export async function listTripMembers(tripId: string): Promise<TripMember[]> {
  await assertTripAccess(tripId);
  const { data, error } = await supabase
    .from("trip_member")
    .select("*")
    .eq("trip_id", tripId)
    .order("joined_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createTripInvite(
  tripId: string,
  email?: string | null
): Promise<TripInvite> {
  const access = await assertTripAccess(tripId, "owner");
  await ensureTripOwnerMember(tripId, access.userId);

  const expires = new Date();
  expires.setDate(expires.getDate() + 14);

  const { data, error } = await supabase
    .from("trip_invite")
    .insert([
      {
        trip_id: tripId,
        token: inviteToken(),
        email: email?.trim() || null,
        created_by: access.userId,
        status: "pending",
        expires_at: expires.toISOString(),
      },
    ])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listTripInvites(tripId: string): Promise<TripInvite[]> {
  await assertTripAccess(tripId, "owner");
  const { data, error } = await supabase
    .from("trip_invite")
    .select("*")
    .eq("trip_id", tripId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function revokeTripInvite(inviteId: string): Promise<void> {
  const { data: invite, error: fetchError } = await supabase
    .from("trip_invite")
    .select("trip_id")
    .eq("id", inviteId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!invite) throw new Error("Convite não encontrado.");
  await assertTripAccess(invite.trip_id, "owner");

  const { error } = await supabase
    .from("trip_invite")
    .update({ status: "revoked" })
    .eq("id", inviteId);
  if (error) throw new Error(error.message);
}

export async function fetchInviteByToken(
  token: string
): Promise<(TripInvite & { trip_title?: string }) | null> {
  const { data, error } = await supabase
    .from("trip_invite")
    .select("*, trip:trip_id(title)")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const trip = data.trip as { title?: string } | null;
  return {
    ...data,
    trip: undefined,
    trip_title: trip?.title,
  } as TripInvite & { trip_title?: string };
}

export async function acceptTripInvite(token: string): Promise<string> {
  // Prefer RPC (security definer) — evita RLS no upsert do cliente
  const { data: rpcTripId, error: rpcError } = await supabase.rpc(
    "accept_trip_invite",
    { p_token: token }
  );

  if (!rpcError && rpcTripId) {
    return rpcTripId as string;
  }

  // Fallback se a RPC ainda não foi aplicada
  if (
    rpcError &&
    !rpcError.message.includes("accept_trip_invite") &&
    rpcError.code !== "PGRST202"
  ) {
    throw new Error(rpcError.message);
  }

  const userId = await getCurrentUserId();
  const invite = await fetchInviteByToken(token);
  if (!invite) throw new Error("Convite inválido.");
  if (invite.status !== "pending") {
    throw new Error("Este convite não está mais disponível.");
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await supabase
      .from("trip_invite")
      .update({ status: "expired" })
      .eq("id", invite.id);
    throw new Error("Este convite expirou.");
  }

  const [name, avatar] = await Promise.all([
    currentDisplayName(),
    currentAvatarUrl(),
  ]);
  // insert (não upsert) — upsert exige política UPDATE mesmo sem conflito
  const { error: memberError } = await supabase.from("trip_member").insert({
    trip_id: invite.trip_id,
    user_id: userId,
    role: "editor",
    display_name: name,
    avatar_url: avatar,
  });
  if (memberError) {
    // Já membro: segue para marcar convite
    if (!memberError.message.toLowerCase().includes("duplicate")) {
      throw new Error(memberError.message);
    }
  }

  const { error: inviteError } = await supabase
    .from("trip_invite")
    .update({ status: "accepted", accepted_by: userId })
    .eq("id", invite.id);
  if (inviteError) throw new Error(inviteError.message);

  return invite.trip_id;
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
    throw new Error("O dono não pode sair — transfira ou exclua a viagem.");
  }
  const { error } = await supabase
    .from("trip_member")
    .delete()
    .eq("trip_id", tripId)
    .eq("user_id", access.userId);
  if (error) throw new Error(error.message);
}

export function inviteUrl(token: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/travel/invite/${token}`;
}
