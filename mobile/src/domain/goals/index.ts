import type { PersonalGoal } from "@/types/goals";

export const GOAL_CATEGORY_LABELS: Record<string, string> = {
  financial: "Financeira",
  health: "Saúde",
  learning: "Aprendizado",
  fitness: "Fitness",
  other: "Outra",
};

export function getGoalProgress(goal: PersonalGoal): number {
  if (!goal.target_value || goal.target_value <= 0) return 0;
  return Math.min(
    100,
    Math.round((goal.current_value / goal.target_value) * 100)
  );
}

export function formatGoalProgress(goal: PersonalGoal): string {
  const unit = goal.unit ? ` ${goal.unit}` : "";
  return `${goal.current_value}${unit} / ${goal.target_value}${unit}`;
}
