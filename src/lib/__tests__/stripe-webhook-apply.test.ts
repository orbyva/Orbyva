import { describe, expect, it } from "vitest";
import { applyStripeWebhookEvent } from "@/lib/stripe-webhook-apply";

describe("applyStripeWebhookEvent", () => {
  it("checkout.session.completed → pro upsert", () => {
    const result = applyStripeWebhookEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "user-1",
          customer: "cus_1",
          subscription: "sub_1",
          metadata: {},
        },
      },
    });
    expect(result).toEqual({
      action: "upsert",
      userId: "user-1",
      notify: "pro_welcome",
      patch: {
        plan: "pro",
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_1",
        subscription_status: "active",
      },
    });
  });

  it("checkout payment mode → noop", () => {
    expect(
      applyStripeWebhookEvent({
        type: "checkout.session.completed",
        data: {
          object: {
            mode: "payment",
            client_reference_id: "user-1",
            customer: "cus_1",
          },
        },
      })
    ).toEqual({ action: "noop" });
  });

  it("subscription.updated com metadata → upsert", () => {
    const result = applyStripeWebhookEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_2",
          status: "active",
          customer: "cus_2",
          current_period_end: 1_800_000_000,
          metadata: { supabase_user_id: "user-2" },
        },
      },
    });
    expect(result.action).toBe("upsert");
    if (result.action !== "upsert") return;
    expect(result.userId).toBe("user-2");
    expect(result.patch.plan).toBe("pro");
    expect(result.patch.subscription_status).toBe("active");
    expect(result.patch.current_period_end).toBe(
      new Date(1_800_000_000 * 1000).toISOString()
    );
  });

  it("subscription.deleted sem metadata → lookup por customer + winback", () => {
    const result = applyStripeWebhookEvent({
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_3",
          status: "canceled",
          customer: "cus_3",
          metadata: {},
        },
      },
    });
    expect(result).toEqual({
      action: "upsert_by_customer",
      customerId: "cus_3",
      notify: "cancel_winback",
      patch: {
        plan: "free",
        stripe_customer_id: "cus_3",
        stripe_subscription_id: "sub_3",
        subscription_status: "canceled",
        current_period_end: null,
      },
    });
  });

  it("invoice.payment_failed → free + past_due + notify", () => {
    const result = applyStripeWebhookEvent({
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_9",
          subscription: "sub_9",
        },
      },
    });
    expect(result).toEqual({
      action: "upsert_by_customer",
      customerId: "cus_9",
      notify: "payment_failed",
      patch: {
        plan: "free",
        subscription_status: "past_due",
        stripe_subscription_id: "sub_9",
      },
    });
  });

  it("invoice.paid → pro + active", () => {
    const result = applyStripeWebhookEvent({
      type: "invoice.paid",
      data: {
        object: {
          customer: "cus_10",
          subscription: "sub_10",
          status: "paid",
        },
      },
    });
    expect(result).toEqual({
      action: "upsert_by_customer",
      customerId: "cus_10",
      patch: {
        plan: "pro",
        subscription_status: "active",
        stripe_subscription_id: "sub_10",
      },
    });
  });

  it("subscription.updated past_due → free", () => {
    const result = applyStripeWebhookEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_pd",
          status: "past_due",
          customer: "cus_pd",
          metadata: { supabase_user_id: "user-pd" },
        },
      },
    });
    expect(result.action).toBe("upsert");
    if (result.action !== "upsert") return;
    expect(result.patch.plan).toBe("free");
    expect(result.patch.subscription_status).toBe("past_due");
  });

  it("evento desconhecido → noop", () => {
    expect(
      applyStripeWebhookEvent({
        type: "charge.succeeded",
        data: { object: {} },
      })
    ).toEqual({ action: "noop" });
  });
});
