import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/FormLabel";
import { cn } from "@/lib/utils";
import { NO_PRIORITY_LABEL, PRIORITY_LABELS, PRIORITY_OPTIONS } from "@/domain/tasks/priority";
import type { TaskPriority } from "@/types/tasks";

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "text-blue-500",
  medium: "text-amber-500",
  high: "text-red-500",
};

/**
 * `"task"` (padrão): marcador de uma linha de tarefa — sem prioridade não desenha nada, senão toda
 * lista ficaria com uma coluna de bandeirinhas apagadas.
 * `"band"` (feature 082): marcador do cabeçalho de uma faixa do painel "Por prioridade", onde o
 * texto ("Alta", "Média", …) foi removido — aí a faixa "sem prioridade" precisa de uma bandeirinha
 * vazada, senão o cabeçalho fica literalmente em branco e parece defeito.
 */
export function TaskPriorityFlag({
  priority,
  variant = "task",
}: {
  priority: TaskPriority | null | undefined;
  variant?: "task" | "band";
}) {
  if (!priority) {
    if (variant !== "band") return null;
    return (
      <Flag
        className="h-3 w-3 shrink-0 text-muted-foreground/40"
        aria-label={NO_PRIORITY_LABEL}
      />
    );
  }
  return (
    <Flag
      className={cn("h-3 w-3 shrink-0", PRIORITY_COLORS[priority])}
      aria-label={`Prioridade ${PRIORITY_LABELS[priority].toLowerCase()}`}
    />
  );
}

export function TaskPriorityField({
  value,
  onChange,
}: {
  value: TaskPriority | null;
  onChange: (next: TaskPriority | null) => void;
}) {
  return (
    <div>
      <FormLabel optional>Prioridade</FormLabel>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {PRIORITY_OPTIONS.map(([p, label]) => (
          <Button
            key={label}
            type="button"
            size="sm"
            variant={value === p ? "secondary" : "outline"}
            className={cn("h-7 px-2.5 text-xs", value === p && "border border-primary/40")}
            onClick={() => onChange(p)}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
