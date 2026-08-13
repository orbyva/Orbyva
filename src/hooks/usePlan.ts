import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ensureProfile, touchLastSeen, type UserProfile } from "@/api/billing";
import { useAuth } from "@/hooks/useAuth";
import {
  accessBlockReason,
  hasAppAccess,
  isEffectivePro,
  isTrialActive,
  trialDaysRemaining,
  type PlanId,
} from "@/lib/plan";
import { maybeTrackRetentionD7 } from "@/lib/retention";
import { maybeRequestWelcomeEmail } from "@/lib/welcomeEmail";

export function usePlan() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasProfileRef = useRef(false);

  const refresh = useCallback(async (opts?: { soft?: boolean }) => {
    if (!userId) {
      hasProfileRef.current = false;
      setProfile(null);
      setLoading(false);
      return;
    }
    // Soft refresh (volta de aba / token), não desmonta o shell/modais
    if (!opts?.soft || !hasProfileRef.current) {
      setLoading(true);
    }
    setError(null);
    try {
      const next = await ensureProfile();
      setProfile(next);
      hasProfileRef.current = true;
      void touchLastSeen();
      maybeRequestWelcomeEmail(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar plano");
      // Não resetar trial com now(), usa created_at do auth se já houver perfil em memória
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
      hasProfileRef.current = true;
    } finally {
      setLoading(false);
    }
  }, [userId, user?.created_at]);

  useEffect(() => {
    void refresh({ soft: hasProfileRef.current });
  }, [refresh]);

  useEffect(() => {
    if (!userId || !profile?.created_at) return;
    maybeTrackRetentionD7(userId, profile.created_at);
  }, [userId, profile?.created_at]);

  const plan: PlanId = profile?.plan ?? "free";
  const createdAt = profile?.created_at ?? null;
  const trialEndsAt = profile?.trial_ends_at ?? null;
  const subscriptionStatus = profile?.subscription_status ?? null;
  const isPro = isEffectivePro({ plan, subscriptionStatus });
  const trialActive = !isPro && isTrialActive(createdAt, new Date(), trialEndsAt);
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
      refresh: () => refresh({ soft: false }),
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
