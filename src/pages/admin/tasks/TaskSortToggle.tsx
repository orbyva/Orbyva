import { Button } from "@/components/ui/button";
import { TASK_SORT_KEYS, TASK_SORT_LABELS, type TaskSortKey } from "@/domain/tasks";
import { cn } from "@/lib/utils";

interface TaskSortToggleProps {
  value: TaskSortKey;
  onChange: (key: TaskSortKey) => void;
  className?: string;
}

/**
 * Seletor "Ordenar por" da aba Lista (feature 079). São poucas opções, então botões visíveis —
 * um dropdown esconderia o estado atual atrás de um clique. Compartilhado por `TaskList` e
 * `ProjectDetail`, que também compartilham a preferência salva.
 */
export function TaskSortToggle({ value, onChange, className }: TaskSortToggleProps) {
  return (
    <div
      role="group"
      aria-label="Ordenar por"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      <span className="text-xs text-muted-foreground">Ordenar por</span>
      {TASK_SORT_KEYS.map((key) => (
        <Button
          key={key}
          type="button"
          size="sm"
          variant={value === key ? "secondary" : "outline"}
          aria-pressed={value === key}
          className={cn("h-7 px-2.5 text-xs", value === key && "border border-primary/40")}
          onClick={() => onChange(key)}
        >
          {TASK_SORT_LABELS[key]}
        </Button>
      ))}
    </div>
  );
}
