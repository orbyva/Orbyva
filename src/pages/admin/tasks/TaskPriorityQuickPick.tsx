import { Flag } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PRIORITY_LABELS } from "@/domain/tasks/priority";
import { TaskPriorityField } from "./TaskPriorityField";
import { useState } from "react";
import type { TaskPriority } from "@/types/tasks";

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "text-blue-500",
  medium: "text-amber-500",
  high: "text-red-500",
};

/**
 * Trigger clicável (reaproveita o mesmo ícone `Flag` de `TaskPriorityFlag`; sem prioridade, mostra
 * um placeholder apagado — sempre há algo clicável) que abre um popover com `TaskPriorityField`
 * (Baixa/Média/Alta) — edição inline na `TaskListRow` sem precisar abrir o form completo
 * (feature 029).
 */
export function TaskPriorityQuickPick({
  value,
  onChange,
}: {
  value: TaskPriority | null | undefined;
  onChange: (next: TaskPriority | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={
            value ? `Prioridade ${PRIORITY_LABELS[value].toLowerCase()}` : "Definir prioridade"
          }
          className="flex shrink-0 items-center justify-center rounded-sm p-0.5 hover:bg-muted"
        >
          <Flag
            className={cn("h-3 w-3", value ? PRIORITY_COLORS[value] : "text-muted-foreground/40")}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-2.5"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <TaskPriorityField
          value={value ?? null}
          onChange={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
