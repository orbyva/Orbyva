import { getCurrentUserId } from "@/lib/auth-user";
import {
  isBlockedSubscriptionStatus,
  isEffectivePro,
  isStripeSubscriptionActive,
  planFromSubscriptionStatus,
  type PlanId,
} from "@/lib/plan";
import { supabase } from "@/lib/supabase";

export interface UserProfile {
  id: string;
  plan: PlanId;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  created_at: string;
  trial_ends_at?: string | null;
}

const PROFILE_SELECT =
  "id, plan, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, created_at, trial_ends_at";

function normalizeProfile(profile: UserProfile): UserProfile {
  const status = profile.subscription_status;
  if (isStripeSubscriptionActive(status)) {
    return { ...profile, plan: "pro" };
  }
  if (isBlockedSubscriptionStatus(status)) {
    return { ...profile, plan: "free" };
  }
  return {
    ...profile,
    plan: planFromSubscriptionStatus(
      status,
      profile.plan === "pro" ? "pro" : "free"
    ),
  };
}

export async function ensureProfile(): Promise<UserProfile> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data) return normalizeProfile(data as UserProfile);

  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert({ id: userId, plan: "free" })
    .select(PROFILE_SELECT)
    .single();

  if (insertError) {
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

export async function fetchIsPro(): Promise<boolean> {
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
