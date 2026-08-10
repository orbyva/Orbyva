/** Planos e acesso (teste → Pro). */

export type PlanId = "free" | "pro";

export const TRIAL_DAYS = 7;

export const PLANS = {
  free: {
    id: "free" as const,
    name: "Teste",
    priceLabel: `${TRIAL_DAYS} dias grátis`,
    blurb: "Tudo liberado para sentir o controle do mês — sem cartão.",
    features: [
      `${TRIAL_DAYS} dias com acesso completo`,
      "Teto de gastos, contas e o saldo do mês",
      "Metas, hábitos, viagens e lugares",
      "Cinema, livros, música, veículos e alertas",
      "Export CSV e exclusão de conta",
    ],
  },
  pro: {
    id: "pro" as const,
    name: "Pro",
    priceLabel: "R$ 19,90/mês",
    blurb: "Controle do mês + vida organizada — sem prazo.",
    features: [
      "Teto, contas, parcelas e saldo sem limite",
      "Vida completa (hábitos, viagens, cinema…)",
      "Alertas, PWA e export CSV",
      "Privacidade (LGPD) e exclusão quando quiser",
      "Novidades do produto primeiro",
    ],
  },
} as const;

export function isProPlan(plan: PlanId | string | null | undefined): boolean {
  return plan === "pro";
}

/** Fim do teste: `trialEndsAt` explícito, senão createdAt + TRIAL_DAYS. */
export function getTrialEndsAt(
  createdAt: string | Date,
  trialEndsAt?: string | Date | null
): Date {
  if (trialEndsAt) {
    return new Date(trialEndsAt);
  }
  const start = new Date(createdAt);
  const ends = new Date(start);
  ends.setDate(ends.getDate() + TRIAL_DAYS);
  return ends;
}

export function isTrialActive(
  createdAt: string | null | undefined,
  now: Date = new Date(),
  trialEndsAt?: string | null
): boolean {
  if (trialEndsAt) {
    return now.getTime() < new Date(trialEndsAt).getTime();
  }
  // Fail-closed: sem data de início conhecida, não libera acesso
  if (!createdAt) return false;
  return now.getTime() < getTrialEndsAt(createdAt).getTime();
}

export function trialDaysRemaining(
  createdAt: string | null | undefined,
  now: Date = new Date(),
  trialEndsAt?: string | null
): number {
  if (!trialEndsAt && !createdAt) return 0;
  const ends = getTrialEndsAt(
    createdAt ?? now.toISOString(),
    trialEndsAt
  );
  const ms = ends.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

/** Pode usar o app: Pro ativo ou ainda no teste. */
export function hasAppAccess(input: {
  plan: PlanId | string | null | undefined;
  createdAt?: string | null;
  trialEndsAt?: string | null;
  subscriptionStatus?: string | null;
}): boolean {
  if (isProPlan(input.plan)) return true;
  if (
    input.subscriptionStatus === "active" ||
    input.subscriptionStatus === "trialing"
  ) {
    return true;
  }
  return isTrialActive(input.createdAt, new Date(), input.trialEndsAt);
}
