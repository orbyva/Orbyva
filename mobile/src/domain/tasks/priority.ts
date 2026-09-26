import type { TaskPriority } from "@/types/tasks";

export const PRIORITY_OPTIONS: [TaskPriority | null, string][] = [
  [null, "Nenhuma"],
  ["low", "Baixa"],
  ["medium", "Média"],
  ["high", "Alta"],
];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "#0EA5E9",
  medium: "#D97706",
  high: "#E11D48",
};
