import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/DatePicker";
import { FormLabel } from "@/components/FormLabel";
import { formatLocalIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { RecurrenceFrequency, RecurrenceRule } from "@/types/tasks";
import type { Recurring } from "@/types/recurring";
import { useState } from "react";

type RecurrenceMode = "none" | "simple" | "linked";

const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  daily: "Diária",
  weekly: "Semanal",
  monthly: "Mensal",
};

interface TaskRecurrenceValue {
  due_date: string | null;
  start_date?: string | null;
  recurrence_rule: RecurrenceRule | null;
  linked_recurring_id: string | null;
}

function modeFor(value: TaskRecurrenceValue): RecurrenceMode {
  if (value.linked_recurring_id) return "linked";
  if (value.recurrence_rule) return "simple";
  return "none";
}

export function TaskRecurrenceField({
  value,
  recurrings,
  onChange,
}: {
  value: TaskRecurrenceValue;
  recurrings: Recurring[];
  onChange: (next: TaskRecurrenceValue) => void;
}) {
  const [mode, setMode] = useState<RecurrenceMode>(() => modeFor(value));
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(
    value.recurrence_rule?.frequency ?? "daily"
  );

  function selectMode(next: RecurrenceMode) {
    if (next === mode) return;
    setMode(next);
    if (next === "none") {
      onChange({
        due_date: value.due_date,
        start_date: value.start_date,
        recurrence_rule: null,
        linked_recurring_id: null,
      });
    } else if (next === "simple") {
      onChange({
        due_date: value.due_date,
        start_date: value.start_date,
        recurrence_rule: value.due_date ? { frequency, interval: 1 } : null,
        linked_recurring_id: null,
      });
    } else {
      onChange({ due_date: null, start_date: null, recurrence_rule: null, linked_recurring_id: null });
    }
  }

  function selectFrequency(next: RecurrenceFrequency) {
    setFrequency(next);
    if (value.due_date) {
      onChange({ ...value, recurrence_rule: { frequency: next, interval: 1 } });
    }
  }

  function selectDueDate(nextDate: string | null) {
    onChange({
      ...value,
      due_date: nextDate,
      recurrence_rule:
        mode === "simple" && nextDate ? { frequency, interval: 1 } : null,
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <FormLabel optional>Esta tarefa se repete?</FormLabel>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(
            [
              ["none", "Não"],
              ["simple", "Recorrência simples"],
              ["linked", "Vinculada a Recorrência Financeira"],
            ] as [RecurrenceMode, string][]
          ).map(([m, label]) => (
            <Button
              key={m}
              type="button"
              size="sm"
              variant={mode === m ? "secondary" : "outline"}
              className={cn("h-7 px-2.5 text-xs", mode === m && "border border-primary/40")}
              onClick={() => selectMode(m)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {mode !== "linked" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FormLabel optional>Início</FormLabel>
            <DatePicker
              clearable
              date={value.start_date ? new Date(`${value.start_date}T12:00:00`) : undefined}
              onSelect={(d) =>
                onChange({ ...value, start_date: d ? formatLocalIsoDate(d) : null })
              }
            />
          </div>
          <div>
            <FormLabel optional>Prazo</FormLabel>
            <DatePicker
              clearable
              date={value.due_date ? new Date(`${value.due_date}T12:00:00`) : undefined}
              onSelect={(d) => selectDueDate(d ? formatLocalIsoDate(d) : null)}
            />
          </div>
        </div>
      )}

      {mode === "simple" &&
        (value.due_date ? (
          <div>
            <FormLabel optional>Frequência</FormLabel>
            <Select value={frequency} onValueChange={(v) => selectFrequency(v as RecurrenceFrequency)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FREQUENCY_LABELS) as RecurrenceFrequency[]).map((f) => (
                  <SelectItem key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Defina um prazo para poder repetir.</p>
        ))}

      {mode === "linked" && (
        <div className="space-y-1.5">
          <FormLabel optional>Vincular a uma Recorrência Financeira</FormLabel>
          <Select
            value={value.linked_recurring_id ?? "none"}
            onValueChange={(v) =>
              onChange({ ...value, linked_recurring_id: v === "none" ? null : v })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhuma</SelectItem>
              {recurrings.map((rec) => (
                <SelectItem key={rec.id} value={rec.id}>
                  {rec.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            As datas dessa tarefa vêm das parcelas em aberto da Recorrência escolhida.
          </p>
        </div>
      )}
    </div>
  );
}
