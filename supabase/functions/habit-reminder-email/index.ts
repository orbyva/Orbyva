/**
 * Cron diário: lembrete de hábitos (opt-in Conta → E-mails).
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { siteOriginFromEnv } from "../_shared/cors.ts";
import {
  assertCronAuth,
  jsonResponse,
  unauthorizedResponse,
} from "../_shared/cronAuth.ts";
import {
  emailListBlock,
  emailShell,
  firstNameFromEmail,
} from "../_shared/emailHtml.ts";
import { sendResendEmail } from "../_shared/resend.ts";
import { trackPostHog } from "../_shared/posthog.ts";

type Candidate = {
  user_id: string;
  email: string;
  habit_count: number;
};

type HabitRow = { id: string; name: string | null; kind?: string | null };

function todaySaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!assertCronAuth(req)) return unauthorizedResponse();

  const siteUrl = siteOriginFromEnv() ?? "https://orbyva.app";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "Supabase env incompleto" }, 503);
  }

  const today = todaySaoPaulo();
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: candidates, error: listError } = await admin.rpc(
    "habit_reminder_candidates",
    { p_today: today, p_limit: 80 }
  );
  if (listError) return jsonResponse({ error: listError.message }, 500);

  const rows = (candidates ?? []) as Candidate[];
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const { data: habits } = await admin
      .from("habit")
      .select("id, name, kind")
      .eq("user_id", row.user_id)
      .eq("frequency", "daily")
      .limit(8);

    const habitRows = (habits ?? []) as HabitRow[];
    const pending: { title: string; meta: string }[] = [];
    for (const h of habitRows) {
      const { data: log } = await admin
        .from("habit_log")
        .select("id")
        .eq("habit_id", h.id)
        .eq("date", today)
        .eq("completed", true)
        .maybeSingle();
      if (!log) {
        pending.push({
          title: h.name?.trim() || "Hábito",
          meta: h.kind === "avoid" ? "Dia limpo ainda não marcado" : "Pendente hoje",
        });
      }
    }

    if (pending.length === 0) continue;

    const firstName = firstNameFromEmail(row.email);
    const greet = firstName ? `Oi, ${firstName}` : "Oi";
    const html = emailShell({
      eyebrow: "Orbyva · Hábitos",
      title: `${greet} — check-in de hoje`,
      bodyHtml: `<p style="margin:0;">Ainda dá tempo de marcar o dia. ${pending.length} hábito${pending.length === 1 ? "" : "s"} sem check-in:</p>
        ${emailListBlock(pending.slice(0, 5))}`,
      ctaLabel: "Abrir hábitos",
      ctaUrl: `${siteUrl}/habits`,
      footer:
        "Lembrete opt-in. Desative em Conta → E-mails quando quiser.",
    });

    const result = await sendResendEmail({
      to: row.email,
      subject: "Orbyva · hábitos de hoje",
      html,
    });

    if (!result.ok) {
      failed += 1;
      continue;
    }

    const { error: markError } = await admin
      .from("profiles")
      .update({ habit_reminder_sent_at: new Date().toISOString() })
      .eq("id", row.user_id);

    if (markError) {
      failed += 1;
      continue;
    }

    sent += 1;
    await trackPostHog(
      "habit_reminder_sent",
      row.user_id,
      { pending: pending.length, habit_count: row.habit_count },
      "orbyva-habit-reminder"
    );
  }

  return jsonResponse({
    ok: true,
    today,
    candidates: rows.length,
    sent,
    failed,
  });
});
