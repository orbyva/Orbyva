import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { applyStripeWebhookEvent } from "./apply-event.ts";

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
  await admin.from("profiles").upsert({
    id: userId,
    ...patch,
    updated_at: new Date().toISOString(),
  });
}

Deno.serve(async (req) => {
  // Stripe → Edge (server-to-server); sem CORS aberto.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!stripeKey || !webhookSecret) {
    return json({ error: "Webhook Stripe não configurado." }, 503);
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-12-18.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });
  const admin = createClient(supabaseUrl, serviceKey);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "Assinatura ausente" }, 400);

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: `Webhook inválido: ${message}` }, 400);
  }

  try {
    const result = applyStripeWebhookEvent(event);

    if (result.action === "upsert") {
      await upsertProfile(admin, result.userId, result.patch);
    } else if (result.action === "upsert_by_customer") {
      const { data } = await admin
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", result.customerId)
        .maybeSingle();
      if (data?.id) {
        await upsertProfile(admin, data.id, result.patch);
      }
    }

    return json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
