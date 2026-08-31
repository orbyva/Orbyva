import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { InlineCalendarPicker } from "@/components/DatePicker";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FormLabel } from "@/components/FormLabel";
import { TaskDurationQuickPick } from "./TaskDurationQuickPick";
import { formatDateTimeBR } from "@/lib/currency";
import { formatLocalIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Payload da edição rápida de prazo — `due_date`/`due_time`/`estimated_duration` desde a feature
 * 029, mais `is_quick` (feature 070), que a opção "Pontual" do popover de duração liga. Vive aqui
 * porque era a mesma forma literal repetida em `TaskQuickFields`, `TaskViews`, `TaskList` e
 * `ProjectDetail`. */
export interface TaskDueQuickEditValue {
  due_date: string | null;
  due_time: string | null;
  estimated_duration: number | null;
  is_quick: boolean;
}

/**
 * Trigger clicável (texto/ícone de calendário; sem prazo, mostra "+ Prazo") que abre um popover
 * já com o calendário aberto (`InlineCalendarPicker`, sem o trigger próprio que `DatePicker` tem)
 * + um horário compacto (ícone + input estreito) e `TaskDurationQuickPick` (ícone de relógio +
 * presets) abaixo — mesmo par usado no painel do form completo (`TaskFormFields`, bloco 3), mas aqui edita
 * direto na `TaskListRow` (feature 029, layout compacto na 031). Chama `onChange` sempre com os
 * campos atualizados.
 */
export function TaskDueQuickEdit({
  dueDate,
  dueTime,
  estimatedDuration,
  isQuick = false,
  onChange,
  onOpenChange,
}: {
  dueDate: string | null;
  dueTime?: string | null;
  estimatedDuration?: number | null;
  /** Tarefa pontual (feature 070) — a opção "Pontual" do popover de duração liga/desliga isso. */
  isQuick?: boolean;
  onChange: (next: TaskDueQuickEditValue) => void;
  /** Abertura/fechamento do popover (feature 081). A Lista usa o `false` como o momento de
   * descongelar a posição da linha e reagrupar: enquanto o popover está aberto o card fica parado
   * (a queixa que a feature 029 consertou), ao fechar ele cai na caixa de prazo certa. Escolher uma
   * data **não** fecha o popover — horário e duração continuam acessíveis na mesma abertura. */
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Popover onOpenChange={onOpenChange}>
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
              is_quick: isQuick,
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
                  onChange({
                    due_date: dueDate,
                    due_time: e.target.value || null,
                    estimated_duration: estimatedDuration ?? null,
                    is_quick: isQuick,
                  })
                }
                className="h-8 w-[6.5rem] px-2 text-sm"
              />
            </div>
            <TaskDurationQuickPick
              value={estimatedDuration}
              isQuick={isQuick}
              onChange={(minutes) =>
                onChange({
                  due_date: dueDate,
                  due_time: dueTime ?? null,
                  estimated_duration: minutes,
                  // Escolher uma duração desliga "pontual": os dois são mutuamente exclusivos.
                  is_quick: minutes == null ? isQuick : false,
                })
              }
              onQuickChange={(next) =>
                onChange({
                  due_date: dueDate,
                  due_time: dueTime ?? null,
                  estimated_duration: next ? null : (estimatedDuration ?? null),
                  is_quick: next,
                })
              }
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
