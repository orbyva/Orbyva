import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/FormLabel";
import { cn } from "@/lib/utils";
import { PRIORITY_LABELS, PRIORITY_OPTIONS } from "@/domain/tasks/priority";
import type { TaskPriority } from "@/types/tasks";

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "text-blue-500",
  medium: "text-amber-500",
  high: "text-red-500",
};

export function TaskPriorityFlag({
  priority,
}: {
  priority: TaskPriority | null | undefined;
}) {
  if (!priority) return null;
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
