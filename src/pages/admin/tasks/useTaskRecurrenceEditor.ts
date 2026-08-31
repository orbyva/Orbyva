import { useState } from "react";
import type { RecurrenceFrequency, RecurrenceMonthlyMode, RecurrenceRule } from "@/types/tasks";

export interface TaskRecurrenceValue {
  due_date: string | null;
  due_time?: string | null;
  start_date?: string | null;
  estimated_duration?: number | null;
  /** Tarefa pontual (feature 070) — enquanto ligada, a duração estimada fica desabilitada: os dois
   * conceitos são mutuamente exclusivos. Quem liga/desliga é o interruptor de `TaskFormFields`. */
  is_quick?: boolean;
  recurrence_rule: RecurrenceRule | null;
  linked_recurring_id: string | null;
}

export type RecurrenceMode = "none" | "simple" | "linked";
export type EndMode = "never" | "until" | "count";

export function modeFor(value: TaskRecurrenceValue): RecurrenceMode {
  if (value.linked_recurring_id) return "linked";
  if (value.recurrence_rule) return "simple";
  return "none";
}

export function endModeFor(rule: RecurrenceRule | null): EndMode {
  if (rule?.count) return "count";
  if (rule?.until) return "until";
  return "never";
}

export interface TaskRecurrenceEditor {
  mode: RecurrenceMode;
  frequency: RecurrenceFrequency;
  intervalValue: number;
  weekdays: number[];
  monthlyMode: RecurrenceMonthlyMode;
  endMode: EndMode;
  endUntil: string | null;
  endCount: number;
  selectMode: (next: RecurrenceMode) => void;
  selectFrequency: (next: RecurrenceFrequency) => void;
  selectInterval: (next: number) => void;
  toggleWeekday: (weekday: number) => void;
  selectMonthlyMode: (next: RecurrenceMonthlyMode) => void;
  selectEndMode: (next: EndMode) => void;
  selectEndUntil: (next: string | null) => void;
  selectEndCount: (next: number) => void;
  /** Muda o prazo **reconstruindo** a `recurrence_rule` quando o modo é "simples" — é por isso que
   * quem edita a data (o painel da 080, os atalhos da 083) precisa passar por aqui, e não por um
   * `onChange` cru: `due_date` e a regra de repetição andam juntas. */
  selectDueDate: (nextDate: string | null) => void;
  selectDueTime: (nextTime: string | null) => void;
  /** Vínculo com uma Recorrência Financeira (modo "linked"). */
  selectLinkedRecurring: (recurringId: string | null) => void;
}

/**
 * Estado e handlers da recorrência de uma tarefa, extraídos de `TaskRecurrenceField` (feature 080).
 *
 * Mora num hook, e não dentro do dialog de recorrência, porque o **prazo** ficou no painel enquanto
 * a **configuração de repetição** foi para o `TaskRecurrenceDialog`: os dois precisam do mesmo
 * estado (frequência/intervalo/dias/término) para que mudar a data continue reconstruindo a regra
 * como antes, inclusive no caso "modo simples escolhido antes de existir prazo".
 */
export function useTaskRecurrenceEditor({
  value,
  onChange,
}: {
  value: TaskRecurrenceValue;
  onChange: (next: TaskRecurrenceValue) => void;
}): TaskRecurrenceEditor {
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

  function selectLinkedRecurring(recurringId: string | null) {
    onChange({ ...value, linked_recurring_id: recurringId });
  }

  return {
    mode,
    frequency,
    intervalValue,
    weekdays,
    monthlyMode,
    endMode,
    endUntil,
    endCount,
    selectMode,
    selectFrequency,
    selectInterval,
    toggleWeekday,
    selectMonthlyMode,
    selectEndMode,
    selectEndUntil,
    selectEndCount,
    selectDueDate,
    selectDueTime,
    selectLinkedRecurring,
  };
}
