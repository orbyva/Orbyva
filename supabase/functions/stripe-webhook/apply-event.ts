/**
 * Cópia Deno da lógica em src/lib/stripe-webhook-apply.ts.
 * Manter alinhada aos testes Vitest desse módulo.
 */
export type ProfileBillingPatch = {
  plan: "free" | "pro";
  stripe_customer_id?: string;
  stripe_subscription_id?: string | null;
  subscription_status?: string | null;
  current_period_end?: string | null;
};

export type StripeWebhookApplyResult =
  | { action: "noop" }
  | {
      action: "upsert";
      userId: string;
      patch: ProfileBillingPatch;
      notify?: "payment_failed" | "pro_welcome" | "cancel_winback";
    }
  | {
      action: "upsert_by_customer";
      customerId: string;
      patch: ProfileBillingPatch;
      notify?: "payment_failed" | "pro_welcome" | "cancel_winback";
    };

type CheckoutSessionLike = {
  mode?: string | null;
  client_reference_id?: string | null;
  customer?: string | { id?: string } | null;
  subscription?: string | { id?: string } | null;
  metadata?: Record<string, string> | null;
};

type SubscriptionLike = {
  id: string;
  status: string;
  customer?: string | { id?: string } | null;
  current_period_end?: number | null;
  metadata?: Record<string, string> | null;
};

function customerIdOf(
  customer: string | { id?: string } | null | undefined
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return customer.id ?? null;
}

function subscriptionIdOf(
  subscription: string | { id?: string } | null | undefined
): string | null {
  if (!subscription) return null;
  if (typeof subscription === "string") return subscription;
  return subscription.id ?? null;
}

function patchFromSubscription(sub: SubscriptionLike): ProfileBillingPatch {
  const active = sub.status === "active" || sub.status === "trialing";
  return {
    plan: active ? "pro" : "free",
    stripe_customer_id: customerIdOf(sub.customer) ?? undefined,
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
  };
}

export function applyStripeWebhookEvent(event: {
  type: string;
  data: { object: unknown };
}): StripeWebhookApplyResult {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as CheckoutSessionLike;
      const userId =
        session.client_reference_id ||
        session.metadata?.supabase_user_id ||
        null;
      if (!userId || session.mode !== "subscription") {
        return { action: "noop" };
      }
      const customer = customerIdOf(session.customer);
      return {
        action: "upsert",
        userId,
        patch: {
          plan: "pro",
          stripe_customer_id: customer ?? undefined,
          stripe_subscription_id: subscriptionIdOf(session.subscription),
          subscription_status: "active",
        },
        notify: "pro_welcome",
      };
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as SubscriptionLike;
      const patch = patchFromSubscription(sub);
      const canceled =
        event.type === "customer.subscription.deleted" ||
        sub.status === "canceled";
      const notify = canceled ? ("cancel_winback" as const) : undefined;
      const userId = sub.metadata?.supabase_user_id;
      if (userId) {
        return { action: "upsert", userId, patch, notify };
      }
      const customerId = customerIdOf(sub.customer);
      if (!customerId) return { action: "noop" };
      return { action: "upsert_by_customer", customerId, patch, notify };
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as {
        customer?: string | { id?: string } | null;
        subscription?: string | { id?: string } | null;
      };
      const customerId = customerIdOf(invoice.customer);
      if (!customerId) return { action: "noop" };
      return {
        action: "upsert_by_customer",
        customerId,
        patch: {
          plan: "pro",
          subscription_status: "past_due",
          stripe_subscription_id: subscriptionIdOf(invoice.subscription),
        },
        notify: "payment_failed",
      };
    }
    default:
      return { action: "noop" };
  }
}
