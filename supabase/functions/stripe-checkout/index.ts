import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Só aceita URLs no mesmo origin de SITE_URL (anti open-redirect). */
function allowedSiteUrl(candidate: unknown, fallbackPath: string): string {
  const siteRaw = (Deno.env.get("SITE_URL") ?? "").trim().replace(/\/$/, "");
  const fallback = siteRaw
    ? `${siteRaw}${fallbackPath.startsWith("/") ? fallbackPath : `/${fallbackPath}`}`
    : fallbackPath;

  if (typeof candidate !== "string" || !candidate.trim()) return fallback;
  if (!siteRaw) return fallback;

  try {
    const site = new URL(siteRaw);
    const url = new URL(candidate);
    if (url.origin !== site.origin) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const priceId = Deno.env.get("STRIPE_PRICE_ID_PRO");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!stripeKey || !priceId) {
      return json(
        { error: "Stripe não configurado (STRIPE_SECRET_KEY / STRIPE_PRICE_ID_PRO)." },
        503
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const body = await req.json().catch(() => ({}));
    void body; // ignore client URLs — só SITE_URL
    const successUrl = allowedSiteUrl(undefined, "/account?checkout=success");
    const cancelUrl = allowedSiteUrl(undefined, "/account?checkout=cancel");

    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    let customerId = profile?.stripe_customer_id as string | null | undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await admin.from("profiles").upsert({
        id: user.id,
        plan: "free",
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
    });

    return json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
