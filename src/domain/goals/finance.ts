import type { PersonalGoal } from "@/types/goals";
import { formatGoalProgress, getGoalProgress } from "@/domain/goals";
import { formatBRL } from "@/lib/currency";

export type GoalFinanceInsight = {
  remaining: number;
  progress: number;
  label: string;
  suggestion: string;
  /** Meses restantes até o prazo (ceil de dias/30). null = sem prazo. */
  monthsRemaining: number | null;
  /** Quanto guardar por mês para bater a meta no prazo. null se não aplicável. */
  monthlyTarget: number | null;
  monthlyLabel: string | null;
};

export type GoalSurplusStatus =
  | "done"
  | "no_surplus"
  | "short"
  | "exact"
  | "comfortable";

/** Como o saldo do mês (receita − despesa) se encaixa no aporte da meta. */
export type GoalSurplusFit = {
  surplus: number;
  remaining: number;
  monthlyTarget: number | null;
  /** Quanto do saldo aplicar na meta agora (≤ saldo, ≤ aporte, ≤ falta). */
  applyAmount: number;
  /** saldo / aporte do mês; null se não há aporte. */
  coverageRatio: number | null;
  headroom: number;
  status: GoalSurplusStatus;
  summary: string;
};

/** Prefixo legado — só para import/sync de lançamentos antigos. */
export function goalAporteDescription(title: string): string {
  return `Aporte meta: ${title.trim()}`;
}

/** Descrição do lançamento: `Meta - {título}`. */
export function goalMetaDescription(title: string): string {
  return `Meta - ${title.trim()}`;
}

/** Classe sob a categoria Meta: só o título (ex.: Viajar). */
export function goalClassName(title: string): string {
  return title.trim();
}

/** @deprecated use goalMetaDescription — era o nome da classe. */
export function goalMetaClassName(title: string): string {
  return goalMetaDescription(title);
}

export function matchesGoalAporte(
  description: string | null | undefined,
  title: string
): boolean {
  if (!description) return false;
  const d = description.trim().toLowerCase();
  const legacy = goalAporteDescription(title).toLowerCase();
  const meta = goalMetaDescription(title).toLowerCase();
  return d.startsWith(legacy) || d === meta || d.startsWith(`${meta} `);
}

export function matchesGoalMetaClass(
  className: string | null | undefined,
  title: string
): boolean {
  if (!className) return false;
  const c = className.trim().toLowerCase();
  const t = title.trim().toLowerCase();
  // Novo: classe = título. Legado: classe = `Meta - título`.
  return c === t || c === goalMetaDescription(title).toLowerCase();
}

function rowClassName(
  cls:
    | { name?: string | null }
    | { name?: string | null }[]
    | null
    | undefined
): string | null {
  if (!cls) return null;
  const one = Array.isArray(cls) ? cls[0] : cls;
  return one?.name ?? null;
}

/** Soma lançamentos com descrição/classe de aporte da meta. */
export function sumAporteProgress(
  rows: {
    description?: string | null;
    value?: number | null;
    class?:
      | { name?: string | null }
      | { name?: string | null }[]
      | null;
  }[],
  title: string
): number {
  return rows.reduce((sum, row) => {
    const className = rowClassName(row.class);
    if (
      !matchesGoalAporte(row.description, title) &&
      !matchesGoalMetaClass(className, title)
    ) {
      return sum;
    }
    return sum + Math.abs(Number(row.value) || 0);
  }, 0);
}

/**
 * Progresso após sync: usa a soma do ledger; se não houver aportes,
 * mantém o valor atual (não zera a meta).
 */
export function resolveSyncedGoalProgress(
  currentValue: number,
  ledgerSum: number,
  targetValue: number
): { next: number; changed: boolean; foundLedger: boolean } {
  const target = Math.max(0, targetValue);
  const current = Math.max(0, currentValue);
  if (ledgerSum <= 0) {
    return { next: current, changed: false, foundLedger: false };
  }
  const next = Math.min(target, Math.round(ledgerSum * 100) / 100);
  return {
    next,
    changed: Math.abs(next - current) >= 0.005,
    foundLedger: true,
  };
}

/** Meses a guardar: pelo menos 1 se ainda há dias; 0 se o prazo já passou. */
export function monthsUntilDeadline(
  deadline: string | null | undefined,
  from = new Date()
): number | null {
  if (!deadline) return null;
  const end = new Date(`${deadline}T12:00:00`);
  if (Number.isNaN(end.getTime())) return null;
  const start = new Date(from);
  start.setHours(12, 0, 0, 0);
  const days = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
  if (days <= 0) return 0;
  return Math.max(1, Math.ceil(days / 30));
}

function formatAmount(value: number, isMoney: boolean, unit: string): string {
  if (isMoney) return formatBRL(value);
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return unit ? `${rounded} ${unit}` : rounded;
}

function isMoneyGoal(goal: PersonalGoal): boolean {
  const unit = goal.unit?.toLowerCase() ?? "";
  return (
    !unit ||
    unit.includes("r$") ||
    unit.includes("real") ||
    unit.includes("reais") ||
    unit === "brl"
  );
}

/** Insight base da meta financeira (aporte/mês pelo prazo). */
export function getFinancialGoalInsight(
  goal: PersonalGoal,
  from = new Date()
): GoalFinanceInsight | null {
  if (goal.category !== "financial") return null;

  const progress = getGoalProgress(goal);
  const remaining = Math.max(0, goal.target_value - goal.current_value);
  const money = isMoneyGoal(goal);

  const monthsRemaining = monthsUntilDeadline(goal.deadline, from);
  let monthlyTarget: number | null = null;
  let monthlyLabel: string | null = null;

  if (remaining <= 0) {
    monthlyTarget = 0;
    monthlyLabel = null;
  } else if (monthsRemaining === null) {
    monthlyLabel =
      "Defina um prazo para calcular quanto o saldo do mês precisa cobrir.";
  } else if (monthsRemaining === 0) {
    monthlyLabel = `Prazo encerrado — ainda faltam ${formatAmount(remaining, money, goal.unit ?? "")}.`;
  } else {
    monthlyTarget = remaining / monthsRemaining;
    monthlyLabel = money
      ? `Para o prazo: ${formatBRL(monthlyTarget)}/mês por ${monthsRemaining} mês${monthsRemaining === 1 ? "" : "es"} — pago com o saldo dos lançamentos, sem virar despesa.`
      : `Avance ${formatAmount(monthlyTarget, false, goal.unit ?? "")}/mês por ${monthsRemaining} mês${monthsRemaining === 1 ? "" : "es"}.`;
  }

  return {
    remaining,
    progress,
    label: formatGoalProgress(goal),
    monthsRemaining,
    monthlyTarget,
    monthlyLabel,
    suggestion:
      remaining <= 0
        ? "Meta financeira concluída."
        : money
          ? `Faltam ${formatBRL(remaining)}. Use o saldo do mês (receita − despesa) para avançar — sem lançar gasto.`
          : `Faltam ${remaining}${goal.unit ? ` ${goal.unit}` : ""}. Atualize o progresso na meta.`,
  };
}

/**
 * Cruza o saldo do mês com o aporte sugerido da meta.
 * `surplus` = receita − despesa do período (pode ser negativo).
 */
export function evaluateGoalAgainstSurplus(
  goal: PersonalGoal,
  surplus: number,
  from = new Date()
): GoalSurplusFit | null {
  if (goal.category !== "financial") return null;
  if (!isMoneyGoal(goal)) return null;

  const insight = getFinancialGoalInsight(goal, from);
  if (!insight) return null;

  const remaining = insight.remaining;
  const monthlyTarget =
    insight.monthlyTarget != null && insight.monthlyTarget > 0
      ? insight.monthlyTarget
      : remaining > 0
        ? remaining
        : null;

  if (remaining <= 0) {
    return {
      surplus,
      remaining: 0,
      monthlyTarget: 0,
      applyAmount: 0,
      coverageRatio: null,
      headroom: surplus,
      status: "done",
      summary: "Meta concluída — o saldo do mês fica livre.",
    };
  }

  if (surplus <= 0) {
    return {
      surplus,
      remaining,
      monthlyTarget,
      applyAmount: 0,
      coverageRatio: monthlyTarget ? 0 : null,
      headroom: surplus,
      status: "no_surplus",
      summary:
        "Mês sem saldo positivo (despesa ≥ receita). Ajuste o teto antes de avançar a meta.",
    };
  }

  const target = monthlyTarget ?? remaining;
  const applyAmount =
    Math.round(Math.min(surplus, target, remaining) * 100) / 100;
  const coverageRatio = target > 0 ? surplus / target : null;
  const headroom = Math.round((surplus - target) * 100) / 100;

  if (coverageRatio != null && coverageRatio < 1) {
    const short = Math.round((target - surplus) * 100) / 100;
    return {
      surplus,
      remaining,
      monthlyTarget,
      applyAmount,
      coverageRatio,
      headroom,
      status: "short",
      summary: `Saldo do mês: ${formatBRL(surplus)}. Cobre ${Math.round(coverageRatio * 100)}% do aporte (${formatBRL(target)}); faltam ${formatBRL(short)}.`,
    };
  }

  if (Math.abs(headroom) < 0.005) {
    return {
      surplus,
      remaining,
      monthlyTarget,
      applyAmount,
      coverageRatio,
      headroom: 0,
      status: "exact",
      summary: `Saldo do mês: ${formatBRL(surplus)} — fecha o aporte do mês na meta.`,
    };
  }

  return {
    surplus,
    remaining,
    monthlyTarget,
    applyAmount,
    coverageRatio,
    headroom,
    status: "comfortable",
    summary: `Saldo do mês: ${formatBRL(surplus)}; o aporte de ${formatBRL(target)} cabe com sobra de ${formatBRL(headroom)}.`,
  };
}

/** Teto do aporte avulso: não passa da falta nem do saldo (se houver). */
export function maxGoalApplyAmount(
  remaining: number,
  surplus: number | null | undefined
): number {
  const rem = Math.max(0, remaining);
  if (surplus == null || Number.isNaN(surplus) || surplus <= 0) {
    return Math.round(rem * 100) / 100;
  }
  return Math.round(Math.min(rem, surplus) * 100) / 100;
}

/** Normaliza valor digitado para o intervalo [0, max]. */
export function clampGoalApplyAmount(
  amount: number,
  remaining: number,
  surplus: number | null | undefined
): number {
  const max = maxGoalApplyAmount(remaining, surplus);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(Math.min(amount, max) * 100) / 100;
}

export type GoalApplyPreset = {
  id: "suggested" | "monthly" | "half_surplus" | "full_surplus";
  label: string;
  amount: number;
};

/** Atalhos de valor no dialog “Destinar à meta”. */
export function goalApplyPresets(
  fit: GoalSurplusFit
): GoalApplyPreset[] {
  const max = maxGoalApplyAmount(fit.remaining, fit.surplus);
  if (max <= 0) return [];

  const presets: GoalApplyPreset[] = [];
  const push = (preset: GoalApplyPreset) => {
    const amount = clampGoalApplyAmount(preset.amount, fit.remaining, fit.surplus);
    if (amount <= 0) return;
    if (presets.some((p) => Math.abs(p.amount - amount) < 0.005)) return;
    presets.push({ ...preset, amount });
  };

  if (fit.applyAmount > 0) {
    push({ id: "suggested", label: "Sugestão", amount: fit.applyAmount });
  }
  if (fit.monthlyTarget != null && fit.monthlyTarget > 0) {
    push({ id: "monthly", label: "Aporte do mês", amount: fit.monthlyTarget });
  }
  if (fit.surplus > 0) {
    push({
      id: "half_surplus",
      label: "Metade do saldo",
      amount: fit.surplus / 2,
    });
    push({
      id: "full_surplus",
      label: "Todo o saldo",
      amount: fit.surplus,
    });
  }

  return presets;
}

/** Quantas parcelas cobrem a falta com um aporte mensal dado. */
export function installmentsToCoverRemaining(
  remaining: number,
  monthlyAmount: number
): number {
  const rem = Math.max(0, remaining);
  const monthly = Math.max(0, monthlyAmount);
  if (rem <= 0 || monthly <= 0) return 0;
  return Math.max(1, Math.ceil(rem / monthly - 1e-9));
}

/** Aporte mensal para cobrir a falta em N parcelas. */
export function monthlyAmountForInstallments(
  remaining: number,
  installments: number
): number {
  const rem = Math.max(0, remaining);
  const n = Math.max(1, Math.floor(installments));
  if (rem <= 0) return 0;
  return Math.round((rem / n) * 100) / 100;
}

export type GoalInstallmentDraft = {
  monthlyAmount: number;
  installments: number;
  total: number;
  remaining: number;
  coversGoal: boolean;
  summary: string;
};

/** Plano editável da rotina (com ou sem prazo). */
export function buildGoalInstallmentDraft(
  remaining: number,
  monthlyAmount: number,
  installments: number
): GoalInstallmentDraft {
  const rem = Math.max(0, remaining);
  const monthly = Math.max(0, Math.round(monthlyAmount * 100) / 100);
  const n = Math.max(0, Math.floor(installments));
  const total = Math.round(monthly * n * 100) / 100;
  const coversGoal = rem <= 0 || total + 0.005 >= rem;
  let summary = "";
  if (monthly <= 0 || n <= 0) {
    summary = "Informe o valor mensal e a quantidade de parcelas.";
  } else if (coversGoal) {
    summary = `${formatBRL(monthly)} × ${n} = ${formatBRL(total)} — cobre a falta da meta.`;
  } else {
    const short = Math.round((rem - total) * 100) / 100;
    summary = `${formatBRL(monthly)} × ${n} = ${formatBRL(total)} — ainda faltam ${formatBRL(short)} depois do plano.`;
  }
  return {
    monthlyAmount: monthly,
    installments: n,
    total,
    remaining: rem,
    coversGoal,
    summary,
  };
}

/** Valores iniciais do dialog de rotina. */
export function initialGoalInstallmentFields(
  goal: PersonalGoal,
  from = new Date()
): { monthlyAmount: number; installments: number } {
  const insight = getFinancialGoalInsight(goal, from);
  const remaining = insight?.remaining ?? Math.max(0, goal.target_value - goal.current_value);

  if (
    insight?.monthlyTarget != null &&
    insight.monthlyTarget > 0 &&
    insight.monthsRemaining != null &&
    insight.monthsRemaining > 0
  ) {
    return {
      monthlyAmount: Math.round(insight.monthlyTarget * 100) / 100,
      installments: insight.monthsRemaining,
    };
  }

  if (remaining <= 0) {
    return { monthlyAmount: 0, installments: 0 };
  }

  // Sem prazo: sugere 12 meses cobrindo a falta.
  const installments = 12;
  return {
    monthlyAmount: monthlyAmountForInstallments(remaining, installments),
    installments,
  };
}

/** Escolhe a meta financeira ativa que mais “precisa” do saldo (maior aporte/mês). */
export function pickPrimarySurplusGoal(
  goals: PersonalGoal[],
  surplus: number,
  from = new Date()
): { goal: PersonalGoal; fit: GoalSurplusFit } | null {
  const active = goals.filter(
    (g) => g.status === "active" && g.category === "financial"
  );
  let best: { goal: PersonalGoal; fit: GoalSurplusFit } | null = null;

  for (const goal of active) {
    const fit = evaluateGoalAgainstSurplus(goal, surplus, from);
    if (!fit || fit.status === "done") continue;
    if (
      !best ||
      (fit.monthlyTarget ?? 0) > (best.fit.monthlyTarget ?? 0)
    ) {
      best = { goal, fit };
    }
  }
  return best;
}
