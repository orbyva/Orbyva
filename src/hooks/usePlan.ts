import { useCallback, useEffect, useMemo, useState } from "react";
import { ensureProfile, type UserProfile } from "@/api/billing";
import { useAuth } from "@/hooks/useAuth";
import {
  hasAppAccess,
  isProPlan,
  isTrialActive,
  trialDaysRemaining,
  type PlanId,
} from "@/lib/plan";

export function usePlan() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
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
      setProfile({
        id: user.id,
        plan: "free",
        stripe_customer_id: null,
        stripe_subscription_id: null,
        subscription_status: null,
        current_period_end: null,
        created_at: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const plan: PlanId = profile?.plan ?? "free";
  const createdAt = profile?.created_at ?? null;
  const isPro = isProPlan(plan);
  const trialActive = !isPro && isTrialActive(createdAt);
  const daysLeft = isPro ? 0 : trialDaysRemaining(createdAt);
  const canUseApp = hasAppAccess({ plan, createdAt });

  return useMemo(
    () => ({
      profile,
      plan,
      isPro,
      isTrialActive: trialActive,
      trialDaysLeft: daysLeft,
      hasAccess: canUseApp,
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
      loading,
      error,
      refresh,
    ]
  );
}
