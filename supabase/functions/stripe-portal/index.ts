import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import {
  corsHeadersForRequest,
  siteOriginFromEnv,
} from "../_shared/cors.ts";
import {
  BILLING_ERROR_CODES,
  billingDenied,
  billingJson,
  consumeBillingQuota,
  isStripeCustomerId,
  stripeIdempotencyKey,
} from "../_shared/billingGuard.ts";

function requireSiteOrigin(req: Request): string | Response {
  const origin = siteOriginFromEnv();
  if (!origin) {
    return billingJson(
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
  if (req.method !== "POST") {
    return billingJson(req, { error: "Método não permitido." }, 405);
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!stripeKey) {
      return billingJson(req, { error: "Stripe não configurado." }, 503);
    }

    const siteOrigin = requireSiteOrigin(req);
    if (siteOrigin instanceof Response) return siteOrigin;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return billingJson(req, { error: "Não autenticado" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return billingJson(req, { error: "Não autenticado" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const quota = await consumeBillingQuota(admin, user.id, "portal");
    if (!quota.ok) {
      if (quota.reason === "limit") {
        return billingDenied(req, BILLING_ERROR_CODES.RATE_LIMITED, 429);
      }
      return billingJson(
        req,
        { error: "Não foi possível abrir o portal de assinatura. Tente de novo." },
        503
      );
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    const customerId = profile?.stripe_customer_id as string | null | undefined;
    if (!isStripeCustomerId(customerId)) {
      return billingJson(req, { error: "Nenhuma assinatura encontrada." }, 400);
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    await req.json().catch(() => ({}));
    const returnUrl = `${siteOrigin}/account`;

    const session = await stripe.billingPortal.sessions.create(
      {
        customer: customerId,
        return_url: returnUrl,
      },
      { idempotencyKey: stripeIdempotencyKey("portal", user.id) }
    );

    return billingJson(req, { url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return billingJson(req, { error: message }, 500);
  }
});
