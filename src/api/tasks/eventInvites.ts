import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type {
  EventInvite,
  EventInvitePreview,
} from "@/types/tasks";

/**
 * Convites de evento da agenda (feature 076) — no molde de `src/api/tripMembers.ts`, inclusive o
 * fallback gracioso para quando as migrations ainda não foram aplicadas no banco.
 *
 * A regra que atravessa este arquivo: **o convite continua válido mesmo se o e-mail falhar**. O
 * disparo do e-mail é best-effort e a UI sempre oferece "copiar link" como saída.
 */

/** Validade do convite, em dias — mesmo prazo de Viagens. */
export const EVENT_INVITE_EXPIRY_DAYS = 14;

/** Códigos/mensagens que significam "a migration ainda não rodou neste banco". */
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

function isDuplicatePendingInvite(error: {
  code?: string;
  message?: string;
}): boolean {
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

export function normalizeInviteEmail(email?: string | null): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export function eventInviteUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/events/invite/${token}`;
}

/** Dispara o e-mail sem deixar a falha derrubar o convite (que já está gravado e válido). */
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
  /** `false` quando o convite foi criado mas o e-mail não saiu — a UI destaca "copiar link". */
  emailSent: boolean;
  /** `true` quando este e-mail já tinha convite pendente e o que houve foi um reenvio. */
  resent: boolean;
};

/**
 * Cria (ou reenvia) um convite para um evento. Convidar o mesmo e-mail duas vezes para o mesmo
 * evento não gera um segundo convite: o índice parcial `event_invite_pending_email_idx` barra, e
 * aqui isso vira reenvio do convite que já existe.
 */
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
    if (isMissingSchema(error)) {
      throw new Error(
        "Convites de evento ainda não estão disponíveis. Tente mais tarde."
      );
    }
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
  return (data as EventInvite) ?? null;
}

export async function listEventInvites(eventId: string): Promise<EventInvite[]> {
  const { data, error } = await supabase
    .from("event_invite")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) {
    // Banco sem a migration: a tela mostra "nenhum convite" em vez de estourar.
    if (isMissingSchema(error)) return [];
    throw new Error(error.message);
  }
  return (data as EventInvite[]) ?? [];
}

export async function revokeEventInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from("event_invite")
    .update({ status: "revoked" })
    .eq("id", inviteId);
  if (error) throw new Error(error.message);
}

/**
 * Reenvia o e-mail de um convite. Limpa `email_sent_at` antes: a edge function é idempotente e
 * ignora convite já enviado, então sem isso o reenvio seria silenciosamente descartado.
 */
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
    // Fail closed, como em Viagens: sem a RPC, não caia num select permissivo.
    if (isMissingSchema(error)) {
      throw new Error(
        "Convites de evento ainda não estão disponíveis. Tente mais tarde."
      );
    }
    throw new Error(error.message);
  }

  if (!data) return null;
  return data as EventInvitePreview;
}

/** Devolve o id do `project_event` criado (ou reaproveitado) na agenda de quem aceitou. */
export async function acceptEventInvite(token: string): Promise<string> {
  const { data, error } = await supabase.rpc("accept_event_invite", {
    p_token: token,
  });

  if (error) {
    if (isMissingSchema(error)) {
      throw new Error("Não foi possível aceitar o convite. Tente mais tarde.");
    }
    // As mensagens da RPC já são amigáveis e em PT ("Este convite expirou", "Este convite é para
    // outro e-mail") — repassar cru é melhor do que trocar por um genérico.
    throw new Error(error.message);
  }

  if (!data) throw new Error("Convite inválido.");
  return data as string;
}
