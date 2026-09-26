/**
 * Peças puras do e-mail de convite de evento — espelho de src/domain/events/inviteEmail.ts
 * (Edge Deno não importa o front; manter sincronizado).
 *
 * A cobertura vive do lado do front (`src/domain/events/__tests__/inviteEmail.test.ts`), e
 * `ics.mirror.test.ts` garante que os dois arquivos não divergem.
 */
import { buildEventIcs } from "./ics.ts";

export type InviteEmailGuardInput = {
  status: string;
  email: string | null;
  expires_at?: string | null;
  email_sent_at?: string | null;
};

export type InviteEmailGuard =
  | { send: true }
  | {
      send: false;
      reason: "not_pending" | "no_email" | "expired" | "already_sent";
    };

/**
 * Decide se este convite ainda deve gerar e-mail. A ordem das checagens é a ordem em que elas
 * importam: um convite revogado não pode virar e-mail nem que o carimbo esteja limpo.
 */
export function shouldSendInviteEmail(
  invite: InviteEmailGuardInput,
  now: Date = new Date()
): InviteEmailGuard {
  if (invite.status !== "pending") return { send: false, reason: "not_pending" };
  if (!invite.email || !invite.email.trim()) {
    return { send: false, reason: "no_email" };
  }
  if (invite.expires_at && new Date(invite.expires_at).getTime() < now.getTime()) {
    return { send: false, reason: "expired" };
  }
  // Idempotência: reenviar exige limpar `email_sent_at` antes (é o que `resendEventInvite` faz).
  if (invite.email_sent_at) return { send: false, reason: "already_sent" };
  return { send: true };
}

/** Escapa texto que vai para dentro do HTML do e-mail — nome de quem convida, título do evento. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Base64 de uma string UTF-8 — `btoa` sozinho quebra em qualquer acento. */
export function toBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Data/hora do evento por extenso, no fuso de quem recebe o convite (default: São Paulo). */
export function formatEventWhen(
  startsAt: string,
  timeZone = "America/Sao_Paulo"
): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone,
    }).format(new Date(startsAt));
  } catch {
    return startsAt;
  }
}

export function inviteEmailSubject(inviter: string, eventTitle: string): string {
  return `${inviter} te convidou para ${eventTitle}`;
}

/** Fallback do título quando o evento veio sem nome utilizável. */
export function eventTitleForEmail(title?: string | null): string {
  return title?.trim() || "um evento no Orbyva";
}

/**
 * Monta o que de fato vai no e-mail de convite: assunto, título, corpo e o anexo `.ics`.
 *
 * Fica aqui (e não dentro da Edge Function) para o anexo poder ser conferido por teste — é o que
 * cumpre a parte "em caso de por exemplo ela ter conta no google também cria" do pedido original:
 * o `.ics` é o que faz o evento entrar no Google/Apple/Outlook Calendar. A casca visual do e-mail
 * (`emailShell`) continua na Edge, porque é só apresentação.
 */
export type InviteEmailPayloadInput = {
  /** Primeiro nome de quem convidou — já resolvido pela Edge a partir do JWT. */
  inviterName: string;
  inviterEmail?: string | null;
  guestEmail: string;
  eventId: string;
  eventTitle?: string | null;
  eventStartsAt: string;
  eventEndsAt?: string | null;
  inviteLink: string;
  /** Só para teste: carimbo do `DTSTAMP`. */
  now?: Date;
};

export type InviteEmailAttachment = {
  filename: string;
  /** Conteúdo em base64. */
  content: string;
  content_type: string;
};

export type InviteEmailPayload = {
  to: string;
  subject: string;
  /** Título do bloco do e-mail (vai para `emailShell`). */
  title: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  attachments: InviteEmailAttachment[];
  /** O `.ics` cru, antes do base64 — exposto para teste e depuração. */
  ics: string;
};

export function buildInviteEmailPayload(
  input: InviteEmailPayloadInput
): InviteEmailPayload {
  const eventTitle = eventTitleForEmail(input.eventTitle);
  const when = formatEventWhen(input.eventStartsAt);
  const guestFirstName = input.guestEmail.split("@")[0]?.trim();
  const greet = guestFirstName ? `Oi, ${guestFirstName}` : "Oi";

  const ics = buildEventIcs({
    uid: `${input.eventId}@orbyva.app`,
    title: eventTitle,
    startsAt: input.eventStartsAt,
    endsAt: input.eventEndsAt ?? null,
    organizerEmail: input.inviterEmail ?? null,
    attendeeEmail: input.guestEmail,
    url: input.inviteLink,
    now: input.now,
  });

  return {
    to: input.guestEmail,
    subject: inviteEmailSubject(input.inviterName, eventTitle),
    title: `${greet}, convite para ${eventTitle}`,
    bodyHtml:
      `<p style="margin:0;"><strong style="color:#e4e4e7;">${escapeHtml(
        input.inviterName
      )}</strong> te convidou para <strong style="color:#e4e4e7;">${escapeHtml(
        eventTitle
      )}</strong>.</p>` +
      `<p style="margin:12px 0 0;">${escapeHtml(when)}</p>` +
      `<p style="margin:12px 0 0;">Aceite para o evento entrar na sua agenda do Orbyva — ou abra o anexo para adicionar direto no Google, Apple ou Outlook Calendar.</p>`,
    ctaLabel: "Ver convite",
    ctaUrl: input.inviteLink,
    attachments: [
      {
        filename: "convite.ics",
        content: toBase64Utf8(ics),
        content_type: "text/calendar",
      },
    ],
    ics,
  };
}
