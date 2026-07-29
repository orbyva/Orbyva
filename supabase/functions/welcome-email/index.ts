/**
 * Welcome no primeiro acesso (app autenticado).
 * Idempotente via welcome_email_sent_at. Cron lifecycle-email continua como fallback.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { siteOriginFromEnv, corsHeadersForRequest } from "../_shared/cors.ts";
import { firstNameFromEmail } from "../_shared/emailHtml.ts";
import { sendResendEmail } from "../_shared/resend.ts";
import {
  WELCOME_EMAIL_SUBJECT,
  welcomeEmailHtml,
} from "../_shared/welcomeEmail.ts";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

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
  if (userError || !user?.email) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (!user.email_confirmed_at) {
    return new Response(JSON.stringify({ ok: true, skipped: "unconfirmed" }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const createdMs = Date.parse(user.created_at ?? "");
  if (!Number.isFinite(createdMs) || Date.now() - createdMs > TWO_DAYS_MS) {
    return new Response(JSON.stringify({ ok: true, skipped: "too_old" }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("welcome_email_sent_at, email_unsubscribed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return new Response(JSON.stringify({ error: profileError.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (!profile) {
    return new Response(JSON.stringify({ ok: true, skipped: "no_profile" }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (profile.email_unsubscribed_at) {
    return new Response(JSON.stringify({ ok: true, skipped: "unsubscribed" }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (profile.welcome_email_sent_at) {
    return new Response(JSON.stringify({ ok: true, skipped: "already_sent" }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Claim atômico — evita double-send em abas paralelas.
  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin
    .from("profiles")
    .update({ welcome_email_sent_at: claimedAt })
    .eq("id", user.id)
    .is("welcome_email_sent_at", null)
    .select("id")
    .maybeSingle();

  if (claimError) {
    return new Response(JSON.stringify({ error: claimError.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (!claimed) {
    return new Response(JSON.stringify({ ok: true, skipped: "already_sent" }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const siteUrl = siteOriginFromEnv() ?? "https://orbyva.app";
  const html = welcomeEmailHtml(siteUrl, firstNameFromEmail(user.email));
  const sent = await sendResendEmail({
    to: user.email,
    subject: WELCOME_EMAIL_SUBJECT,
    html,
  });

  if (!sent.ok) {
    await admin
      .from("profiles")
      .update({ welcome_email_sent_at: null })
      .eq("id", user.id)
      .eq("welcome_email_sent_at", claimedAt);
    console.error("welcome-email", user.id, sent.error);
    return new Response(JSON.stringify({ error: sent.error ?? "send_failed" }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, sent: true }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
