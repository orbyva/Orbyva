/**
 * Cron diário: welcome, trial ending/expired, onboarding nudge, alertas (opt-in).
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { siteOriginFromEnv } from "../_shared/cors.ts";
import {
  assertCronAuth,
  jsonResponse,
  unauthorizedResponse,
} from "../_shared/cronAuth.ts";
import { sendResendEmail } from "../_shared/resend.ts";
import {
  emailShell,
  firstNameFromEmail,
} from "../_shared/emailHtml.ts";

type Candidate = {
  user_id: string;
  email: string;
  created_at: string;
  last_seen_at: string | null;
  plan: string | null;
  subscription_status: string | null;
};

type Kind =
  | "welcome"
  | "trial_ending"
  | "trial_expired"
  | "onboarding_nudge"
  | "alerts_digest";

const KIND_META: Record<
  Kind,
  { sentCol: string; subject: (site: string) => string }
> = {
  welcome: {
    sentCol: "welcome_email_sent_at",
    subject: () => "Bem-vindo ao Orbyva — 7 dias pra organizar o mês",
  },
  trial_ending: {
    sentCol: "trial_ending_email_sent_at",
    subject: () => "Seu teste Orbyva acaba em breve",
  },
  trial_expired: {
    sentCol: "trial_expired_email_sent_at",
    subject: () => "O teste acabou — continue no Pro",
  },
  onboarding_nudge: {
    sentCol: "onboarding_nudge_sent_at",
    subject: () => "Falta a 1ª despesa no Orbyva",
  },
  alerts_digest: {
    sentCol: "alerts_digest_sent_at",
    subject: () => "Orbyva · alertas do seu mês",
  },
};

function contentFor(
  kind: Kind,
  siteUrl: string,
  firstName: string | undefined,
  extra?: { overdueCount?: number; budgetOver?: string[] }
) {
  const greet = firstName ? `Oi, ${firstName}` : "Oi";
  switch (kind) {
    case "welcome":
      return emailShell({
        eyebrow: "Orbyva · Boas-vindas",
        title: `${greet} — sua órbita começou`,
        bodyHtml: `<p style="margin:0;">Você tem 7 dias com tudo liberado. O caminho mais curto:</p>
          <ol style="margin:12px 0 0;padding-left:18px;color:#d4d4d8;">
            <li>Lance a primeira despesa</li>
            <li>Defina o teto do orçamento</li>
            <li>Olhe as parcelas do mês</li>
          </ol>`,
        ctaLabel: "Abrir o hub",
        ctaUrl: `${siteUrl}/home`,
      });
    case "trial_ending":
      return emailShell({
        eyebrow: "Orbyva · Teste",
        title: `${greet} — o teste está acabando`,
        bodyHtml: `<p style="margin:0;">Restam poucos dias do acesso completo. Se o orçamento e as parcelas já ajudaram, o Pro mantém tudo por R$&nbsp;19,90/mês.</p>`,
        ctaLabel: "Ver planos na Conta",
        ctaUrl: `${siteUrl}/account`,
      });
    case "trial_expired":
      return emailShell({
        eyebrow: "Orbyva · Teste encerrado",
        title: `${greet} — continue de onde parou`,
        bodyHtml: `<p style="margin:0;">O período de teste terminou. Seus dados continuam salvos — assine o Pro para voltar ao ledger e ao life OS.</p>`,
        ctaLabel: "Assinar Pro",
        ctaUrl: `${siteUrl}/account?trial=expired`,
      });
    case "onboarding_nudge":
      return emailShell({
        eyebrow: "Orbyva · Ativação",
        title: `${greet} — ainda sem a 1ª despesa`,
        bodyHtml: `<p style="margin:0;">O hub fica vivo quando o livro-caixa começa. Dois minutos: uma categoria e um valor.</p>`,
        ctaLabel: "Lançar transação",
        ctaUrl: `${siteUrl}/finance/transactions`,
      });
    case "alerts_digest": {
      const overdue = extra?.overdueCount ?? 0;
      const budget = extra?.budgetOver ?? [];
      const lines: string[] = [];
      if (overdue > 0) {
        lines.push(
          `${overdue} parcela${overdue === 1 ? "" : "s"} atrasada${overdue === 1 ? "" : "s"}`
        );
      }
      if (budget.length > 0) {
        lines.push(`Orçamento estourado: ${budget.slice(0, 4).join(", ")}`);
      }
      const body =
        lines.length === 0
          ? `<p style="margin:0;">Nada crítico no radar — vale um olhar rápido no hub.</p>`
          : `<ul style="margin:0;padding-left:18px;">${lines
              .map((l) => `<li>${l}</li>`)
              .join("")}</ul>`;
      return emailShell({
        eyebrow: "Orbyva · Alertas",
        title: `${greet} — o que precisa de atenção`,
        bodyHtml: body,
        ctaLabel: "Abrir alertas",
        ctaUrl: `${siteUrl}/home`,
      });
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!assertCronAuth(req)) return unauthorizedResponse();

  const siteUrl = siteOriginFromEnv();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const only = (url.searchParams.get("kind") as Kind | null) ?? null;
  const kinds: Kind[] = only
    ? [only]
    : ["welcome", "trial_ending", "trial_expired", "onboarding_nudge", "alerts_digest"];

  const summary: Record<string, { sent: number; errors: number }> = {};

  for (const kind of kinds) {
    summary[kind] = { sent: 0, errors: 0 };
    const { data: rows, error } = await supabase.rpc(
      "lifecycle_email_candidates",
      { p_kind: kind, p_limit: 50 }
    );
    if (error) {
      console.error(kind, error.message);
      summary[kind].errors += 1;
      continue;
    }

    for (const row of (rows ?? []) as Candidate[]) {
      let extra: { overdueCount?: number; budgetOver?: string[] } | undefined;

      if (kind === "alerts_digest") {
        const monthStart = new Date();
        monthStart.setDate(1);
        const monthIso = monthStart.toISOString().slice(0, 10);

        const { count: overdueCount } = await supabase
          .from("recurring_transaction")
          .select("id", { count: "exact", head: true })
          .eq("user_id", row.user_id)
          .eq("status", true)
          .lt("due_day", new Date().getDate());

        const { data: budgets } = await supabase
          .from("vw_monthly_budget_summary")
          .select("type_name, planned_value, spent_value")
          .eq("user_id", row.user_id)
          .eq("budget_month", monthIso);

        const budgetOver = (budgets ?? [])
          .filter(
            (b: { planned_value?: number; spent_value?: number; type_name?: string }) =>
              Number(b.planned_value || 0) > 0 &&
              Number(b.spent_value || 0) > Number(b.planned_value || 0)
          )
          .map((b: { type_name?: string }) => b.type_name || "Categoria");

        // Evita spam: só manda se houver algo.
        if ((overdueCount ?? 0) === 0 && budgetOver.length === 0) continue;
        extra = { overdueCount: overdueCount ?? 0, budgetOver };
      }

      const first = firstNameFromEmail(row.email);
      const html = contentFor(kind, siteUrl, first, extra);
      const sent = await sendResendEmail({
        to: row.email,
        subject: KIND_META[kind].subject(siteUrl),
        html,
      });

      if (!sent.ok) {
        console.error(kind, row.user_id, sent.error);
        summary[kind].errors += 1;
        continue;
      }

      const col = KIND_META[kind].sentCol;
      if (col) {
        await supabase
          .from("profiles")
          .update({ [col]: new Date().toISOString() })
          .eq("id", row.user_id);
      }
      summary[kind].sent += 1;
    }
  }

  return jsonResponse({ ok: true, summary });
});
