import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type { PlanId } from "@/lib/plan";
import { isProPlan } from "@/lib/plan";

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

function forceProFromEnv(): boolean {
  return import.meta.env.VITE_BILLING_FORCE_PRO === "true";
}

function trialStartStorageKey(userId: string) {
  return `fintrack_trial_start_v1:${userId}`;
}

/**
 * Quando `profiles` ainda não existe no banco, NÃO usar `now()` a cada load
 * (isso resetava o teste de 7 dias). Persistimos o início em localStorage
 * (e preferimos auth.users.created_at quando disponível).
 */
export function resolveFallbackTrialStart(
  userId: string,
  authCreatedAt?: string | null
): string {
  if (typeof localStorage !== "undefined") {
    try {
      const stored = localStorage.getItem(trialStartStorageKey(userId));
      if (stored) return stored;

      const start = authCreatedAt || new Date().toISOString();
      localStorage.setItem(trialStartStorageKey(userId), start);
      return start;
    } catch {
      // ignore quota / private mode
    }
  }
  return authCreatedAt || new Date().toISOString();
}

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
    created_at: resolveFallbackTrialStart(userId, authCreatedAt),
  };
}

function isMissingProfilesTable(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (error.message ?? "").toLowerCase().includes("profiles")
  );
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
    created_at: profile.created_at || new Date().toISOString(),
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

export async function createCheckoutSession(): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke("stripe-checkout", {
    body: {
      successUrl: `${window.location.origin}/account?checkout=success`,
      cancelUrl: `${window.location.origin}/account?checkout=cancel`,
    },
  });

  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error(data?.error ?? "Checkout indisponível");
  return { url: String(data.url) };
}

export async function createPortalSession(): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke("stripe-portal", {
    body: {
      returnUrl: `${window.location.origin}/account`,
    },
  });

  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error(data?.error ?? "Portal indisponível");
  return { url: String(data.url) };
}

export function isBillingConfigured(): boolean {
  return Boolean(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
}
