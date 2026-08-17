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
import { createTask } from "@/api/tasks";
import { emptyTask } from "@/domain/tasks/taskDraft";
import { buildConsultationTitle } from "@/domain/tasks/consultation";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";

type RepeatOption = "once" | "monthly";

interface ConsultationQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois que a consulta é criada com sucesso — quem chama recarrega a lista. */
  onCreated: () => void;
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
}: ConsultationQuickCreateDialogProps) {
  const [specialty, setSpecialty] = useState("");
  const [professional, setProfessional] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [repeat, setRepeat] = useState<RepeatOption>("once");
  // String (não number) pra não clampar durante a digitação — mesmo motivo documentado em
  // `MedicationQuickCreateDialog.tsx` (apagar pra redigitar fazia o campo saltar pro mínimo).
  const [monthsInterval, setMonthsInterval] = useState("6");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const canSave = !!specialty.trim() && !!dueDate;

  function reset() {
    setSpecialty("");
    setProfessional("");
    setDueDate("");
    setDueTime("");
    setRepeat("once");
    setMonthsInterval("6");
    setDetails("");
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const interval = Math.max(1, parseInt(monthsInterval, 10) || 1);
      await createTask({
        ...emptyTask(),
        title: buildConsultationTitle(specialty, professional),
        description: details.trim() || null,
        status: "todo",
        due_date: dueDate,
        due_time: dueTime || null,
        is_consultation: true,
        recurrence_rule:
          repeat === "monthly"
            ? { frequency: "monthly", interval, time: dueTime || null }
            : null,
      });
      toast({ title: "Consulta agendada!", duration: 2000 });
      reset();
      onOpenChange(false);
      onCreated();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível agendar a consulta."),
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
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>Agendar consulta</DialogTitle>
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
          <div>
            <FormLabel>Repetição</FormLabel>
            <Select value={repeat} onValueChange={(v) => setRepeat(v as RepeatOption)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once">Consulta única</SelectItem>
                <SelectItem value="monthly">Repetir a cada X meses</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {repeat === "monthly" && (
            <div>
              <FormLabel required htmlFor="consultation-interval">
                A cada quantos meses
              </FormLabel>
              <Input
                id="consultation-interval"
                type="number"
                min={1}
                value={monthsInterval}
                onChange={(e) => setMonthsInterval(e.target.value)}
              />
            </div>
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
            {saving ? "Agendando..." : "Agendar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
