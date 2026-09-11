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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormLabel, FORM_DIALOG_CONTENT_CLASS, FORM_FIELDS_CLASS } from "@/components/FormLabel";
import { createTask, updateTask } from "@/api/tasks";
import { emptyTask } from "@/domain/tasks/taskDraft";
import {
  buildConsultationTitle,
  splitConsultationTitle,
} from "@/domain/tasks/consultation";
import {
  WEEKDAY_LABELS,
  WEEKDAY_NAMES_LONG,
  WEEKDAYS_EMPTY_HINT,
} from "@/domain/tasks/recurrence";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Task } from "@/types/tasks";

type RepeatOption = "once" | "weekly" | "monthly";

/**
 * Rótulo do campo de intervalo por unidade de repetição. Um campo fixo "A cada quantos meses"
 * passaria a mentir assim que a opção semanal existisse (feature 061, pedido de 2026-08-23).
 */
const INTERVAL_LABEL: Record<Exclude<RepeatOption, "once">, string> = {
  weekly: "A cada quantas semanas",
  monthly: "A cada quantos meses",
};

/**
 * Intervalo inicial por unidade: retorno de rotina se marca em meses (semestral é o caso comum),
 * mas série semanal — fisioterapia, sessões de terapia — é quase sempre toda semana. Trocar a
 * unidade sem trocar o número deixaria "a cada 6 semanas" pré-selecionado.
 */
const DEFAULT_INTERVAL: Record<Exclude<RepeatOption, "once">, string> = {
  weekly: "1",
  monthly: "6",
};

interface ConsultationQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois que a consulta é salva — quem chama recarrega a lista. */
  onCreated: () => void;
  /** Presente = edição desta ocorrência. Ausente = agendamento. Remontar com `key`. */
  task?: Task | null;
}

/**
 * Atalho de agendamento de consulta médica (feature 061) — por baixo cria uma tarefa comum com
 * `is_consultation: true`, o que já a coloca no calendário geral e, quando periódica, na mesma
 * materialização de recorrência das medicações (`RecurrenceRule` com `frequency: "monthly"`).
 *
 * O especialista vai no `title` ("Cardiologista — Dr. Silva") porque `title` é o único campo que a
 * célula do calendário renderiza; local e preparo vão na `description`, visíveis ao abrir a tarefa.
 */
export function ConsultationQuickCreateDialog({
  open,
  onOpenChange,
  onCreated,
  task = null,
}: ConsultationQuickCreateDialogProps) {
  const editing = task != null;
  const parsed = task ? splitConsultationTitle(task.title) : null;
  const [specialty, setSpecialty] = useState(parsed?.specialty ?? "");
  const [professional, setProfessional] = useState(parsed?.professional ?? "");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [dueTime, setDueTime] = useState(task?.due_time?.slice(0, 5) ?? "");
  const [repeat, setRepeat] = useState<RepeatOption>("once");
  // String (não number) pra não clampar durante a digitação — mesmo motivo documentado em
  // `MedicationQuickCreateDialog.tsx` (apagar pra redigitar fazia o campo saltar pro mínimo).
  const [intervalValue, setIntervalValue] = useState(DEFAULT_INTERVAL.monthly);
  /** Dias marcados na repetição semanal (0=domingo…6=sábado), sempre ordenados. */
  const [weekdays, setWeekdays] = useState<number[]>([]);
  /** `until` da regra. Vazio = sem fim, que é o padrão de quem só quer "todo mês". */
  const [endsOn, setEndsOn] = useState("");
  const [endsOnError, setEndsOnError] = useState<string | null>(null);
  const [details, setDetails] = useState(task?.description ?? "");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const canSave = !!specialty.trim() && !!dueDate;

  function reset() {
    setSpecialty("");
    setProfessional("");
    setDueDate("");
    setDueTime("");
    setRepeat("once");
    setIntervalValue(DEFAULT_INTERVAL.monthly);
    setWeekdays([]);
    setEndsOn("");
    setEndsOnError(null);
    setDetails("");
  }

  /**
   * Trocar a unidade de repetição leva junto o intervalo padrão dela (ver `DEFAULT_INTERVAL`) e
   * descarta o que só faz sentido na unidade anterior — dia da semana marcado não pode sobreviver
   * a uma virada para mensal e reaparecer no payload como resíduo, nem um término escolhido pode
   * sobrar em cima de uma consulta que voltou a ser única.
   */
  function pickRepeat(next: RepeatOption) {
    setRepeat(next);
    if (next !== "once") setIntervalValue(DEFAULT_INTERVAL[next]);
    if (next !== "weekly") setWeekdays([]);
    if (next === "once") setEndsOn("");
    setEndsOnError(null);
  }

  /**
   * O que impede o formulário de salvar um término inconsistente. `null` = pode salvar.
   *
   * Término antes da data da consulta não é um detalhe cosmético: `computeMissingOccurrences` corta
   * tudo que passa de `until`, então a série nasceria com a consulta inicial e nenhuma repetição —
   * o usuário pediu recorrência e receberia uma consulta única, sem aviso nenhum.
   */
  function endsOnProblem(): string | null {
    if (repeat === "once" || !endsOn) return null;
    if (dueDate && endsOn < dueDate) {
      return "O término precisa ser igual ou posterior à data da consulta.";
    }
    return null;
  }

  function toggleWeekday(weekday: number) {
    setWeekdays((current) =>
      current.includes(weekday)
        ? current.filter((wd) => wd !== weekday)
        : [...current, weekday].sort((a, b) => a - b)
    );
  }

  async function handleSave() {
    if (!canSave) return;

    if (!editing) {
      const problem = endsOnProblem();
      if (problem) {
        setEndsOnError(problem);
        return;
      }
      setEndsOnError(null);
    }

    setSaving(true);
    try {
      const title = buildConsultationTitle(specialty, professional);
      const description = details.trim() || null;
      if (editing) {
        await updateTask({
          id: task.id,
          title,
          description,
          due_date: dueDate,
          due_time: dueTime || null,
        });
        toast({ title: "Consulta atualizada!", duration: 2000 });
      } else {
        const interval = Math.max(1, parseInt(intervalValue, 10) || 1);
        await createTask({
          ...emptyTask(),
          title,
          description,
          status: "todo",
          due_date: dueDate,
          due_time: dueTime || null,
          is_consultation: true,
          recurrence_rule:
            repeat === "once"
              ? null
              : {
                  frequency: repeat,
                  interval,
                  time: dueTime || null,
                  ...(repeat === "weekly" && weekdays.length > 0
                    ? { weekdays }
                    : {}),
                  ...(endsOn ? { until: endsOn } : {}),
                },
        });
        toast({ title: "Consulta agendada!", duration: 2000 });
        reset();
      }
      onOpenChange(false);
      onCreated();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          editing
            ? "Não foi possível salvar a consulta."
            : "Não foi possível agendar a consulta."
        ),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !editing) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar consulta" : "Agendar consulta"}
          </DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel required htmlFor="consultation-specialty">
              Especialidade
            </FormLabel>
            <Input
              id="consultation-specialty"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              placeholder="Ex.: Cardiologista"
            />
          </div>
          <div>
            <FormLabel optional htmlFor="consultation-professional">
              Profissional
            </FormLabel>
            <Input
              id="consultation-professional"
              value={professional}
              onChange={(e) => setProfessional(e.target.value)}
              placeholder="Ex.: Dr. Silva"
            />
          </div>
          <div>
            <FormLabel required htmlFor="consultation-date">
              Data
            </FormLabel>
            <Input
              id="consultation-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div>
            <FormLabel optional htmlFor="consultation-time">
              Horário
            </FormLabel>
            <Input
              id="consultation-time"
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
            />
          </div>
          {editing ? null : (
            <>
          <div>
            <FormLabel>Repetição</FormLabel>
            <Select value={repeat} onValueChange={(v) => pickRepeat(v as RepeatOption)}>
              <SelectTrigger aria-label="Repetição">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once">Consulta única</SelectItem>
                <SelectItem value="weekly">Repetir a cada X semanas</SelectItem>
                <SelectItem value="monthly">Repetir a cada X meses</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {repeat !== "once" && (
            <div>
              <FormLabel required htmlFor="consultation-interval">
                {INTERVAL_LABEL[repeat]}
              </FormLabel>
              <Input
                id="consultation-interval"
                type="number"
                min={1}
                value={intervalValue}
                onChange={(e) => setIntervalValue(e.target.value)}
              />
            </div>
          )}
          {/* "Fisioterapia segunda, quarta e sexta" precisa ser uma série só: sem os dias da
              semana, seriam três consultas recorrentes separadas para o mesmo tratamento. */}
          {repeat === "weekly" && (
            <div>
              <FormLabel optional>Dias da semana</FormLabel>
              <div className="mt-1 flex gap-1" role="group" aria-label="Dias da semana">
                {WEEKDAY_LABELS.map((label, wd) => {
                  const selected = weekdays.includes(wd);
                  return (
                    <Button
                      key={wd}
                      type="button"
                      size="sm"
                      variant={selected ? "secondary" : "outline"}
                      aria-pressed={selected}
                      // A inicial sozinha não identifica o dia ("S" é segunda e sábado).
                      aria-label={WEEKDAY_NAMES_LONG[wd]}
                      className={cn("h-7 w-7 p-0 text-xs", selected && "border border-primary/40")}
                      onClick={() => toggleWeekday(wd)}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{WEEKDAYS_EMPTY_HINT}</p>
            </div>
          )}
          {/* Sem este campo, qualquer repetição do atalho era eterna — e a semanal materializaria
              uma tarefa por semana desde a data inicial, todas as semanas, para sempre. */}
          {repeat !== "once" && (
            <div>
              <FormLabel optional htmlFor="consultation-ends-on">
                Termina em
              </FormLabel>
              <Input
                id="consultation-ends-on"
                type="date"
                value={endsOn}
                aria-invalid={endsOnError != null}
                aria-describedby={
                  endsOnError ? "consultation-ends-on-error" : "consultation-ends-on-hint"
                }
                onChange={(e) => {
                  setEndsOn(e.target.value);
                  if (endsOnError) setEndsOnError(null);
                }}
                // Validação no blur, não a cada tecla: uma data pela metade não é erro do usuário.
                onBlur={() => setEndsOnError(endsOnProblem())}
              />
              {endsOnError ? (
                <p
                  id="consultation-ends-on-error"
                  role="alert"
                  className="mt-1 text-xs text-destructive"
                >
                  {endsOnError}
                </p>
              ) : (
                <p id="consultation-ends-on-hint" className="mt-1 text-xs text-muted-foreground">
                  Em branco, a consulta se repete sem fim.
                </p>
              )}
            </div>
          )}
            </>
          )}
          <div>
            <FormLabel optional htmlFor="consultation-details">
              Local e preparo
            </FormLabel>
            <textarea
              id="consultation-details"
              className="flex min-h-[64px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Ex.: Clínica Vida, sala 302 — jejum de 8h"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </div>
          <Button onClick={handleSave} disabled={!canSave || saving} className="w-full">
            {saving
              ? editing
                ? "Salvando..."
                : "Agendando..."
              : editing
                ? "Salvar"
                : "Agendar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
