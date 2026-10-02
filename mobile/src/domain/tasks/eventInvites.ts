import type { EventInvitePreview, EventInviteStatus } from "@/types/tasks";

export const EVENT_INVITE_EXPIRY_DAYS = 14;

export const EVENT_INVITE_STATUS_LABEL: Record<EventInviteStatus, string> = {
  pending: "Pendente",
  accepted: "Aceito",
  revoked: "Cancelado",
  expired: "Expirado",
};

export function normalizeInviteEmail(email?: string | null): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/** Validação afirmativa: diz o que fazer, não só que está errado. */
export function validateInviteEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return "Escreva o e-mail de quem você quer convidar.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return "Use um e-mail completo, como nome@dominio.com.";
  }
  return null;
}

/** Link público (abre a tela de aceite da web) — é o que vai no e-mail e no compartilhar. */
export function eventInviteUrl(token: string): string {
  return `https://orbyva.app/events/invite/${token}`;
}

export function eventInviteAppUrl(token: string): string {
  return `orbyva://tasks/event-invite/${token}`;
}

const TOKEN_RE = /^[0-9a-f]{16,128}$/i;

/** Aceita o token cru ou qualquer link que termine em `/events/invite/<token>` (web ou app). */
export function parseEventInviteToken(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const fromUrl = /(?:events\/invite|tasks\/event-invite)\/([0-9a-f]+)/i.exec(raw)?.[1];
  const candidate = fromUrl ?? raw;
  return TOKEN_RE.test(candidate) ? candidate.toLowerCase() : null;
}

export type EventInviteState =
  | { kind: "ready"; invite: EventInvitePreview }
  | { kind: "other-email"; invite: EventInvitePreview }
  | { kind: "accepted-by-me"; invite: EventInvitePreview }
  | { kind: "error"; title: string; description: string };

/** Traduz o convite no estado da tela de aceite, já considerando quem está logado. */
export function eventInviteState(
  invite: EventInvitePreview | null,
  signedInEmail: string | null | undefined,
  now: number = Date.now()
): EventInviteState {
  if (!invite) {
    return {
      kind: "error",
      title: "Convite não encontrado",
      description:
        "O link pode ter sido digitado errado ou o evento foi apagado por quem convidou.",
    };
  }
  if (invite.status === "revoked") {
    return {
      kind: "error",
      title: "Convite cancelado",
      description: "Quem convidou cancelou este convite. Peça um link novo.",
    };
  }
  if (invite.status === "accepted") {
    if (invite.accepted_by_me) return { kind: "accepted-by-me", invite };
    return {
      kind: "error",
      title: "Convite já utilizado",
      description: "Este convite já foi aceito por outra pessoa. Peça um link novo.",
    };
  }
  const expired =
    invite.status === "expired" ||
    (!!invite.expires_at && new Date(invite.expires_at).getTime() < now);
  if (expired) {
    return {
      kind: "error",
      title: "Convite expirado",
      description: "Convites valem 14 dias. Peça para quem convidou enviar um link novo.",
    };
  }
  const target = invite.email?.trim().toLowerCase();
  const current = signedInEmail?.trim().toLowerCase();
  if (target && target !== current) return { kind: "other-email", invite };
  return { kind: "ready", invite };
}
