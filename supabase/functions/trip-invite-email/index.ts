/**
 * Envia e-mail de convite de viagem (chamado pelo app autenticado).
 * Body: { invite_id: string }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { siteOriginFromEnv, corsHeadersForRequest } from "../_shared/cors.ts";
import { emailShell, firstNameFromEmail } from "../_shared/emailHtml.ts";
import { sendResendEmail } from "../_shared/resend.ts";

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
    .from("trip_invite")
    .select("id, token, email, status, created_by, trip_id, email_sent_at, expires_at")
    .eq("id", inviteId)
    .maybeSingle();

  if (inviteError || !invite) {
    return new Response(JSON.stringify({ error: "Convite não encontrado" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (invite.created_by !== user.id) {
    return new Response(JSON.stringify({ error: "Sem permissão" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (invite.status !== "pending" || !invite.email) {
    return new Response(
      JSON.stringify({ error: "Convite sem e-mail ou já usado", skipped: true }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
  if (invite.email_sent_at) {
    return new Response(JSON.stringify({ ok: true, already: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: trip } = await admin
    .from("trip")
    .select("title, destination")
    .eq("id", invite.trip_id)
    .maybeSingle();

  const siteUrl = siteOriginFromEnv() ?? "https://orbyva.app";
  const inviteLink = `${siteUrl}/travel/invite/${invite.token}`;
  const tripLabel =
    trip?.title?.trim() ||
    trip?.destination?.trim() ||
    "uma viagem no Orbyva";
  const inviter =
    (typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.split(" ")[0]
      : null) ||
    firstNameFromEmail(user.email ?? "") ||
    "Alguém";
  const guest = firstNameFromEmail(invite.email);
  const greet = guest ? `Oi, ${guest}` : "Oi";

  const html = emailShell({
    eyebrow: "Orbyva · Viagem",
    title: `${greet} — convite para ${tripLabel}`,
    bodyHtml: `<p style="margin:0;"><strong style="color:#e4e4e7;">${inviter}</strong> te convidou para planejar junto no Orbyva — roteiro, prazos e lugares no mesmo lugar.</p>`,
    ctaLabel: "Aceitar convite",
    ctaUrl: inviteLink,
    footer: "O link expira em até 14 dias. Se não esperava este e-mail, ignore.",
  });

  const sent = await sendResendEmail({
    to: invite.email,
    subject: `${inviter} te convidou para ${tripLabel}`,
    html,
  });

  if (!sent.ok) {
    return new Response(
      JSON.stringify({ error: sent.error ?? "Falha ao enviar" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  await admin
    .from("trip_invite")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("id", invite.id);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
