import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { getErrorMessage } from "@/lib/errors";
import { buildFixedYearPlan } from "@/domain/recurring";
import { createRecurringApi } from "@/api/recurring";
import { RecurringFormDialog } from "@/pages/admin/finance/components/RecurringFormDialog";
import { toast } from "@/hooks/use-toast";
import {
  FREQUENCY_UNIT_LABELS,
  monthlyWeekdayLabel,
  WEEKDAY_LABELS,
  WEEKDAYS_EMPTY_HINT,
} from "@/domain/tasks/recurrence";
import type { RecurrenceFrequency } from "@/types/tasks";
import type { Recurring, RecurringCreateRequest } from "@/types/recurring";
import type { Dimension } from "@/types/dimensions";
import type {
  EndMode,
  RecurrenceMode,
  TaskRecurrenceEditor,
  TaskRecurrenceValue,
} from "./useTaskRecurrenceEditor";

const RECURRENCE_MODE_OPTIONS: [RecurrenceMode, string][] = [
  ["none", "Não"],
  ["simple", "Recorrência simples"],
  ["linked", "Vinculada a Recorrência Financeira"],
];

const RECURRENCE_END_OPTIONS: [EndMode, string][] = [
  ["never", "Nunca"],
  ["until", "Em uma data"],
  ["count", "Depois de N ocorrências"],
];

function defaultRecurringCreateRequest(): RecurringCreateRequest {
  const payment_start_date = new Date().toISOString().split("T")[0];
  const plan = buildFixedYearPlan(payment_start_date);
  return {
    class_id: 0,
    value: 0,
    description: "",
    frequency: "Mensal",
    validity: plan.validity,
    due_day: 10,
    installment_count: plan.installment_count,
    payment_start_date,
    status: true,
    link_url: null,
  };
}

/**
 * Tudo que ficava **abaixo de "Esta tarefa se repete?"** em `TaskRecurrenceField` — modo
 * (Não / Simples / Vinculada), frequência, intervalo, dias da semana, modo mensal, término e o
 * vínculo com Recorrência Financeira.
 *
 * Extraído em componente próprio na feature 080, quando a configuração de repetição saiu do corpo
 * do formulário para o `TaskRecurrenceDialog`. O estado vem de fora, via `useTaskRecurrenceEditor`
 * — Início/Prazo/Horário/Duração **não** moram aqui, porque continuam no painel.
 */
export function TaskRecurrenceRules({
  value,
  editor,
  recurrings,
  dimensions,
  onRecurringCreated,
  onChange,
}: {
  value: TaskRecurrenceValue;
  editor: TaskRecurrenceEditor;
  recurrings: Recurring[];
  dimensions: Dimension[];
  onRecurringCreated: (recurring: Recurring) => void;
  onChange: (next: TaskRecurrenceValue) => void;
}) {
  const [newRecurringOpen, setNewRecurringOpen] = useState(false);
  const [newRecurring, setNewRecurring] = useState<RecurringCreateRequest>(
    defaultRecurringCreateRequest
  );
  const { mode, frequency, intervalValue, weekdays, monthlyMode, endMode, endUntil, endCount } =
    editor;

  async function handleCreateRecurring(payload?: RecurringCreateRequest) {
    const data = payload ?? newRecurring;
    try {
      const created = await createRecurringApi(data);
      onRecurringCreated(created);
      onChange({ ...value, linked_recurring_id: created.id });
      setNewRecurringOpen(false);
      setNewRecurring(defaultRecurringCreateRequest());
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível criar a recorrência."),
        variant: "destructive",
        duration: 2000,
      });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <FormLabel optional>Esta tarefa se repete?</FormLabel>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {RECURRENCE_MODE_OPTIONS.map(([m, label]) => (
            <Button
              key={m}
              type="button"
              size="sm"
              variant={mode === m ? "secondary" : "outline"}
              className={cn("h-7 px-2.5 text-xs", mode === m && "border border-primary/40")}
              onClick={() => editor.selectMode(m)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {mode === "simple" &&
        (value.due_date ? (
          <div className="space-y-3">
            <div>
              <FormLabel optional>Repetir a cada</FormLabel>
              <div className="mt-1 flex items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  value={intervalValue}
                  onChange={(e) => editor.selectInterval(Math.max(1, Number(e.target.value) || 1))}
                  className="h-9 w-16"
                  aria-label="Repetir a cada"
                />
                <Select
                  value={frequency}
                  onValueChange={(v) => editor.selectFrequency(v as RecurrenceFrequency)}
                >
                  <SelectTrigger className="w-36" aria-label="Frequência">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FREQUENCY_UNIT_LABELS) as RecurrenceFrequency[]).map((f) => (
                      <SelectItem key={f} value={f}>
                        {FREQUENCY_UNIT_LABELS[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {frequency === "weekly" && (
              <div>
                <FormLabel optional>Dias da semana</FormLabel>
                <div className="mt-1 flex gap-1">
                  {WEEKDAY_LABELS.map((label, wd) => (
                    <Button
                      key={wd}
                      type="button"
                      size="sm"
                      variant={weekdays.includes(wd) ? "secondary" : "outline"}
                      className={cn(
                        "h-7 w-7 p-0 text-xs",
                        weekdays.includes(wd) && "border border-primary/40"
                      )}
                      onClick={() => editor.toggleWeekday(wd)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{WEEKDAYS_EMPTY_HINT}</p>
              </div>
            )}

            {frequency === "monthly" && (
              <div>
                <FormLabel optional>Repetir</FormLabel>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={monthlyMode === "day" ? "secondary" : "outline"}
                    className={cn(
                      "h-7 px-2.5 text-xs",
                      monthlyMode === "day" && "border border-primary/40"
                    )}
                    onClick={() => editor.selectMonthlyMode("day")}
                  >
                    No dia {Number(value.due_date.slice(8, 10))}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={monthlyMode === "weekday" ? "secondary" : "outline"}
                    className={cn(
                      "h-7 px-2.5 text-xs",
                      monthlyMode === "weekday" && "border border-primary/40"
                    )}
                    onClick={() => editor.selectMonthlyMode("weekday")}
                  >
                    {monthlyWeekdayLabel(value.due_date)}
                  </Button>
                </div>
              </div>
            )}

            <div>
              <FormLabel optional>Termina</FormLabel>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {RECURRENCE_END_OPTIONS.map(([m, label]) => (
                  <Button
                    key={m}
                    type="button"
                    size="sm"
                    variant={endMode === m ? "secondary" : "outline"}
                    className={cn("h-7 px-2.5 text-xs", endMode === m && "border border-primary/40")}
                    onClick={() => editor.selectEndMode(m)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {endMode === "until" && (
                <div className="mt-1.5 w-40">
                  <DatePicker
                    clearable
                    date={endUntil ? new Date(`${endUntil}T12:00:00`) : undefined}
                    onSelect={(d) => editor.selectEndUntil(d ? formatLocalIsoDate(d) : null)}
                  />
                </div>
              )}
              {endMode === "count" && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={1}
                    value={endCount}
                    onChange={(e) => editor.selectEndCount(Math.max(1, Number(e.target.value) || 1))}
                    className="h-9 w-20"
                    aria-label="Número de ocorrências"
                  />
                  <span className="text-xs text-muted-foreground">ocorrências</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Defina um prazo para poder repetir.</p>
        ))}

      {mode === "linked" && (
        <div className="space-y-1.5">
          <FormLabel optional>Vincular a uma Recorrência Financeira</FormLabel>
          <div className="flex items-center gap-2">
            <Select
              value={value.linked_recurring_id ?? "none"}
              onValueChange={(v) => editor.selectLinkedRecurring(v === "none" ? null : v)}
            >
              <SelectTrigger aria-label="Recorrência Financeira">
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 shrink-0"
              onClick={() => setNewRecurringOpen(true)}
            >
              Nova recorrência
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            As datas dessa tarefa vêm das parcelas em aberto da Recorrência escolhida.
          </p>
          <RecurringFormDialog
            open={newRecurringOpen}
            setOpen={setNewRecurringOpen}
            newRecurring={newRecurring}
            setNewRecurring={setNewRecurring}
            createRecurring={handleCreateRecurring}
            isEditing={false}
            trigger={false}
            onClose={() => setNewRecurring(defaultRecurringCreateRequest())}
            dimensions={dimensions}
          />
        </div>
      )}
    </div>
  );
}
