import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { applyStripeWebhookEvent } from "./apply-event.ts";
import { sendResendEmail } from "../_shared/resend.ts";
import { emailShell, firstNameFromEmail } from "../_shared/emailHtml.ts";
import { siteOriginFromEnv } from "../_shared/cors.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function upsertProfile(
  admin: ReturnType<typeof createClient>,
  userId: string,
  patch: Record<string, unknown>
) {
  const { error } = await admin.from("profiles").upsert({
    id: userId,
    ...patch,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    throw new Error(`Falha ao upsert profile: ${error.message}`);
  }
}

async function notifyUser(
  admin: ReturnType<typeof createClient>,
  userId: string,
  kind: "payment_failed" | "pro_welcome" | "cancel_winback"
) {
  const siteUrl = siteOriginFromEnv();
  const { data: profile } = await admin
    .from("profiles")
    .select(
      "email_unsubscribed_at, payment_failed_email_sent_at, pro_welcome_email_sent_at, cancel_winback_email_sent_at"
    )
    .eq("id", userId)
    .maybeSingle();
  if (profile?.email_unsubscribed_at) return;

  const { data: userData } = await admin.auth.admin.getUserById(userId);
  const email = userData.user?.email;
  if (!email) return;

  const first = firstNameFromEmail(email);
  const greet = first ? `Oi, ${first}` : "Oi";

  if (kind === "payment_failed") {
    if (profile?.payment_failed_email_sent_at) {
      const last = new Date(profile.payment_failed_email_sent_at).getTime();
      if (Date.now() - last < 3 * 24 * 60 * 60 * 1000) return;
    }
    const html = emailShell({
      eyebrow: "Orbyva · Cobrança",
      title: `${greet} — não conseguimos renovar o Pro`,
      bodyHtml: `<p style="margin:0;">O pagamento da assinatura falhou. Atualize o cartão no portal para não perder o acesso.</p>`,
      ctaLabel: "Abrir portal de cobrança",
      ctaUrl: `${siteUrl}/account`,
    });
    const sent = await sendResendEmail({
      to: email,
      subject: "Orbyva — falha no pagamento do Pro",
      html,
    });
    if (sent.ok) {
      await admin
        .from("profiles")
        .update({ payment_failed_email_sent_at: new Date().toISOString() })
        .eq("id", userId);
    }
    return;
  }

  if (kind === "cancel_winback") {
    if (profile?.cancel_winback_email_sent_at) return;
    const html = emailShell({
      eyebrow: "Orbyva · Até logo",
      title: `${greet} — sentiremos sua falta no Pro`,
      bodyHtml: `<p style="margin:0;">Sua assinatura foi cancelada. Seus dados continuam aí — se mudar de ideia, o Pro volta em um clique na Conta.</p>`,
      ctaLabel: "Reativar Pro",
      ctaUrl: `${siteUrl}/account`,
      footer:
        "Você pode pausar e-mails de produto em Conta. Auth (login/senha) sempre chega.",
    });
    const sent = await sendResendEmail({
      to: email,
      subject: "Orbyva — sua assinatura foi cancelada",
      html,
    });
    if (sent.ok) {
      await admin
        .from("profiles")
        .update({ cancel_winback_email_sent_at: new Date().toISOString() })
        .eq("id", userId);
    }
    return;
  }

  if (profile?.pro_welcome_email_sent_at) return;
  const html = emailShell({
    eyebrow: "Orbyva · Pro",
    title: `${greet} — bem-vindo ao Pro`,
    bodyHtml: `<p style="margin:0;">Assinatura confirmada. Orçamento, parcelas e o life OS continuam sem prazo — obrigado por orbitar com a gente.</p>`,
    ctaLabel: "Abrir o hub",
    ctaUrl: `${siteUrl}/home`,
  });
  const sent = await sendResendEmail({
    to: email,
    subject: "Bem-vindo ao Orbyva Pro",
    html,
  });
  if (sent.ok) {
    await admin
      .from("profiles")
      .update({ pro_welcome_email_sent_at: new Date().toISOString() })
      .eq("id", userId);
  }
}

Deno.serve(async (req) => {
  // Stripe → Edge (server-to-server); sem CORS aberto.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const stripeKey = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();
  // Trim evita whsec com \n/\r do copy-paste no terminal.
  const webhookSecret = (Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "").trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!stripeKey || !webhookSecret) {
    return json({ error: "Webhook Stripe não configurado." }, 503);
  }
  if (!webhookSecret.startsWith("whsec_")) {
    return json(
      {
        error:
          "STRIPE_WEBHOOK_SECRET inválido (deve começar com whsec_). Confira o Signing secret do endpoint Live.",
      },
      503
    );
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-12-18.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });
  const admin = createClient(supabaseUrl, serviceKey);

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return json({ error: "Assinatura ausente (header stripe-signature)." }, 400);
  }

  const body = await req.text();
  if (!body) {
    return json({ error: "Body vazio." }, 400);
  }

  let event: Stripe.Event;
  try {
    // Async: SubtleCrypto no Deno/Edge (constructEvent sync falha com frequência).
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("stripe webhook signature failed", {
      message,
      secretPrefix: webhookSecret.slice(0, 10),
      secretLen: webhookSecret.length,
      hasSig: Boolean(signature),
      bodyLen: body.length,
      keyMode: stripeKey.startsWith("sk_live_")
        ? "live"
        : stripeKey.startsWith("sk_test_")
          ? "test"
          : "unknown",
    });
    return json(
      {
        error: `Webhook inválido: ${message}`,
        hint: "Confira se STRIPE_WEBHOOK_SECRET é o Signing secret do endpoint Live deste projeto (supabase secrets set ... --project-ref ueujtwpzkquhycojjpbg).",
      },
      400
    );
  }

  try {
    const result = applyStripeWebhookEvent(event);
    console.log("stripe webhook", event.type, result.action);

    if (result.action === "upsert") {
      await upsertProfile(admin, result.userId, result.patch);
      if (result.notify) {
        await notifyUser(admin, result.userId, result.notify).catch((e) =>
          console.error("notifyUser", e)
        );
      }
    } else if (result.action === "upsert_by_customer") {
      const { data, error } = await admin
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", result.customerId)
        .maybeSingle();
      if (error) {
        throw new Error(`Lookup customer: ${error.message}`);
      }
      if (data?.id) {
        await upsertProfile(admin, data.id, result.patch);
        if (result.notify) {
          await notifyUser(admin, data.id, result.notify).catch((e) =>
            console.error("notifyUser", e)
          );
        }
      } else {
        console.warn(
          "stripe webhook: customer sem profile",
          result.customerId
        );
      }
    }

    return json({ received: true, type: event.type });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("stripe webhook handler error", message);
    return json({ error: message }, 500);
  }
});
