/**
 * Cron diário: e-mail de retorno D7 para quem criou conta há 7–14 dias
 * e não abriu o app nos últimos 5 dias.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 * Secrets: CRON_SECRET, RESEND_API_KEY, RESEND_FROM, SITE_URL,
 *          SUPABASE_* (auto), opcional POSTHOG_API_KEY + POSTHOG_HOST
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { siteOriginFromEnv } from "../_shared/cors.ts";

type Candidate = {
  user_id: string;
  email: string;
  created_at: string;
  last_seen_at: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function unauthorized() {
  return json({ error: "Unauthorized" }, 401);
}

function assertCronAuth(req: Request): boolean {
  const secret = (Deno.env.get("CRON_SECRET") ?? "").trim();
  if (!secret) return false;
  const auth = req.headers.get("Authorization") ?? "";
  const header = req.headers.get("x-cron-secret") ?? "";
  return auth === `Bearer ${secret}` || header === secret;
}

function buildEmailHtml(siteUrl: string, firstName?: string) {
  const greet = firstName ? `Oi, ${firstName}` : "Oi";
  const loginUrl = `${siteUrl}/login`;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#070b14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#070b14;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#0f1623;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px;">
        <tr><td>
          <p style="margin:0;color:#38bdf8;font-size:14px;font-weight:600;">Orbyva</p>
          <h1 style="margin:12px 0 0;color:#f4f4f5;font-size:22px;line-height:1.3;">${greet} — seu mês ainda tá aí</h1>
          <p style="margin:16px 0 0;color:#a1a1aa;font-size:15px;line-height:1.55;">
            Faz uma semana que você entrou. Orçamento, parcelas e o life OS continuam
            te esperando — leva 2 minutos para ver o que ainda cabe no mês.
          </p>
          <p style="margin:28px 0 0;">
            <a href="${loginUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:999px;">
              Abrir o Orbyva
            </a>
          </p>
          <p style="margin:24px 0 0;color:#71717a;font-size:12px;line-height:1.5;">
            Se não for mais a sua praia, ignore este e-mail — sem drama.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendResend(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text.slice(0, 500) };
  }
  return { ok: true };
}

async function trackPostHog(
  event: string,
  distinctId: string,
  props?: Record<string, string | number | boolean | null>
) {
  const apiKey = (Deno.env.get("POSTHOG_API_KEY") ?? "").trim();
  if (!apiKey) return;
  const host = (
    Deno.env.get("POSTHOG_HOST") ?? "https://us.i.posthog.com"
  ).replace(/\/$/, "");
  try {
    await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        distinct_id: distinctId,
        properties: { ...props, $lib: "orbyva-retention-edge" },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    /* ignore analytics failures */
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!assertCronAuth(req)) {
    return unauthorized();
  }

  const resendKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
  const resendFrom = (
    Deno.env.get("RESEND_FROM") ?? "Orbyva <noreply@orbyva.app>"
  ).trim();
  const siteUrl = siteOriginFromEnv() ?? "https://orbyva.app";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!resendKey) {
    return json(
      { error: "RESEND_API_KEY não configurada. Defina o secret no Supabase." },
      503
    );
  }
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Supabase env incompleto" }, 503);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: candidates, error: listError } = await admin.rpc(
    "retention_d7_email_candidates",
    {
      p_min_age_days: 7,
      p_max_age_days: 14,
      p_inactive_days: 5,
      p_limit: 50,
    }
  );

  if (listError) {
    return json({ error: listError.message }, 500);
  }

  const rows = (candidates ?? []) as Candidate[];
  let sent = 0;
  let failed = 0;
  const errors: { email: string; error: string }[] = [];

  for (const row of rows) {
    const local = row.email.split("@")[0] ?? "";
    const firstName =
      local.length >= 2
        ? local.charAt(0).toUpperCase() + local.slice(1, 24)
        : undefined;

    const result = await sendResend({
      apiKey: resendKey,
      from: resendFrom,
      to: row.email,
      subject: "Seu mês ainda está no Orbyva",
      html: buildEmailHtml(siteUrl, firstName),
    });

    if (!result.ok) {
      failed += 1;
      errors.push({ email: row.email, error: result.error ?? "send failed" });
      continue;
    }

    const { error: markError } = await admin
      .from("profiles")
      .update({ retention_email_sent_at: new Date().toISOString() })
      .eq("id", row.user_id)
      .is("retention_email_sent_at", null);

    if (markError) {
      failed += 1;
      errors.push({ email: row.email, error: markError.message });
      continue;
    }

    sent += 1;
    await trackPostHog("retention_email_sent", row.user_id, {
      days_since_signup: Math.floor(
        (Date.now() - new Date(row.created_at).getTime()) / 86_400_000
      ),
      had_last_seen: Boolean(row.last_seen_at),
    });
  }

  return json({
    ok: true,
    candidates: rows.length,
    sent,
    failed,
    errors: errors.slice(0, 10),
  });
});
