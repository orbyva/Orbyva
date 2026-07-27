/**
 * Cron semanal: digest com lembrete do mês + próximas parcelas.
 * Auth: Authorization: Bearer <CRON_SECRET>
 * Secrets: CRON_SECRET, RESEND_API_KEY, RESEND_FROM, SITE_URL, SUPABASE_*
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { siteOriginFromEnv } from "../_shared/cors.ts";

type Candidate = {
  user_id: string;
  email: string;
  created_at: string;
  last_seen_at: string | null;
};

type RecurringRow = {
  description: string | null;
  value: number | null;
  due_day: number | null;
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

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function monthLabel(d = new Date()) {
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function buildEmailHtml(opts: {
  siteUrl: string;
  firstName?: string;
  parcels: { label: string; value: string; due: string }[];
}) {
  const greet = opts.firstName ? `Oi, ${opts.firstName}` : "Oi";
  const homeUrl = `${opts.siteUrl}/home`;
  const budgetUrl = `${opts.siteUrl}/finance/budget`;
  const parcelsHtml =
    opts.parcels.length === 0
      ? `<p style="margin:16px 0 0;color:#a1a1aa;font-size:14px;line-height:1.5;">
          Nenhuma recorrência em aberto listada — se tiver parcelas, cadastre em Finanças → Parcelas.
        </p>`
      : `<ul style="margin:16px 0 0;padding:0;list-style:none;">
          ${opts.parcels
            .map(
              (p) => `<li style="margin:0 0 10px;padding:12px 14px;background:#161f2e;border-radius:10px;border:1px solid rgba(255,255,255,0.06);">
              <span style="color:#f4f4f5;font-size:14px;font-weight:600;">${p.label}</span>
              <br/>
              <span style="color:#a1a1aa;font-size:13px;">${p.value} · dia ${p.due}</span>
            </li>`
            )
            .join("")}
        </ul>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#070b14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#070b14;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#0f1623;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px;">
        <tr><td>
          <p style="margin:0;color:#38bdf8;font-size:14px;font-weight:600;">Orbyva · Digest semanal</p>
          <h1 style="margin:12px 0 0;color:#f4f4f5;font-size:22px;line-height:1.3;">${greet} — como vai ${monthLabel()}?</h1>
          <p style="margin:16px 0 0;color:#a1a1aa;font-size:15px;line-height:1.55;">
            Um lembrete rápido: olhe o orçamento do mês e o que vem nas parcelas.
            Dois minutos agora evitam susto no dia 25.
          </p>
          <p style="margin:20px 0 0;color:#e4e4e7;font-size:14px;font-weight:600;">Próximas recorrências</p>
          ${parcelsHtml}
          <p style="margin:28px 0 0;">
            <a href="${budgetUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:999px;margin-right:8px;">
              Ver orçamento
            </a>
            <a href="${homeUrl}" style="display:inline-block;color:#38bdf8;text-decoration:none;font-weight:600;font-size:14px;padding:12px 8px;">
              Abrir hub
            </a>
          </p>
          <p style="margin:24px 0 0;color:#71717a;font-size:12px;line-height:1.5;">
            Você recebe isso porque usa o Orbyva. Para sair, ignore — ou fale em orbyva@gmail.com.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!assertCronAuth(req)) return unauthorized();

  const resendKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
  const resendFrom = (
    Deno.env.get("RESEND_FROM") ?? "Orbyva <noreply@orbyva.app>"
  ).trim();
  const siteUrl = siteOriginFromEnv() ?? "https://orbyva.app";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!resendKey) {
    return json({ error: "RESEND_API_KEY não configurada." }, 503);
  }
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Supabase env incompleto" }, 503);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: candidates, error: listError } = await admin.rpc(
    "weekly_digest_candidates",
    { p_active_days: 21, p_min_gap_days: 6, p_limit: 80 }
  );
  if (listError) return json({ error: listError.message }, 500);

  const rows = (candidates ?? []) as Candidate[];
  let sent = 0;
  let failed = 0;
  const errors: { email: string; error: string }[] = [];

  for (const row of rows) {
    const { data: recurring } = await admin
      .from("recurring_transaction")
      .select("description, value, due_day")
      .eq("user_id", row.user_id)
      .eq("status", true)
      .order("due_day", { ascending: true })
      .limit(4);

    const parcels = ((recurring ?? []) as RecurringRow[]).map((r) => ({
      label: r.description?.trim() || "Recorrência",
      value: formatBRL(Number(r.value) || 0),
      due: r.due_day != null ? String(r.due_day) : "—",
    }));

    const local = row.email.split("@")[0] ?? "";
    const firstName =
      local.length >= 2
        ? local.charAt(0).toUpperCase() + local.slice(1, 24)
        : undefined;

    const result = await sendResend({
      apiKey: resendKey,
      from: resendFrom,
      to: row.email,
      subject: `Orbyva · seu resumo de ${monthLabel()}`,
      html: buildEmailHtml({ siteUrl, firstName, parcels }),
    });

    if (!result.ok) {
      failed += 1;
      errors.push({ email: row.email, error: result.error ?? "send failed" });
      continue;
    }

    const { error: markError } = await admin
      .from("profiles")
      .update({ weekly_digest_sent_at: new Date().toISOString() })
      .eq("id", row.user_id);

    if (markError) {
      failed += 1;
      errors.push({ email: row.email, error: markError.message });
      continue;
    }

    sent += 1;
  }

  return json({ ok: true, candidates: rows.length, sent, failed, errors });
});
