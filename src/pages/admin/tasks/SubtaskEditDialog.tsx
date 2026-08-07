import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePicker } from "@/components/DatePicker";
import { FormLabel, FORM_DIALOG_CONTENT_CLASS, FORM_FIELDS_CLASS } from "@/components/FormLabel";
import { formatLocalIsoDate } from "@/lib/dates";
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
  onOpenChange,
  onSave,
}: {
  subtask: Task | null;
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

  function handleSave() {
    if (!title.trim()) return;
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
            <textarea
              className="flex min-h-[64px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <FormLabel optional>Prazo</FormLabel>
            <DatePicker
              clearable
              date={dueDate ? new Date(`${dueDate}T12:00:00`) : undefined}
              onSelect={(d) => setDueDate(d ? formatLocalIsoDate(d) : null)}
            />
          </div>
          <Button onClick={handleSave} className="w-full">
            Salvar alterações
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
