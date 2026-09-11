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
  claimCustomerWithRetry,
  consumeBillingQuota,
  finishCustomer,
  isStripeCustomerId,
  releaseCustomerClaim,
  shouldBlockCheckout,
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
    const priceId = (Deno.env.get("STRIPE_PRICE_ID_PRO") ?? "").trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!stripeKey || !priceId) {
      return billingJson(
        req,
        {
          error:
            "Stripe não configurado (STRIPE_SECRET_KEY / STRIPE_PRICE_ID_PRO).",
        },
        503
      );
    }
    if (!priceId.startsWith("price_")) {
      return billingJson(
        req,
        {
          error:
            "STRIPE_PRICE_ID_PRO deve ser um Price (price_...), não Product (prod_...).",
        },
        503
      );
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
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    await req.json().catch(() => ({}));
    const successUrl = `${siteOrigin}/account?checkout=success`;
    const cancelUrl = `${siteOrigin}/account?checkout=cancel`;

    const quota = await consumeBillingQuota(admin, user.id, "checkout");
    if (!quota.ok) {
      if (quota.reason === "limit") {
        return billingDenied(req, BILLING_ERROR_CODES.RATE_LIMITED, 429);
      }
      return billingJson(
        req,
        { error: "Não foi possível abrir o checkout. Tente de novo." },
        503
      );
    }

    const claimed = await claimCustomerWithRetry(admin, user.id);
    if (!claimed.ok) {
      if (claimed.reason === "inflight") {
        return billingDenied(
          req,
          BILLING_ERROR_CODES.CHECKOUT_IN_PROGRESS,
          409
        );
      }
      return billingJson(
        req,
        { error: "Não foi possível abrir o checkout. Tente de novo." },
        503
      );
    }

    if (shouldBlockCheckout(claimed.subscription_status)) {
      if (claimed.action === "create" && claimed.claim) {
        await releaseCustomerClaim(admin, user.id, claimed.claim);
      }
      return billingDenied(req, BILLING_ERROR_CODES.ALREADY_SUBSCRIBED, 409);
    }

    let customerId = claimed.customer_id;
    if (claimed.action === "create" || !isStripeCustomerId(customerId)) {
      if (!claimed.claim) {
        return billingJson(
          req,
          { error: "Não foi possível abrir o checkout. Tente de novo." },
          503
        );
      }
      const customer = await stripe.customers.create(
        {
          email: user.email ?? undefined,
          metadata: { supabase_user_id: user.id },
        },
        { idempotencyKey: stripeIdempotencyKey("customer", user.id) }
      );
      const finished = await finishCustomer(
        admin,
        user.id,
        claimed.claim,
        customer.id
      );
      if (!finished.ok || !isStripeCustomerId(finished.customer_id)) {
        await releaseCustomerClaim(admin, user.id, claimed.claim);
        return billingJson(
          req,
          { error: "Não foi possível abrir o checkout. Tente de novo." },
          500
        );
      }
      if (finished.customer_id !== customer.id) {
        try {
          await stripe.customers.del(customer.id);
        } catch {
          /* órfão residual; o perfil ficou com o Customer que já existia */
        }
      }
      customerId = finished.customer_id;
    }

    if (!isStripeCustomerId(customerId)) {
      return billingJson(
        req,
        { error: "Não foi possível abrir o checkout. Tente de novo." },
        500
      );
    }

    const session = await stripe.checkout.sessions.create(
      {
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
      },
      { idempotencyKey: stripeIdempotencyKey("checkout", user.id) }
    );

    return billingJson(req, { url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return billingJson(req, { error: message }, 500);
  }
});
