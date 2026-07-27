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

/** Prefixo estável no ledger / recorrentes para ligar meta ↔ finanças. */
export function goalAporteDescription(title: string): string {
  return `Aporte meta: ${title.trim()}`;
}

export function matchesGoalAporte(
  description: string | null | undefined,
  title: string
): boolean {
  if (!description) return false;
  const prefix = goalAporteDescription(title).toLowerCase();
  return description.trim().toLowerCase().startsWith(prefix.toLowerCase());
}

/** Soma lançamentos (e parcelas) que são aportes da meta. */
export function sumAporteProgress(
  rows: { description?: string | null; value?: number | null }[],
  title: string
): number {
  return rows.reduce((sum, row) => {
    if (!matchesGoalAporte(row.description, title)) return sum;
    return sum + Math.abs(Number(row.value) || 0);
  }, 0);
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

/** Liga meta financeira ao próximo passo em Transações (+ quanto guardar/mês). */
export function getFinancialGoalInsight(
  goal: PersonalGoal,
  from = new Date()
): GoalFinanceInsight | null {
  if (goal.category !== "financial") return null;

  const progress = getGoalProgress(goal);
  const remaining = Math.max(0, goal.target_value - goal.current_value);
  const unit = goal.unit?.toLowerCase() ?? "";
  const isMoney =
    !unit ||
    unit.includes("r$") ||
    unit.includes("real") ||
    unit.includes("reais") ||
    unit === "brl";

  const monthsRemaining = monthsUntilDeadline(goal.deadline, from);
  let monthlyTarget: number | null = null;
  let monthlyLabel: string | null = null;

  if (remaining <= 0) {
    monthlyTarget = 0;
    monthlyLabel = null;
  } else if (monthsRemaining === null) {
    monthlyLabel =
      "Defina um prazo para calcular quanto guardar por mês.";
  } else if (monthsRemaining === 0) {
    monthlyLabel = `Prazo encerrado — ainda faltam ${formatAmount(remaining, isMoney, goal.unit ?? "")}.`;
  } else {
    monthlyTarget = remaining / monthsRemaining;
    monthlyLabel = isMoney
      ? `Guarde ${formatBRL(monthlyTarget)}/mês por ${monthsRemaining} mês${monthsRemaining === 1 ? "" : "es"} para bater a meta.`
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
        ? "Meta financeira concluída — registre a conquista nas transações se quiser."
        : isMoney
          ? `Faltam ${formatBRL(remaining)}. Atualize o progresso ou lance o valor em Transações.`
          : `Faltam ${remaining}${goal.unit ? ` ${goal.unit}` : ""}. Atualize o progresso e, se fizer sentido, lance em Finanças.`,
  };
}
