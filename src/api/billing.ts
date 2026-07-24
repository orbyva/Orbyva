import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type { PlanId } from "@/lib/plan";
import { isProPlan } from "@/lib/plan";

export { isBillingConfigured } from "@/lib/billing-config";

export interface UserProfile {
  id: string;
  plan: PlanId;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  created_at: string;
}

const PROFILE_SELECT =
  "id, plan, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, created_at";

/** Só em builds locais explícitos — nunca confiar em prod sem flag de servidor. */
function forceProFromEnv(): boolean {
  return (
    import.meta.env.DEV === true &&
    import.meta.env.VITE_BILLING_FORCE_PRO === "true"
  );
}

function isMissingProfilesTable(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (error.message ?? "").toLowerCase().includes("could not find the table")
  );
}

/**
 * Fallback só se a tabela profiles não existir.
 * Usa auth.users.created_at — sem localStorage (não resetável pelo usuário).
 */
function fallbackProfile(
  userId: string,
  authCreatedAt?: string | null
): UserProfile {
  return {
    id: userId,
    plan: forceProFromEnv() ? "pro" : "free",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: null,
    current_period_end: null,
    created_at: authCreatedAt || "1970-01-01T00:00:00.000Z",
  };
}

export async function ensureProfile(): Promise<UserProfile> {
  const userId = await getCurrentUserId();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingProfilesTable(error)) {
      return fallbackProfile(userId, authUser?.created_at);
    }
    throw new Error(error.message);
  }

  if (data) {
    return normalizeProfile(data as UserProfile);
  }

  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert({ id: userId, plan: "free" })
    .select(PROFILE_SELECT)
    .single();

  if (insertError) {
    if (isMissingProfilesTable(insertError)) {
      return fallbackProfile(userId, authUser?.created_at);
    }
    // Corrida com trigger de signup — tenta ler de novo
    const retry = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", userId)
      .maybeSingle();
    if (retry.data) return normalizeProfile(retry.data as UserProfile);
    throw new Error(insertError.message);
  }

  return normalizeProfile(created as UserProfile);
}

function normalizeProfile(profile: UserProfile): UserProfile {
  if (forceProFromEnv()) {
    return { ...profile, plan: "pro" };
  }
  const status = profile.subscription_status;
  const active =
    profile.plan === "pro" ||
    status === "active" ||
    status === "trialing";
  return {
    ...profile,
    plan: active ? "pro" : "free",
    created_at: profile.created_at,
  };
}

export async function fetchIsPro(): Promise<boolean> {
  if (forceProFromEnv()) return true;
  try {
    const profile = await ensureProfile();
    return isProPlan(profile.plan);
  } catch {
    return false;
  }
}

async function invokeBillingUrl(
  fn: "stripe-checkout" | "stripe-portal",
  fallback: string
): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke(fn, { body: {} });

  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      try {
        const body = (await ctx.clone().json()) as { error?: string };
        if (body?.error) detail = body.error;
      } catch {
        /* ignore parse errors */
      }
    }
    if (
      data &&
      typeof data === "object" &&
      "error" in data &&
      (data as { error?: unknown }).error
    ) {
      detail = String((data as { error: unknown }).error);
    }
    throw new Error(detail);
  }

  if (!data?.url) throw new Error(data?.error ?? fallback);
  return { url: String(data.url) };
}

export async function createCheckoutSession(): Promise<{ url: string }> {
  // URLs de retorno ficam no edge (SITE_URL) — não envia origin do cliente
  return invokeBillingUrl("stripe-checkout", "Checkout indisponível");
}

export async function createPortalSession(): Promise<{ url: string }> {
  return invokeBillingUrl("stripe-portal", "Portal indisponível");
}
