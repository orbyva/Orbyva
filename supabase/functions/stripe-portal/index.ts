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

function requireSiteOrigin(): string | Response {
  const siteRaw = (Deno.env.get("SITE_URL") ?? "").trim().replace(/\/$/, "");
  if (!siteRaw) {
    return json(
      {
        error:
          "SITE_URL não configurada. Defina o secret https://orbyva.app (ou seu domínio).",
      },
      503
    );
  }
  try {
    const site = new URL(siteRaw);
    if (site.protocol !== "http:" && site.protocol !== "https:") {
      return json({ error: "SITE_URL deve começar com https://" }, 503);
    }
    return site.origin;
  } catch {
    return json(
      { error: "SITE_URL inválida. Use https://orbyva.app sem barra no final." },
      503
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!stripeKey) {
      return json({ error: "Stripe não configurado." }, 503);
    }

    const siteOrigin = requireSiteOrigin();
    if (siteOrigin instanceof Response) return siteOrigin;

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
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.stripe_customer_id) {
      return json({ error: "Nenhuma assinatura encontrada." }, 400);
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    await req.json().catch(() => ({}));
    const returnUrl = `${siteOrigin}/account`;

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnUrl,
    });

    return json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
