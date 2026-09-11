import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeadersForRequest } from "./cors.ts";
import {
  billingErrorMessage,
  hourlyLimitFor,
  secondsUntilNextUtcHour,
  type BillingErrorCode,
  type BillingKind,
} from "./billingGuardRules.ts";

export {
  BILLING_ERROR_CODES,
  billingErrorMessage,
  hourlyLimitFor,
  isStripeCustomerId,
  secondsUntilNextUtcHour,
  shouldBlockCheckout,
  stripeIdempotencyKey,
} from "./billingGuardRules.ts";

type AdminClient = ReturnType<typeof createClient>;

export type QuotaConsumeResult =
  | { ok: true; used: number; remaining: number; limit: number }
  | { ok: false; reason: string; used?: number; limit?: number; message?: string };

export type CustomerClaimResult =
  | {
      ok: true;
      action: "existing" | "create";
      customer_id: string | null;
      claim?: string;
      plan: string | null;
      subscription_status: string | null;
    }
  | {
      ok: false;
      reason: string;
      plan?: string | null;
      subscription_status?: string | null;
      message?: string;
    };

export function billingEnvSnapshot(): {
  STRIPE_CHECKOUT_HOURLY_LIMIT?: string;
  STRIPE_PORTAL_HOURLY_LIMIT?: string;
} {
  return {
    STRIPE_CHECKOUT_HOURLY_LIMIT: Deno.env.get("STRIPE_CHECKOUT_HOURLY_LIMIT"),
    STRIPE_PORTAL_HOURLY_LIMIT: Deno.env.get("STRIPE_PORTAL_HOURLY_LIMIT"),
  };
}

export function billingJson(
  req: Request,
  body: unknown,
  status = 200,
  extra: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersForRequest(req),
      "Content-Type": "application/json",
      ...extra,
    },
  });
}

export function billingDenied(
  req: Request,
  code: BillingErrorCode,
  status: 409 | 429
): Response {
  const extra =
    status === 429
      ? { "Retry-After": String(secondsUntilNextUtcHour()) }
      : {};
  return billingJson(
    req,
    { error: billingErrorMessage(code), code },
    status,
    extra
  );
}

export async function consumeBillingQuota(
  admin: AdminClient,
  userId: string,
  kind: BillingKind
): Promise<QuotaConsumeResult> {
  const limit = hourlyLimitFor(kind, billingEnvSnapshot());
  const { data, error } = await admin.rpc("billing_try_consume", {
    p_user_id: userId,
    p_kind: kind,
    p_limit: limit,
  });

  if (error) {
    return { ok: false, reason: "error", message: error.message, limit };
  }

  const row = data as {
    ok?: boolean;
    reason?: string;
    used?: number;
    limit?: number;
    remaining?: number;
  } | null;

  if (!row || row.ok !== true) {
    return {
      ok: false,
      reason: row?.reason ?? "limit",
      used: typeof row?.used === "number" ? row.used : undefined,
      limit: typeof row?.limit === "number" ? row.limit : limit,
    };
  }

  return {
    ok: true,
    used: Number(row.used ?? 0),
    remaining: Number(row.remaining ?? 0),
    limit: Number(row.limit ?? limit),
  };
}

function asClaim(data: unknown): CustomerClaimResult {
  const row = data as {
    ok?: boolean;
    action?: string;
    reason?: string;
    customer_id?: string | null;
    claim?: string;
    plan?: string | null;
    subscription_status?: string | null;
  } | null;

  if (!row || row.ok !== true) {
    return {
      ok: false,
      reason: row?.reason ?? "error",
      plan: row?.plan ?? null,
      subscription_status: row?.subscription_status ?? null,
    };
  }

  if (row.action === "existing" || row.action === "create") {
    return {
      ok: true,
      action: row.action,
      customer_id: row.customer_id ?? null,
      claim: row.claim,
      plan: row.plan ?? null,
      subscription_status: row.subscription_status ?? null,
    };
  }

  return { ok: false, reason: "error" };
}

export async function claimCustomer(
  admin: AdminClient,
  userId: string
): Promise<CustomerClaimResult> {
  const { data, error } = await admin.rpc("billing_claim_customer", {
    p_user_id: userId,
  });
  if (error) return { ok: false, reason: "error", message: error.message };
  return asClaim(data);
}

export async function claimCustomerWithRetry(
  admin: AdminClient,
  userId: string,
  attempts = 4,
  delayMs = 400
): Promise<CustomerClaimResult> {
  let last: CustomerClaimResult = { ok: false, reason: "inflight" };
  for (let i = 0; i < attempts; i++) {
    last = await claimCustomer(admin, userId);
    if (last.ok) return last;
    if (last.reason !== "inflight") return last;
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return last;
}

export async function finishCustomer(
  admin: AdminClient,
  userId: string,
  claim: string,
  customerId: string
): Promise<{ ok: true; customer_id: string } | { ok: false; reason: string }> {
  const { data, error } = await admin.rpc("billing_finish_customer", {
    p_user_id: userId,
    p_claim: claim,
    p_customer_id: customerId,
  });
  if (error) return { ok: false, reason: error.message };

  const row = data as {
    ok?: boolean;
    customer_id?: string;
    reason?: string;
  } | null;
  if (!row || row.ok !== true || !row.customer_id) {
    return { ok: false, reason: row?.reason ?? "finish_failed" };
  }
  return { ok: true, customer_id: row.customer_id };
}

export async function releaseCustomerClaim(
  admin: AdminClient,
  userId: string,
  claim: string
): Promise<void> {
  await admin.rpc("billing_release_customer_claim", {
    p_user_id: userId,
    p_claim: claim,
  });
}
