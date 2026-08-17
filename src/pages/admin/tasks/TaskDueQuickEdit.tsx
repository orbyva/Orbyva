import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { InlineCalendarPicker } from "@/components/DatePicker";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FormLabel } from "@/components/FormLabel";
import { TaskDurationQuickPick } from "./TaskDurationQuickPick";
import { formatDateTimeBR } from "@/lib/currency";
import { formatLocalIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * Trigger clicável (texto/ícone de calendário; sem prazo, mostra "+ Prazo") que abre um popover
 * já com o calendário aberto (`InlineCalendarPicker`, sem o trigger próprio que `DatePicker` tem)
 * + um horário compacto (ícone + input estreito) e `TaskDurationQuickPick` (ícone de relógio +
 * presets) abaixo — mesmo par usado no form completo (`TaskRecurrenceField`), mas aqui edita
 * direto na `TaskListRow` (feature 029, layout compacto na 031). Chama `onChange` sempre com os
 * campos atualizados.
 */
export function TaskDueQuickEdit({
  dueDate,
  dueTime,
  estimatedDuration,
  onChange,
}: {
  dueDate: string | null;
  dueTime?: string | null;
  estimatedDuration?: number | null;
  onChange: (next: { due_date: string | null; due_time: string | null; estimated_duration: number | null }) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-sm px-0.5 hover:bg-muted hover:text-foreground",
            !dueDate && "text-muted-foreground/70"
          )}
        >
          <CalendarIcon className="h-3 w-3" />
          {dueDate ? formatDateTimeBR(dueDate, dueTime) : "+ Prazo"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto space-y-2.5 p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 pt-3">
          <FormLabel optional>Prazo</FormLabel>
        </div>
        <InlineCalendarPicker
          clearable
          size="compact"
          date={dueDate ? new Date(`${dueDate}T12:00:00`) : undefined}
          onSelect={(d) =>
            onChange({
              due_date: d ? formatLocalIsoDate(d) : null,
              due_time: d ? (dueTime ?? null) : null,
              estimated_duration: estimatedDuration ?? null,
            })
          }
        />
        {dueDate && (
          <div className="flex items-center justify-between gap-2 border-t px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Input
                type="time"
                aria-label="Horário"
                value={dueTime ?? ""}
                onChange={(e) =>
                  onChange({ due_date: dueDate, due_time: e.target.value || null, estimated_duration: estimatedDuration ?? null })
                }
                className="h-8 w-[6.5rem] px-2 text-sm"
              />
            </div>
            <TaskDurationQuickPick
              value={estimatedDuration}
              onChange={(minutes) =>
                onChange({ due_date: dueDate, due_time: dueTime ?? null, estimated_duration: minutes })
              }
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
