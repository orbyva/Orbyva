/**
 * Cron semanal: digest com orçamento do mês, hábitos (7d) e próximas parcelas.
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
  formatBRL,
  monthLabelPt,
} from "../_shared/emailHtml.ts";
import { sendResendEmail } from "../_shared/resend.ts";
import { trackPostHog } from "../_shared/posthog.ts";

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

type BudgetRow = {
  nature_name?: string | null;
  type_name?: string | null;
  planned_value?: number | null;
  spent_value?: number | null;
  percentage_used?: number | null;
};

type HabitRow = { id: string; name: string | null; kind?: string | null };
type HabitLogRow = { habit_id: string; date: string; completed: boolean };

function monthStartIso(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function expenseBudgets(rows: BudgetRow[]) {
  return rows.filter((b) => /despesa/i.test(b.nature_name || ""));
}

function budgetSection(rows: BudgetRow[]): string {
  const expenses = expenseBudgets(rows);
  if (expenses.length === 0) {
    return `<p style="margin:20px 0 0;color:#e4e4e7;font-size:14px;font-weight:600;">Orçamento</p>
      <p style="margin:8px 0 0;color:#a1a1aa;font-size:14px;">Sem teto definido este mês — vale montar em Finanças → Orçamento.</p>`;
  }

  const planned = expenses.reduce(
    (s, b) => s + Number(b.planned_value || 0),
    0
  );
  const spent = expenses.reduce((s, b) => s + Number(b.spent_value || 0), 0);
  const pct = planned > 0 ? Math.round((spent / planned) * 100) : 0;
  const tone =
    pct >= 100 ? "#f87171" : pct >= 80 ? "#fbbf24" : "#4ade80";

  const worst = [...expenses].sort(
    (a, b) => Number(b.percentage_used || 0) - Number(a.percentage_used || 0)
  )[0];
  const worstLine =
    worst && Number(worst.percentage_used || 0) >= 80
      ? `<p style="margin:8px 0 0;color:#a1a1aa;font-size:13px;">Atenção: <strong style="color:#e4e4e7;">${
          worst.type_name || "categoria"
        }</strong> em ${Math.round(Number(worst.percentage_used || 0))}% do teto.</p>`
      : "";

  return `<p style="margin:20px 0 0;color:#e4e4e7;font-size:14px;font-weight:600;">Orçamento de ${monthLabelPt()}</p>
    <p style="margin:8px 0 0;font-size:15px;line-height:1.5;">
      <span style="color:#f4f4f5;font-weight:600;">${formatBRL(spent)}</span>
      <span style="color:#a1a1aa;"> de ${formatBRL(planned)}</span>
      <span style="color:${tone};font-weight:600;"> · ${pct}%</span>
    </p>
    ${worstLine}`;
}

function habitsSection(
  habits: HabitRow[],
  logs: HabitLogRow[]
): string {
  if (habits.length === 0) {
    return `<p style="margin:20px 0 0;color:#e4e4e7;font-size:14px;font-weight:600;">Hábitos</p>
      <p style="margin:8px 0 0;color:#a1a1aa;font-size:14px;">Nenhum hábito ainda — o hub Vida conta check-ins da semana.</p>`;
  }

  const done = logs.filter((l) => l.completed);
  const byHabit = new Map<string, number>();
  for (const l of done) {
    byHabit.set(l.habit_id, (byHabit.get(l.habit_id) ?? 0) + 1);
  }

  const top = [...habits]
    .map((h) => ({
      name: h.name?.trim() || "Hábito",
      count: byHabit.get(h.id) ?? 0,
      kind: h.kind ?? "build",
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const items = top.map((h) => ({
    title: h.name,
    meta:
      h.count === 0
        ? h.kind === "avoid"
          ? "Sem registro esta semana"
          : "0 check-ins nos últimos 7 dias"
        : h.kind === "avoid"
          ? `${h.count} dia${h.count === 1 ? "" : "s"} limpo${h.count === 1 ? "" : "s"}`
          : `${h.count} check-in${h.count === 1 ? "" : "s"}`,
  }));

  return `<p style="margin:20px 0 0;color:#e4e4e7;font-size:14px;font-weight:600;">Hábitos · últimos 7 dias</p>
    <p style="margin:8px 0 0;color:#a1a1aa;font-size:14px;">${done.length} registro${done.length === 1 ? "" : "s"} em ${habits.length} hábito${habits.length === 1 ? "" : "s"}.</p>
    ${emailListBlock(items)}`;
}

function parcelsSection(rows: RecurringRow[]): string {
  const parcels = rows.map((r) => ({
    title: r.description?.trim() || "Recorrência",
    meta: `${formatBRL(Number(r.value) || 0)} · dia ${
      r.due_day != null ? String(r.due_day) : "—"
    }`,
  }));

  if (parcels.length === 0) {
    return `<p style="margin:20px 0 0;color:#e4e4e7;font-size:14px;font-weight:600;">Próximas recorrências</p>
      <p style="margin:8px 0 0;color:#a1a1aa;font-size:14px;">Nenhuma em aberto — cadastre em Finanças → Parcelas se tiver.</p>`;
  }

  return `<p style="margin:20px 0 0;color:#e4e4e7;font-size:14px;font-weight:600;">Próximas recorrências</p>
    ${emailListBlock(parcels)}`;
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

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: candidates, error: listError } = await admin.rpc(
    "weekly_digest_candidates",
    { p_active_days: 21, p_min_gap_days: 6, p_limit: 80 }
  );
  if (listError) return jsonResponse({ error: listError.message }, 500);

  const rows = (candidates ?? []) as Candidate[];
  let sent = 0;
  let failed = 0;
  const errors: { email: string; error: string }[] = [];
  const monthIso = monthStartIso();
  const weekStart = daysAgoIso(7);

  for (const row of rows) {
    const [{ data: recurring }, { data: budgets }, { data: habits }] =
      await Promise.all([
        admin
          .from("recurring_transaction")
          .select("description, value, due_day")
          .eq("user_id", row.user_id)
          .eq("status", true)
          .order("due_day", { ascending: true })
          .limit(4),
        admin
          .from("vw_monthly_budget_summary")
          .select(
            "nature_name, type_name, planned_value, spent_value, percentage_used"
          )
          .eq("user_id", row.user_id)
          .eq("budget_month", monthIso),
        admin
          .from("habit")
          .select("id, name, kind")
          .eq("user_id", row.user_id)
          .order("created_at", { ascending: true })
          .limit(20),
      ]);

    const habitRows = (habits ?? []) as HabitRow[];
    let logs: HabitLogRow[] = [];
    if (habitRows.length > 0) {
      const { data: logRows } = await admin
        .from("habit_log")
        .select("habit_id, date, completed")
        .in(
          "habit_id",
          habitRows.map((h) => h.id)
        )
        .gte("date", weekStart)
        .eq("completed", true);
      logs = (logRows ?? []) as HabitLogRow[];
    }

    const firstName = firstNameFromEmail(row.email);
    const greet = firstName ? `Oi, ${firstName}` : "Oi";
    const bodyHtml = [
      `<p style="margin:0;">Resumo rápido de ${monthLabelPt()}: orçamento, hábitos da semana e o que vem nas parcelas.</p>`,
      budgetSection((budgets ?? []) as BudgetRow[]),
      habitsSection(habitRows, logs),
      parcelsSection((recurring ?? []) as RecurringRow[]),
    ].join("");

    const html = emailShell({
      eyebrow: "Orbyva · Digest semanal",
      title: `${greet} — como vai ${monthLabelPt()}?`,
      bodyHtml,
      ctaLabel: "Ver orçamento",
      ctaUrl: `${siteUrl}/finance/budget`,
      secondaryLabel: "Abrir hub",
      secondaryUrl: `${siteUrl}/home`,
      footer:
        "Preferências em Conta → E-mails. Digest respeita opt-out de produto.",
    });

    const result = await sendResendEmail({
      to: row.email,
      subject: `Orbyva · seu resumo de ${monthLabelPt()}`,
      html,
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
    await trackPostHog(
      "weekly_digest_sent",
      row.user_id,
      {
        budget_rows: (budgets ?? []).length,
        habit_count: habitRows.length,
        habit_checkins: logs.length,
        parcel_count: (recurring ?? []).length,
      },
      "orbyva-digest-edge"
    );
  }

  return jsonResponse({
    ok: true,
    candidates: rows.length,
    sent,
    failed,
    errors: errors.slice(0, 10),
  });
});
