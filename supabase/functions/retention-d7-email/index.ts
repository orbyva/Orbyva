/**
 * Cron diário: retorno D7 / D14 / D30 para contas inativas.
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
  emailShell,
  firstNameFromEmail,
} from "../_shared/emailHtml.ts";
import { sendResendEmail } from "../_shared/resend.ts";
import { trackPostHog } from "../_shared/posthog.ts";

type Candidate = {
  user_id: string;
  email: string;
  created_at: string;
  last_seen_at: string | null;
};

type Stage = "d7" | "d14" | "d30";

const STAGES: Record<
  Stage,
  {
    rpc: string;
    args: Record<string, number>;
    sentCol: string;
    subject: string;
    title: (greet: string) => string;
    body: string;
  }
> = {
  d7: {
    rpc: "retention_d7_email_candidates",
    args: {
      p_min_age_days: 7,
      p_max_age_days: 14,
      p_inactive_days: 5,
      p_limit: 50,
    },
    sentCol: "retention_email_sent_at",
    subject: "Seu mês ainda está no Orbyva",
    title: (g) => `${g}, seu mês ainda tá aí`,
    body: "Faz uma semana que você entrou. Orçamento, parcelas e o life OS continuam te esperando, leva 2 minutos para ver o que ainda cabe no mês.",
  },
  d14: {
    rpc: "retention_d14_email_candidates",
    args: {
      p_min_age_days: 14,
      p_max_age_days: 21,
      p_inactive_days: 7,
      p_limit: 50,
    },
    sentCol: "retention_d14_email_sent_at",
    subject: "Orbyva · duas semanas, ainda dá tempo",
    title: (g) => `${g}, o mês não espera`,
    body: "Já faz umas duas semanas. Um olhar no orçamento e nas parcelas ainda muda o fechamento do mês. Sem pressão, só um empurrão leve.",
  },
  d30: {
    rpc: "retention_d30_email_candidates",
    args: {
      p_min_age_days: 28,
      p_max_age_days: 40,
      p_inactive_days: 14,
      p_limit: 50,
    },
    sentCol: "retention_d30_email_sent_at",
    subject: "Orbyva · sentimos sua falta",
    title: (g) => `${g}, um mês sem você`,
    body: "Seu life OS continua guardado. Quando quiser, o hub, o orçamento e os hábitos estão no mesmo lugar, um login e você volta.",
  },
};

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
  const only = new URL(req.url).searchParams.get("stage") as Stage | null;
  const stages: Stage[] = only ? [only] : ["d7", "d14", "d30"];
  const summary: Record<string, { candidates: number; sent: number; failed: number }> =
    {};

  for (const stage of stages) {
    const meta = STAGES[stage];
    summary[stage] = { candidates: 0, sent: 0, failed: 0 };
    const { data: candidates, error: listError } = await admin.rpc(
      meta.rpc,
      meta.args
    );
    if (listError) {
      console.error(stage, listError.message);
      summary[stage].failed += 1;
      continue;
    }

    const rows = (candidates ?? []) as Candidate[];
    summary[stage].candidates = rows.length;

    for (const row of rows) {
      const firstName = firstNameFromEmail(row.email);
      const greet = firstName ? `Oi, ${firstName}` : "Oi";
      const html = emailShell({
        eyebrow: "Orbyva",
        title: meta.title(greet),
        bodyHtml: `<p style="margin:0;">${meta.body}</p>`,
        ctaLabel: "Abrir o Orbyva",
        ctaUrl: `${siteUrl}/login`,
        footer: "Se não for mais a sua praia, ignore este e-mail, sem drama.",
      });

      const result = await sendResendEmail({
        to: row.email,
        subject: meta.subject,
        html,
      });

      if (!result.ok) {
        summary[stage].failed += 1;
        continue;
      }

      const { error: markError } = await admin
        .from("profiles")
        .update({ [meta.sentCol]: new Date().toISOString() })
        .eq("id", row.user_id)
        .is(meta.sentCol, null);

      if (markError) {
        summary[stage].failed += 1;
        continue;
      }

      summary[stage].sent += 1;
      await trackPostHog(
        "retention_email_sent",
        row.user_id,
        {
          stage,
          days_since_signup: Math.floor(
            (Date.now() - new Date(row.created_at).getTime()) / 86_400_000
          ),
          had_last_seen: Boolean(row.last_seen_at),
        },
        "orbyva-retention-edge"
      );
    }
  }

  return jsonResponse({ ok: true, summary });
});
