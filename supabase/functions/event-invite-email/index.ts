/**
 * Envia o e-mail de convite de um evento da agenda (feature 076), chamado pelo app autenticado.
 * Body: { invite_id: string }
 *
 * Cópia estrutural de `trip-invite-email`, com duas diferenças que importam:
 *  - anexa um `.ics` (`text/calendar`), que é o que faz o evento entrar no Google/Apple/Outlook
 *    Calendar do convidado com um clique — sem OAuth nenhum (a integração via API do Google é a 077);
 *  - **não vaza dados do anfitrião além do necessário**: o corpo traz o primeiro nome de quem
 *    convidou, o título e o horário do evento. Nada de projeto, agenda ou outros eventos.
 *
 * `verify_jwt` fica no padrão (ligado): só um usuário autenticado dispara, e a função ainda confere
 * que o convite é dele (`created_by === user.id`) antes de mandar qualquer coisa. Por isso a função
 * **não** entra em `supabase/config.toml` — lá só moram as que precisam de `verify_jwt = false`.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { siteOriginFromEnv, corsHeadersForRequest } from "../_shared/cors.ts";
import { emailShell, firstNameFromEmail } from "../_shared/emailHtml.ts";
import { sendResendEmail } from "../_shared/resend.ts";
import {
  buildInviteEmailPayload,
  shouldSendInviteEmail,
} from "../_shared/inviteEmail.ts";

Deno.serve(async (req) => {
  const cors = corsHeadersForRequest(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let inviteId: string | undefined;
  try {
    const body = await req.json();
    inviteId = typeof body?.invite_id === "string" ? body.invite_id : undefined;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (!inviteId) {
    return new Response(JSON.stringify({ error: "invite_id obrigatório" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: invite, error: inviteError } = await admin
    .from("event_invite")
    .select("id, token, email, status, created_by, event_id, email_sent_at, expires_at")
    .eq("id", inviteId)
    .maybeSingle();

  if (inviteError || !invite) {
    return new Response(JSON.stringify({ error: "Convite não encontrado" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  // Só quem criou o convite dispara o e-mail dele. Sem isso, qualquer autenticado com um `invite_id`
  // faria a plataforma mandar e-mail em nome de outra pessoa.
  if (invite.created_by !== user.id) {
    return new Response(JSON.stringify({ error: "Sem permissão" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  // Toda a decisão de "este convite ainda vira e-mail?" está em `shouldSendInviteEmail`, que é
  // testada em `src/domain/events/__tests__/inviteEmail.test.ts`.
  const guard = shouldSendInviteEmail(invite);
  if (!guard.send) {
    const already = guard.reason === "already_sent";
    return new Response(
      JSON.stringify(
        already ? { ok: true, already: true } : { skipped: true, reason: guard.reason }
      ),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  const { data: event } = await admin
    .from("project_event")
    .select("id, title, starts_at, ends_at")
    .eq("id", invite.event_id)
    .maybeSingle();

  if (!event) {
    return new Response(JSON.stringify({ error: "Evento não encontrado" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const siteUrl = siteOriginFromEnv() ?? "https://orbyva.app";
  const inviteLink = `${siteUrl}/events/invite/${invite.token}`;
  const inviter =
    (typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.split(" ")[0]
      : null) ||
    firstNameFromEmail(user.email ?? "") ||
    "Alguém";

  // Assunto, corpo e o anexo `.ics` saem todos daqui — é a parte conferida por teste
  // (`src/domain/events/__tests__/pedido-literal.test.ts`). A Edge só embrulha na casca visual.
  const payload = buildInviteEmailPayload({
    inviterName: inviter,
    inviterEmail: user.email ?? null,
    guestEmail: invite.email,
    eventId: event.id,
    eventTitle: event.title,
    eventStartsAt: event.starts_at,
    eventEndsAt: event.ends_at,
    inviteLink,
  });

  const html = emailShell({
    eyebrow: "Orbyva · Agenda",
    title: payload.title,
    bodyHtml: payload.bodyHtml,
    ctaLabel: payload.ctaLabel,
    ctaUrl: payload.ctaUrl,
    footer: "O link expira em até 14 dias. Se não esperava este e-mail, ignore.",
  });

  const sent = await sendResendEmail({
    to: payload.to,
    subject: payload.subject,
    html,
    attachments: payload.attachments,
  });

  if (!sent.ok) {
    return new Response(
      JSON.stringify({ error: sent.error ?? "Falha ao enviar" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  await admin
    .from("event_invite")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("id", invite.id);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
