import { describe, expect, it } from "vitest";
import {
  BILLING_ERROR_CODES,
  billingErrorMessage,
  CUSTOMER_CLAIM_TTL_MS,
  DEFAULT_CHECKOUT_HOURLY_LIMIT,
  DEFAULT_PORTAL_HOURLY_LIMIT,
  hourlyLimitFor,
  isStripeCustomerId,
  secondsUntilNextUtcHour,
  shouldBlockCheckout,
  stripeIdempotencyKey,
} from "@/lib/billing-guard";

describe("billing-guard", () => {
  it("limites horários padrão e env", () => {
    expect(hourlyLimitFor("checkout", {})).toBe(DEFAULT_CHECKOUT_HOURLY_LIMIT);
    expect(hourlyLimitFor("portal", {})).toBe(DEFAULT_PORTAL_HOURLY_LIMIT);
    expect(
      hourlyLimitFor("checkout", { STRIPE_CHECKOUT_HOURLY_LIMIT: "12" })
    ).toBe(12);
    expect(hourlyLimitFor("portal", { STRIPE_PORTAL_HOURLY_LIMIT: "0" })).toBe(
      0
    );
    expect(
      hourlyLimitFor("checkout", { STRIPE_CHECKOUT_HOURLY_LIMIT: "nope" })
    ).toBe(DEFAULT_CHECKOUT_HOURLY_LIMIT);
  });

  it("bloqueia checkout só com assinatura Stripe ativa", () => {
    expect(shouldBlockCheckout("active")).toBe(true);
    expect(shouldBlockCheckout("trialing")).toBe(true);
    expect(shouldBlockCheckout("past_due")).toBe(false);
    expect(shouldBlockCheckout("canceled")).toBe(false);
    expect(shouldBlockCheckout(null)).toBe(false);
  });

  it("reconhece Customer id real", () => {
    expect(isStripeCustomerId("cus_abc")).toBe(true);
    expect(isStripeCustomerId("pending:x")).toBe(false);
    expect(isStripeCustomerId(null)).toBe(false);
    expect(CUSTOMER_CLAIM_TTL_MS).toBe(60_000);
  });

  it("chaves de idempotência estáveis na hora UTC", () => {
    const now = new Date("2026-09-11T23:10:00.000Z");
    expect(stripeIdempotencyKey("checkout", "user-1", now)).toBe(
      "orbyva-checkout-user-1-2026-09-11T23"
    );
    expect(stripeIdempotencyKey("portal", "user-1", now)).toBe(
      "orbyva-portal-user-1-2026-09-11T23"
    );
    expect(stripeIdempotencyKey("customer", "user-1", now)).toBe(
      "orbyva-customer-user-1"
    );
  });

  it("Retry-After até a próxima hora UTC", () => {
    const now = new Date("2026-09-11T23:59:01.000Z");
    expect(secondsUntilNextUtcHour(now)).toBe(59);
  });

  it("mensagens de erro sem jargão técnico", () => {
    expect(
      billingErrorMessage(BILLING_ERROR_CODES.ALREADY_SUBSCRIBED)
    ).toMatch(/assinatura ativa/i);
    expect(
      billingErrorMessage(BILLING_ERROR_CODES.RATE_LIMITED)
    ).toMatch(/aguarde/i);
    expect(
      billingErrorMessage(BILLING_ERROR_CODES.CHECKOUT_IN_PROGRESS)
    ).toMatch(/instantes/i);
  });
});
