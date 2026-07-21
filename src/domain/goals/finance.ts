import type { PersonalGoal } from "@/types/goals";
import { formatGoalProgress, getGoalProgress } from "@/domain/goals";
import { formatBRL } from "@/lib/currency";

export type GoalFinanceInsight = {
  remaining: number;
  progress: number;
  label: string;
  suggestion: string;
};

/** Liga meta financeira ao próximo passo em Transações. */
export function getFinancialGoalInsight(
  goal: PersonalGoal
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

  return {
    remaining,
    progress,
    label: formatGoalProgress(goal),
    suggestion:
      remaining <= 0
        ? "Meta financeira concluída — registre a conquista nas transações se quiser."
        : isMoney
          ? `Faltam ${formatBRL(remaining)}. Atualize o progresso ou lance o valor em Transações.`
          : `Faltam ${remaining}${goal.unit ? ` ${goal.unit}` : ""}. Atualize o progresso e, se fizer sentido, lance em Finanças.`,
  };
}
