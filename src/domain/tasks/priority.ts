import type { TaskPriority } from "@/types/tasks";

/** Opções do seletor de prioridade (`TaskPriorityField`) e dos chips de filtro rápido da Lista. */
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
