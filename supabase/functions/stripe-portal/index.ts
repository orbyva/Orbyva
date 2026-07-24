import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import {
  corsHeadersForRequest,
  siteOriginFromEnv,
} from "../_shared/cors.ts";

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersForRequest(req),
      "Content-Type": "application/json",
    },
  });
}

function requireSiteOrigin(req: Request): string | Response {
  const origin = siteOriginFromEnv();
  if (!origin) {
    return json(
      req,
      {
        error:
          "SITE_URL não configurada. Defina o secret https://orbyva.app (ou seu domínio).",
      },
      503
    );
  }
  return origin;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersForRequest(req) });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!stripeKey) {
      return json(req, { error: "Stripe não configurado." }, 503);
    }

    const siteOrigin = requireSiteOrigin(req);
    if (siteOrigin instanceof Response) return siteOrigin;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(req, { error: "Não autenticado" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return json(req, { error: "Não autenticado" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.stripe_customer_id) {
      return json(req, { error: "Nenhuma assinatura encontrada." }, 400);
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

    return json(req, { url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(req, { error: message }, 500);
  }
});
