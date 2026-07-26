/** Planos e acesso (teste → Pro). */

export type PlanId = "free" | "pro";

export const TRIAL_DAYS = 7;

export const PLANS = {
  free: {
    id: "free" as const,
    name: "Teste",
    priceLabel: `${TRIAL_DAYS} dias grátis`,
    blurb: "Acesso completo ao life OS durante o período de teste.",
    features: [
      `${TRIAL_DAYS} dias para explorar tudo`,
      "Livro-caixa, orçamento com teto e parcelas",
      "Metas, hábitos, viagens e lugares",
      "Cinema, veículos, PWA e alertas",
      "Export CSV e exclusão de conta",
    ],
  },
  pro: {
    id: "pro" as const,
    name: "Pro",
    priceLabel: "R$ 19,90/mês",
    blurb: "Continue no controle do mês e do life OS — sem limite de tempo.",
    features: [
      "Orçamento, parcelas e ledger sem prazo",
      "Life OS completo (hábitos, viagens, cinema…)",
      "Export e privacidade (LGPD)",
      "Novidades do produto primeiro",
    ],
  },
} as const;

export function isProPlan(plan: PlanId | string | null | undefined): boolean {
  return plan === "pro";
}

export function getTrialEndsAt(createdAt: string | Date): Date {
  const start = new Date(createdAt);
  const ends = new Date(start);
  ends.setDate(ends.getDate() + TRIAL_DAYS);
  return ends;
}

export function isTrialActive(
  createdAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  // Fail-closed: sem data de início conhecida, não libera acesso
  if (!createdAt) return false;
  return now.getTime() < getTrialEndsAt(createdAt).getTime();
}

export function trialDaysRemaining(
  createdAt: string | null | undefined,
  now: Date = new Date()
): number {
  if (!createdAt) return 0;
  const ms = getTrialEndsAt(createdAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

/** Pode usar o app: Pro ativo ou ainda no teste. */
export function hasAppAccess(input: {
  plan: PlanId | string | null | undefined;
  createdAt?: string | null;
  subscriptionStatus?: string | null;
}): boolean {
  if (isProPlan(input.plan)) return true;
  if (
    input.subscriptionStatus === "active" ||
    input.subscriptionStatus === "trialing"
  ) {
    return true;
  }
  return isTrialActive(input.createdAt);
}
