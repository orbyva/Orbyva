import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePicker } from "@/components/DatePicker";
import { FormLabel, FORM_DIALOG_CONTENT_CLASS, FORM_FIELDS_CLASS } from "@/components/FormLabel";
import { TaskDescriptionField } from "./TaskDescriptionField";
import { isSubtaskDueDateValid } from "@/domain/tasks";
import { formatLocalIsoDate } from "@/lib/dates";
import { formatDateBR } from "@/lib/currency";
import type { Task } from "@/types/tasks";

export interface SubtaskEditPayload {
  title: string;
  description: string;
  due_date: string | null;
}

/**
 * Versão enxuta do dialog de tarefa (Título/Descrição/Prazo, sem projeto/recorrência/tags/
 * prioridade — subtarefas não usam nenhum desses) usada pra editar uma subtarefa a partir do
 * clique numa linha de `SubtaskChecklist`. Componente controlado — quem salva de verdade
 * (`updateTask` + atualização otimista) é a página que o usa.
 */
export function SubtaskEditDialog({
  subtask,
  parentDueDate,
  onOpenChange,
  onSave,
}: {
  subtask: Task | null;
  /** Prazo da tarefa-pai — a subtarefa não pode vencer depois dele (`isSubtaskDueDateValid`). */
  parentDueDate: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: SubtaskEditPayload) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);

  useEffect(() => {
    if (!subtask) return;
    setTitle(subtask.title);
    setDescription(subtask.description ?? "");
    setDueDate(subtask.due_date);
  }, [subtask]);

  const dueDateValid = isSubtaskDueDateValid(dueDate, parentDueDate);

  function handleSave() {
    if (!title.trim() || !dueDateValid) return;
    onSave({ title: title.trim(), description, due_date: dueDate });
  }

  return (
    <Dialog open={!!subtask} onOpenChange={onOpenChange}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>Editar subtarefa</DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel required>Título</FormLabel>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <FormLabel optional>Descrição</FormLabel>
            <TaskDescriptionField value={description} onChange={setDescription} />
          </div>
          <div>
            <FormLabel optional>Prazo</FormLabel>
            <DatePicker
              clearable
              date={dueDate ? new Date(`${dueDate}T12:00:00`) : undefined}
              onSelect={(d) => setDueDate(d ? formatLocalIsoDate(d) : null)}
              maxDate={parentDueDate ? new Date(`${parentDueDate}T12:00:00`) : undefined}
            />
            {!dueDateValid && (
              <p className="mt-1 text-xs text-destructive">
                O prazo não pode passar de {formatDateBR(parentDueDate)}, prazo da tarefa
                principal.
              </p>
            )}
          </div>
          <Button onClick={handleSave} className="w-full" disabled={!dueDateValid}>
            Salvar alterações
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
