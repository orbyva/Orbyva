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
import { weekdayOrdinalInMonth } from "@/domain/tasks";
import type { RecurrenceFrequency, RecurrenceMonthlyMode, RecurrenceRule } from "@/types/tasks";
import type { Recurring } from "@/types/recurring";
import { useState } from "react";

type RecurrenceMode = "none" | "simple" | "linked";
type EndMode = "never" | "until" | "count";

const FREQUENCY_UNIT_LABELS: Record<RecurrenceFrequency, string> = {
  daily: "dia(s)",
  weekly: "semana(s)",
  monthly: "mês(es)",
  yearly: "ano(s)",
};

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEKDAY_NAMES_LONG = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];
const ORDINAL_LABELS: Record<number, string> = {
  1: "primeira",
  2: "segunda",
  3: "terceira",
  4: "quarta",
  5: "quinta",
};

interface TaskRecurrenceValue {
  due_date: string | null;
  due_time?: string | null;
  start_date?: string | null;
  recurrence_rule: RecurrenceRule | null;
  linked_recurring_id: string | null;
}

function modeFor(value: TaskRecurrenceValue): RecurrenceMode {
  if (value.linked_recurring_id) return "linked";
  if (value.recurrence_rule) return "simple";
  return "none";
}

function endModeFor(rule: RecurrenceRule | null): EndMode {
  if (rule?.count) return "count";
  if (rule?.until) return "until";
  return "never";
}

/** "Na terceira terça-feira" — o dia/semana do mês são inferidos de `dueDate`, não escolhidos à parte. */
function monthlyWeekdayLabel(dueDate: string): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12);
  const ordinal = weekdayOrdinalInMonth(date);
  const ordinalLabel = ordinal === -1 ? "última" : (ORDINAL_LABELS[ordinal] ?? `${ordinal}ª`);
  return `Na ${ordinalLabel} ${WEEKDAY_NAMES_LONG[date.getDay()]}`;
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
  const [intervalValue, setIntervalValue] = useState<number>(value.recurrence_rule?.interval ?? 1);
  const [weekdays, setWeekdays] = useState<number[]>(value.recurrence_rule?.weekdays ?? []);
  const [monthlyMode, setMonthlyMode] = useState<RecurrenceMonthlyMode>(
    value.recurrence_rule?.monthlyMode ?? "day"
  );
  const [endMode, setEndMode] = useState<EndMode>(() => endModeFor(value.recurrence_rule));
  const [endUntil, setEndUntil] = useState<string | null>(value.recurrence_rule?.until ?? null);
  const [endCount, setEndCount] = useState<number>(value.recurrence_rule?.count ?? 5);

  function buildRule(
    overrides: Partial<{
      freq: RecurrenceFrequency;
      intervalVal: number;
      weekdaysVal: number[];
      monthlyModeVal: RecurrenceMonthlyMode;
      endModeVal: EndMode;
      endUntilVal: string | null;
      endCountVal: number;
      dueTimeVal: string | null | undefined;
    }> = {}
  ): RecurrenceRule {
    const freq = overrides.freq ?? frequency;
    const intervalV = Math.max(1, overrides.intervalVal ?? intervalValue);
    const weekdaysV = overrides.weekdaysVal ?? weekdays;
    const monthlyModeV = overrides.monthlyModeVal ?? monthlyMode;
    const endModeV = overrides.endModeVal ?? endMode;
    const endUntilV = overrides.endUntilVal !== undefined ? overrides.endUntilVal : endUntil;
    const endCountV = overrides.endCountVal ?? endCount;
    const dueTimeV = overrides.dueTimeVal !== undefined ? overrides.dueTimeVal : value.due_time;

    return {
      frequency: freq,
      interval: intervalV,
      ...(freq === "weekly" && weekdaysV.length > 0 ? { weekdays: weekdaysV } : {}),
      ...(freq === "monthly" && monthlyModeV === "weekday" ? { monthlyMode: monthlyModeV } : {}),
      ...(endModeV === "until" && endUntilV ? { until: endUntilV } : {}),
      ...(endModeV === "count" && endCountV > 0 ? { count: endCountV } : {}),
      time: dueTimeV ?? null,
    };
  }

  function selectMode(next: RecurrenceMode) {
    if (next === mode) return;
    setMode(next);
    if (next === "none") {
      onChange({
        due_date: value.due_date,
        due_time: value.due_time,
        start_date: value.start_date,
        recurrence_rule: null,
        linked_recurring_id: null,
      });
    } else if (next === "simple") {
      onChange({
        due_date: value.due_date,
        due_time: value.due_time,
        start_date: value.start_date,
        recurrence_rule: value.due_date ? buildRule() : null,
        linked_recurring_id: null,
      });
    } else {
      onChange({
        due_date: null,
        due_time: null,
        start_date: null,
        recurrence_rule: null,
        linked_recurring_id: null,
      });
    }
  }

  function selectFrequency(next: RecurrenceFrequency) {
    setFrequency(next);
    if (value.due_date) onChange({ ...value, recurrence_rule: buildRule({ freq: next }) });
  }

  function selectInterval(next: number) {
    setIntervalValue(next);
    if (value.due_date) onChange({ ...value, recurrence_rule: buildRule({ intervalVal: next }) });
  }

  function toggleWeekday(wd: number) {
    const next = weekdays.includes(wd)
      ? weekdays.filter((w) => w !== wd)
      : [...weekdays, wd].sort((a, b) => a - b);
    setWeekdays(next);
    if (value.due_date) onChange({ ...value, recurrence_rule: buildRule({ weekdaysVal: next }) });
  }

  function selectMonthlyMode(next: RecurrenceMonthlyMode) {
    setMonthlyMode(next);
    if (value.due_date) onChange({ ...value, recurrence_rule: buildRule({ monthlyModeVal: next }) });
  }

  function selectEndMode(next: EndMode) {
    setEndMode(next);
    if (value.due_date) onChange({ ...value, recurrence_rule: buildRule({ endModeVal: next }) });
  }

  function selectEndUntil(next: string | null) {
    setEndUntil(next);
    if (value.due_date) onChange({ ...value, recurrence_rule: buildRule({ endUntilVal: next }) });
  }

  function selectEndCount(next: number) {
    setEndCount(next);
    if (value.due_date) onChange({ ...value, recurrence_rule: buildRule({ endCountVal: next }) });
  }

  function selectDueDate(nextDate: string | null) {
    onChange({
      ...value,
      due_date: nextDate,
      recurrence_rule: mode === "simple" && nextDate ? buildRule() : null,
    });
  }

  function selectDueTime(nextTime: string | null) {
    onChange({
      ...value,
      due_time: nextTime,
      recurrence_rule: value.recurrence_rule ? buildRule({ dueTimeVal: nextTime }) : null,
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
          {value.due_date && (
            <div>
              <FormLabel optional>Horário</FormLabel>
              <Input
                type="time"
                value={value.due_time ?? ""}
                onChange={(e) => selectDueTime(e.target.value || null)}
                className="h-9"
              />
            </div>
          )}
        </div>
      )}

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
                  onChange={(e) => selectInterval(Math.max(1, Number(e.target.value) || 1))}
                  className="h-9 w-16"
                />
                <Select value={frequency} onValueChange={(v) => selectFrequency(v as RecurrenceFrequency)}>
                  <SelectTrigger className="w-36">
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
                      onClick={() => toggleWeekday(wd)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Nenhum dia marcado repete no mesmo dia da semana do prazo, a cada intervalo.
                </p>
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
                    className={cn("h-7 px-2.5 text-xs", monthlyMode === "day" && "border border-primary/40")}
                    onClick={() => selectMonthlyMode("day")}
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
                    onClick={() => selectMonthlyMode("weekday")}
                  >
                    {monthlyWeekdayLabel(value.due_date)}
                  </Button>
                </div>
              </div>
            )}

            <div>
              <FormLabel optional>Termina</FormLabel>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(
                  [
                    ["never", "Nunca"],
                    ["until", "Em uma data"],
                    ["count", "Depois de N ocorrências"],
                  ] as [EndMode, string][]
                ).map(([m, label]) => (
                  <Button
                    key={m}
                    type="button"
                    size="sm"
                    variant={endMode === m ? "secondary" : "outline"}
                    className={cn("h-7 px-2.5 text-xs", endMode === m && "border border-primary/40")}
                    onClick={() => selectEndMode(m)}
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
                    onSelect={(d) => selectEndUntil(d ? formatLocalIsoDate(d) : null)}
                  />
                </div>
              )}
              {endMode === "count" && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={1}
                    value={endCount}
                    onChange={(e) => selectEndCount(Math.max(1, Number(e.target.value) || 1))}
                    className="h-9 w-20"
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
