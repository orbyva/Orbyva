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
import { formatLocalIsoDate } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";

type FrequencyOption = "daily" | "custom";

interface MedicationQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois que a tarefa é criada com sucesso — quem chama recarrega a lista. */
  onCreated: () => void;
}

/**
 * Atalho de criação de medicação (feature 049) — por baixo cria uma tarefa recorrente comum
 * (`RecurrenceRule` com `frequency: "daily"`), com `is_medication: true`. O form completo
 * continua disponível via "Editar" na tarefa criada, pra quem precisar de tags/prioridade/etc.
 */
export function MedicationQuickCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: MedicationQuickCreateDialogProps) {
  const [title, setTitle] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [frequency, setFrequency] = useState<FrequencyOption>("daily");
  // String (não number) pra não clampar o valor a cada tecla — clampar durante a digitação faz
  // o campo "saltar" de volta pro mínimo assim que o usuário apaga pra digitar outro número.
  // O clamp de verdade acontece só em handleSave.
  const [customInterval, setCustomInterval] = useState("2");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  function reset() {
    setTitle("");
    setDueTime("");
    setFrequency("daily");
    setCustomInterval("2");
  }

  async function handleSave() {
    if (!title.trim() || !dueTime) return;
    setSaving(true);
    try {
      const interval = frequency === "daily" ? 1 : Math.max(1, parseInt(customInterval, 10) || 1);
      await createTask({
        ...emptyTask(),
        title: title.trim(),
        status: "todo",
        due_date: formatLocalIsoDate(new Date()),
        due_time: dueTime,
        is_medication: true,
        recurrence_rule: { frequency: "daily", interval, time: dueTime },
      });
      toast({ title: "Medicação criada!", duration: 2000 });
      reset();
      onOpenChange(false);
      onCreated();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível criar a medicação."),
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
          <DialogTitle>Nova medicação</DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel required htmlFor="medication-title">
              Nome do remédio
            </FormLabel>
            <Input
              id="medication-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Losartana"
            />
          </div>
          <div>
            <FormLabel required htmlFor="medication-time">
              Horário
            </FormLabel>
            <Input
              id="medication-time"
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
            />
          </div>
          <div>
            <FormLabel required>Frequência</FormLabel>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as FrequencyOption)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Todos os dias</SelectItem>
                <SelectItem value="custom">A cada X dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {frequency === "custom" && (
            <div>
              <FormLabel required htmlFor="medication-interval">
                A cada quantos dias
              </FormLabel>
              <Input
                id="medication-interval"
                type="number"
                min={1}
                value={customInterval}
                onChange={(e) => setCustomInterval(e.target.value)}
              />
            </div>
          )}
          <Button onClick={handleSave} disabled={!title.trim() || !dueTime || saving} className="w-full">
            {saving ? "Criando..." : "Criar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
