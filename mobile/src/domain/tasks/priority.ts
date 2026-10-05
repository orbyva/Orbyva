import type { ThemeColor } from "@/constants/theme";
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

/** Token da prioridade: baixa no `primary`, média em alerta, alta destrutiva. */
export const PRIORITY_TONE: Record<TaskPriority, ThemeColor> = {
  low: "primary",
  medium: "warning",
  high: "destructive",
};
