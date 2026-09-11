/** Regras de trava Stripe (cota, checkout já ativo, chaves de idempotência). */

export const BILLING_ERROR_CODES = {
  RATE_LIMITED: "RATE_LIMITED",
  ALREADY_SUBSCRIBED: "ALREADY_SUBSCRIBED",
  CHECKOUT_IN_PROGRESS: "CHECKOUT_IN_PROGRESS",
} as const;

export type BillingErrorCode =
  (typeof BILLING_ERROR_CODES)[keyof typeof BILLING_ERROR_CODES];

export type BillingKind = "checkout" | "portal";

export const DEFAULT_CHECKOUT_HOURLY_LIMIT = 5;
export const DEFAULT_PORTAL_HOURLY_LIMIT = 8;
export const CUSTOMER_CLAIM_TTL_MS = 60_000;

export function parseEnvInt(
  raw: string | undefined | null,
  fallback: number
): number {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return fallback;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export function hourlyLimitFor(
  kind: BillingKind,
  env: {
    STRIPE_CHECKOUT_HOURLY_LIMIT?: string;
    STRIPE_PORTAL_HOURLY_LIMIT?: string;
  } = {}
): number {
  if (kind === "portal") {
    return parseEnvInt(
      env.STRIPE_PORTAL_HOURLY_LIMIT,
      DEFAULT_PORTAL_HOURLY_LIMIT
    );
  }
  return parseEnvInt(
    env.STRIPE_CHECKOUT_HOURLY_LIMIT,
    DEFAULT_CHECKOUT_HOURLY_LIMIT
  );
}

export function isStripeCustomerId(
  value: string | null | undefined
): boolean {
  return typeof value === "string" && value.startsWith("cus_");
}

export function shouldBlockCheckout(
  subscriptionStatus: string | null | undefined
): boolean {
  return subscriptionStatus === "active" || subscriptionStatus === "trialing";
}

export function billingErrorMessage(code: BillingErrorCode): string {
  if (code === BILLING_ERROR_CODES.ALREADY_SUBSCRIBED) {
    return "Você já tem uma assinatura ativa. Gerencie pelo portal na Conta.";
  }
  if (code === BILLING_ERROR_CODES.CHECKOUT_IN_PROGRESS) {
    return "Já estamos abrindo o checkout. Tente de novo em instantes.";
  }
  return "Aguarde um momento antes de tentar de novo.";
}

export function stripeIdempotencyKey(
  kind: BillingKind | "customer",
  userId: string,
  now: Date = new Date()
): string {
  if (kind === "customer") return `orbyva-customer-${userId}`;
  const hour = now.toISOString().slice(0, 13);
  return `orbyva-${kind}-${userId}-${hour}`;
}

export function secondsUntilNextUtcHour(now: Date = new Date()): number {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours() + 1,
    0,
    0,
    0
  );
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}
