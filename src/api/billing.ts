import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type { PlanId } from "@/lib/plan";
import {
  isBlockedSubscriptionStatus,
  isEffectivePro,
  isStripeSubscriptionActive,
  planFromSubscriptionStatus,
} from "@/lib/plan";

export { isBillingConfigured } from "@/lib/billing-config";

export interface UserProfile {
  id: string;
  plan: PlanId;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  created_at: string;
  trial_ends_at?: string | null;
  email_unsubscribed_at?: string | null;
  email_digest_enabled?: boolean;
  email_alerts_enabled?: boolean;
  email_habit_reminder_enabled?: boolean;
  welcome_email_sent_at?: string | null;
}

const PROFILE_SELECT =
  "id, plan, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, created_at, trial_ends_at, email_unsubscribed_at, email_digest_enabled, email_alerts_enabled, email_habit_reminder_enabled, welcome_email_sent_at";

const LAST_SEEN_CLIENT_KEY = "orbyva_last_seen_touch_v1";

/**
 * Heartbeat de retenção, atualiza `profiles.last_seen_at` (RPC, throttle 30 min no DB).
 * No client, no máximo 1 chamada / hora por aba (evita spam em HMR / focus).
 */
export async function touchLastSeen(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const prev = sessionStorage.getItem(LAST_SEEN_CLIENT_KEY);
    if (prev) {
      const ts = Number(prev);
      if (Number.isFinite(ts) && Date.now() - ts < 60 * 60 * 1000) return;
    }
  } catch {
    /* ignore */
  }

  const { error } = await supabase.rpc("touch_last_seen");
  if (error) {
    // Migration ainda não aplicada, silencioso
    if (
      error.code === "PGRST202" ||
      (error.message ?? "").toLowerCase().includes("could not find the function")
    ) {
      return;
    }
    if (import.meta.env.DEV) {
      console.warn("[touchLastSeen]", error.message);
    }
    return;
  }

  try {
    sessionStorage.setItem(LAST_SEEN_CLIENT_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}
/** Só em builds locais explícitos, nunca confiar em prod sem flag de servidor. */
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
 * Usa auth.users.created_at, sem localStorage (não resetável pelo usuário).
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
    // Migration email_lifecycle / trial_ends_at ainda não aplicada, lê colunas base.
    if (
      (error.message ?? "").toLowerCase().includes("email_") ||
      (error.message ?? "").toLowerCase().includes("trial_ends_at")
    ) {
      const legacy = await supabase
        .from("profiles")
        .select(
          "id, plan, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, created_at"
        )
        .eq("id", userId)
        .maybeSingle();
      if (legacy.error) throw new Error(legacy.error.message);
      if (legacy.data) return normalizeProfile(legacy.data as UserProfile);
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
    // Corrida com trigger de signup, tenta ler de novo
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
  if (isStripeSubscriptionActive(status)) {
    return { ...profile, plan: "pro" };
  }
  if (isBlockedSubscriptionStatus(status)) {
    return { ...profile, plan: "free" };
  }
  return {
    ...profile,
    plan: planFromSubscriptionStatus(status, profile.plan === "pro" ? "pro" : "free"),
  };
}

export async function fetchIsPro(): Promise<boolean> {
  if (forceProFromEnv()) return true;
  try {
    const profile = await ensureProfile();
    return isEffectivePro({
      plan: profile.plan,
      subscriptionStatus: profile.subscription_status,
    });
  } catch {
    return false;
  }
}

type BillingFnBody = { url?: string; error?: string; code?: string };

async function invokeBillingUrl(
  fn: "stripe-checkout" | "stripe-portal",
  fallback: string
): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke(fn, { body: {} });
  const payload = data as BillingFnBody | null;

  if (error) {
    let detail = error.message;
    let code: string | undefined;
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      try {
        const body = (await ctx.clone().json()) as BillingFnBody;
        if (body?.error) detail = body.error;
        if (body?.code) code = body.code;
      } catch {
        /* ignore parse errors */
      }
    }
    if (payload?.error) detail = String(payload.error);
    if (payload?.code) code = payload.code;
    const err = new Error(detail) as Error & { code?: string };
    if (code) err.code = code;
    throw err;
  }

  if (!payload?.url) {
    const err = new Error(payload?.error ?? fallback) as Error & { code?: string };
    if (payload?.code) err.code = payload.code;
    throw err;
  }
  return { url: String(payload.url) };
}

export async function createCheckoutSession(): Promise<{ url: string }> {
  // URLs de retorno ficam no edge (SITE_URL), não envia origin do cliente
  return invokeBillingUrl("stripe-checkout", "Checkout indisponível");
}

export async function createPortalSession(): Promise<{ url: string }> {
  return invokeBillingUrl("stripe-portal", "Portal indisponível");
}

export type EmailPrefsPatch = {
  email_digest_enabled?: boolean;
  email_alerts_enabled?: boolean;
  email_habit_reminder_enabled?: boolean;
  /** true = opt-out global de produto */
  unsubscribed?: boolean;
};

export type EmailPrefsState = {
  email_digest_enabled: boolean;
  email_alerts_enabled: boolean;
  email_habit_reminder_enabled: boolean;
  email_unsubscribed_at: string | null;
};

/** Estado otimista da tela: o que o perfil vira se o patch for gravado. */
export function applyEmailPrefsPatch<T extends Partial<EmailPrefsState>>(
  profile: T,
  patch: EmailPrefsPatch
): T {
  const next = { ...profile };
  if (patch.email_digest_enabled !== undefined) {
    next.email_digest_enabled = patch.email_digest_enabled;
  }
  if (patch.email_alerts_enabled !== undefined) {
    next.email_alerts_enabled = patch.email_alerts_enabled;
  }
  if (patch.email_habit_reminder_enabled !== undefined) {
    next.email_habit_reminder_enabled = patch.email_habit_reminder_enabled;
  }
  if (patch.unsubscribed !== undefined) {
    next.email_unsubscribed_at = patch.unsubscribed
      ? (profile.email_unsubscribed_at ?? new Date().toISOString())
      : null;
  }
  return next;
}

const EMAIL_PREFS_NOT_SAVED = "A preferência não foi gravada. Tente de novo.";

/**
 * `profiles` não tem policy de UPDATE para `authenticated` (billing fechado de propósito), então a
 * escrita passa pela RPC `update_email_prefs`. Ela devolve o estado gravado e ele é conferido contra
 * o pedido: update que não casa linha volta `error: null`, e isso não pode virar "salvo".
 */
export async function updateEmailPrefs(
  patch: EmailPrefsPatch
): Promise<EmailPrefsState> {
  const { data, error } = await supabase.rpc("update_email_prefs", {
    p_digest: patch.email_digest_enabled ?? null,
    p_alerts: patch.email_alerts_enabled ?? null,
    p_habit_reminder: patch.email_habit_reminder_enabled ?? null,
    p_unsubscribed: patch.unsubscribed ?? null,
  });
  if (error) throw new Error(error.message);

  const row = (Array.isArray(data) ? data[0] : data) as EmailPrefsState | undefined;
  if (!row) throw new Error(EMAIL_PREFS_NOT_SAVED);

  const mismatch =
    (patch.email_digest_enabled !== undefined &&
      row.email_digest_enabled !== patch.email_digest_enabled) ||
    (patch.email_alerts_enabled !== undefined &&
      row.email_alerts_enabled !== patch.email_alerts_enabled) ||
    (patch.email_habit_reminder_enabled !== undefined &&
      row.email_habit_reminder_enabled !== patch.email_habit_reminder_enabled) ||
    (patch.unsubscribed !== undefined &&
      Boolean(row.email_unsubscribed_at) !== patch.unsubscribed);
  if (mismatch) throw new Error(EMAIL_PREFS_NOT_SAVED);

  return row;
}
