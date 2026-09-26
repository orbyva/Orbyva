/**
 * Cron diário: welcome + nurture D3/D7 da waitlist.
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
  id: string;
  email: string;
  created_at: string;
  source: string | null;
};

type Kind = "welcome" | "nurture_d3" | "nurture_d7";
type MailCopy = {
  sentCol: string;
  subject: string;
  title: (g: string) => string;
  body: string;
  cta: string;
  path: string;
};

const CABE_SOURCE = "quanto-ainda-cabe";

const WAITLIST_KINDS: Record<Kind, MailCopy> = {
  welcome: {
    sentCol: "welcome_sent_at",
    subject: "Você entrou na lista do Orbyva",
    title: (g) => `${g}, estamos preparando sua órbita`,
    body: "Obrigado por entrar na waitlist. Orbyva é o life OS com finanças no centro, orçamento, parcelas, hábitos e mais. Avisamos quando liberar (ou quando o checkout estiver aberto).",
    cta: "Conhecer o Orbyva",
    path: "/",
  },
  nurture_d3: {
    sentCol: "nurture_d3_sent_at",
    subject: "Orbyva · o que o life OS resolve",
    title: (g) => `${g}, um app, várias órbitas`,
    body: "Enquanto a lista anda: no Orbyva você lança despesas, define o orçamento do mês, acompanha parcelas e ainda tem hábitos, metas e viagens no mesmo lugar. Sem planilha paralela.",
    cta: "Ver a landing",
    path: "/",
  },
  nurture_d7: {
    sentCol: "nurture_d7_sent_at",
    subject: "Orbyva · ainda na lista?",
    title: (g) => `${g}, um empurrão leve`,
    body: "Faz uma semana na waitlist. Se o Pro já estiver aberto no site, vale tentar o cadastro, senão, respondemos assim que houver vaga. Obrigado por esperar com a gente.",
    cta: "Abrir orbyva.app",
    path: "/",
  },
};

const CABE_KINDS: Record<Kind, MailCopy> = {
  welcome: {
    sentCol: "welcome_sent_at",
    subject: "Está dentro do orçamento? · o recorte que você viu",
    title: (g) => `${g}, no app isso atualiza sozinho`,
    body: "Você acabou de ver se a compra está dentro do orçamento. No Orbyva, lançamentos, contas e orçamento ficam na mesma órbita, e o restante muda com o mês real. 7 dias grátis, sem cartão.",
    cta: "Começar grátis",
    path: "/login?mode=signup",
  },
  nurture_d3: {
    sentCol: "nurture_d3_sent_at",
    subject: "Orbyva · uma conta atrasada distorce o mês",
    title: (g) => `${g}, o restante mente se a conta atrasou`,
    body: "A ferramenta é um recorte estático. No app, recorrências e alertas entram no mesmo restante do mês, e você simula uma compra na Projeção antes de comprometer a folga.",
    cta: "Ver o Orbyva",
    path: "/",
  },
  nurture_d7: {
    sentCol: "nurture_d7_sent_at",
    subject: "Orbyva · 7 dias para o mês atualizar sozinho",
    title: (g) => `${g}, o teste é curto de propósito`,
    body: "No Orbyva o restante do mês não é uma conta avulsa: entra lançamento, conta e orçamento, e você vê se está dentro do orçamento. 7 dias grátis; depois Pro, se fizer sentido.",
    cta: "Começar o teste",
    path: "/login?mode=signup",
  },
};

function copyFor(kind: Kind, source: string | null): MailCopy {
  return source === CABE_SOURCE ? CABE_KINDS[kind] : WAITLIST_KINDS[kind];
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
  const only = new URL(req.url).searchParams.get("kind") as Kind | null;
  const kinds: Kind[] = only
    ? [only]
    : ["welcome", "nurture_d3", "nurture_d7"];
  const summary: Record<string, { candidates: number; sent: number; failed: number }> =
    {};

  for (const kind of kinds) {
    summary[kind] = { candidates: 0, sent: 0, failed: 0 };
    const { data, error } = await admin.rpc("waitlist_email_candidates", {
      p_kind: kind,
      p_limit: 50,
    });
    if (error) {
      console.error(kind, error.message);
      summary[kind].failed += 1;
      continue;
    }

    const rows = (data ?? []) as Candidate[];
    summary[kind].candidates = rows.length;

    for (const row of rows) {
      const meta = copyFor(kind, row.source);
      const first = firstNameFromEmail(row.email);
      const greet = first ? `Oi, ${first}` : "Oi";
      const html = emailShell({
        eyebrow:
          row.source === CABE_SOURCE
            ? "Orbyva · Está dentro do orçamento?"
            : "Orbyva · Waitlist",
        title: meta.title(greet),
        bodyHtml: `<p style="margin:0;">${meta.body}</p>`,
        ctaLabel: meta.cta,
        ctaUrl: `${siteUrl}${meta.path}`,
        footer:
          row.source === CABE_SOURCE
            ? "Você recebeu isto porque usou a ferramenta Está dentro do orçamento?. Se não pediu, ignore."
            : "Você recebeu isto por estar na waitlist do Orbyva. Se não pediu, ignore.",
      });

      const result = await sendResendEmail({
        to: row.email,
        subject: meta.subject,
        html,
      });

      if (!result.ok) {
        summary[kind].failed += 1;
        continue;
      }

      const { error: markError } = await admin
        .from("waitlist")
        .update({ [meta.sentCol]: new Date().toISOString() })
        .eq("id", row.id)
        .is(meta.sentCol, null);

      if (markError) {
        summary[kind].failed += 1;
        continue;
      }

      summary[kind].sent += 1;
      await trackPostHog(
        "waitlist_email_sent",
        row.email,
        { kind, source: row.source },
        "orbyva-waitlist-edge"
      );
    }
  }

  return jsonResponse({ ok: true, summary });
});
