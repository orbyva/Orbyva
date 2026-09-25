import { useCallback, useEffect, useMemo, useState } from "react";

import { ensureProfile, type UserProfile } from "@/api/billing";
import { useAuth } from "@/hooks/use-auth";
import {
  accessBlockReason,
  hasAppAccess,
  isEffectivePro,
  isTrialActive,
  trialDaysRemaining,
  type PlanId,
} from "@/lib/plan";

export function usePlan() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await ensureProfile();
      setProfile(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar plano");
      setProfile((prev) => {
        if (prev) return prev;
        return {
          id: userId,
          plan: "free",
          stripe_customer_id: null,
          stripe_subscription_id: null,
          subscription_status: null,
          current_period_end: null,
          created_at: user?.created_at ?? "1970-01-01T00:00:00.000Z",
        };
      });
    } finally {
      setLoading(false);
    }
  }, [userId, user?.created_at]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const plan: PlanId = profile?.plan ?? "free";
  const createdAt = profile?.created_at ?? null;
  const trialEndsAt = profile?.trial_ends_at ?? null;
  const subscriptionStatus = profile?.subscription_status ?? null;
  const isPro = isEffectivePro({ plan, subscriptionStatus });
  const trialActive =
    !isPro && isTrialActive(createdAt, new Date(), trialEndsAt);
  const daysLeft = isPro
    ? 0
    : trialDaysRemaining(createdAt, new Date(), trialEndsAt);
  const canUseApp = hasAppAccess({
    plan,
    createdAt,
    trialEndsAt,
    subscriptionStatus,
  });
  const blockReason = accessBlockReason({
    plan,
    createdAt,
    trialEndsAt,
    subscriptionStatus,
  });

  return useMemo(
    () => ({
      profile,
      plan,
      isPro,
      isTrialActive: trialActive,
      trialDaysLeft: daysLeft,
      hasAccess: canUseApp,
      accessBlockReason: blockReason,
      subscriptionStatus,
      loading,
      error,
      refresh,
    }),
    [
      profile,
      plan,
      isPro,
      trialActive,
      daysLeft,
      canUseApp,
      blockReason,
      subscriptionStatus,
      loading,
      error,
      refresh,
    ]
  );
}
