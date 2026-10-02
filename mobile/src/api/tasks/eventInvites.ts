import {
  EVENT_INVITE_EXPIRY_DAYS,
  normalizeInviteEmail,
} from "@/domain/tasks/eventInvites";
import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import type { EventInvite, EventInvitePreview } from "@/types/tasks";

/**
 * Convites de evento da agenda, portados da web (`src/api/tasks/eventInvites.ts`). O convite
 * continua válido mesmo se o e-mail falhar: o disparo é best-effort e a tela oferece o link.
 */

const UNAVAILABLE = "Convites de evento ainda não estão disponíveis. Tente mais tarde.";

function isMissingSchema(error: { code?: string; message?: string }): boolean {
  const message = error.message ?? "";
  return (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.code === "42883" ||
    message.includes("event_invite") ||
    message.includes("accept_event_invite") ||
    message.includes("get_event_invite_by_token")
  );
}

function isDuplicatePendingInvite(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "23505" ||
    (error.message ?? "").includes("event_invite_pending_email_idx")
  );
}

function inviteToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendInviteEmail(inviteId: string): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke("event-invite-email", {
      body: { invite_id: inviteId },
    });
    return !error;
  } catch {
    return false;
  }
}

export type CreateEventInviteResult = {
  invite: EventInvite;
  /** `false` quando o convite foi criado mas o e-mail não saiu. */
  emailSent: boolean;
  /** `true` quando o e-mail já tinha convite pendente e o que houve foi reenvio. */
  resent: boolean;
};

/** Cria o convite; o mesmo e-mail duas vezes no mesmo evento vira reenvio do pendente. */
export async function createEventInvite(
  eventId: string,
  email?: string | null
): Promise<CreateEventInviteResult> {
  const userId = await getCurrentUserId();
  const normalized = normalizeInviteEmail(email);
  const expires = new Date();
  expires.setDate(expires.getDate() + EVENT_INVITE_EXPIRY_DAYS);

  const { data, error } = await supabase
    .from("event_invite")
    .insert([
      {
        event_id: eventId,
        token: inviteToken(),
        email: normalized,
        created_by: userId,
        status: "pending",
        expires_at: expires.toISOString(),
      },
    ])
    .select()
    .single();

  if (error) {
    if (normalized && isDuplicatePendingInvite(error)) {
      const existing = await findPendingInvite(eventId, normalized);
      if (existing) {
        const emailSent = await resendEventInvite(existing.id);
        return { invite: existing, emailSent, resent: true };
      }
    }
    if (isMissingSchema(error)) throw new Error(UNAVAILABLE);
    throw new Error(error.message);
  }

  const invite = data as EventInvite;
  const emailSent = normalized ? await sendInviteEmail(invite.id) : false;
  return { invite, emailSent, resent: false };
}

async function findPendingInvite(
  eventId: string,
  email: string
): Promise<EventInvite | null> {
  const { data, error } = await supabase
    .from("event_invite")
    .select("*")
    .eq("event_id", eventId)
    .eq("status", "pending")
    .eq("email", email)
    .maybeSingle();
  if (error) return null;
  return (data as EventInvite | null) ?? null;
}

export async function listEventInvites(eventId: string): Promise<EventInvite[]> {
  const { data, error } = await supabase
    .from("event_invite")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingSchema(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as EventInvite[];
}

export async function revokeEventInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from("event_invite")
    .update({ status: "revoked" })
    .eq("id", inviteId);
  if (error) throw new Error(error.message);
}

/** Limpa `email_sent_at` antes: a edge function ignora convite já enviado. */
export async function resendEventInvite(inviteId: string): Promise<boolean> {
  const { error } = await supabase
    .from("event_invite")
    .update({ email_sent_at: null })
    .eq("id", inviteId);
  if (error) return false;
  return sendInviteEmail(inviteId);
}

export async function getEventInviteByToken(
  token: string
): Promise<EventInvitePreview | null> {
  const { data, error } = await supabase.rpc("get_event_invite_by_token", {
    p_token: token,
  });
  if (error) {
    if (isMissingSchema(error)) throw new Error(UNAVAILABLE);
    throw new Error(error.message);
  }
  return (data as EventInvitePreview | null) ?? null;
}

/** Devolve o id do `project_event` criado (ou reaproveitado) na agenda de quem aceitou. */
export async function acceptEventInvite(token: string): Promise<string> {
  const { data, error } = await supabase.rpc("accept_event_invite", { p_token: token });
  if (error) {
    if (isMissingSchema(error)) {
      throw new Error("Não foi possível aceitar o convite. Tente mais tarde.");
    }
    throw new Error(error.message);
  }
  if (!data) throw new Error("Convite inválido.");
  return data as string;
}
