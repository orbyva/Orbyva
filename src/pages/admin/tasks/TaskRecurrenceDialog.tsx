import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FORM_DIALOG_CONTENT_CLASS } from "@/components/FormLabel";
import { TaskRecurrenceRules } from "./TaskRecurrenceRules";
import type { Recurring } from "@/types/recurring";
import type { Dimension } from "@/types/dimensions";
import type { TaskRecurrenceEditor, TaskRecurrenceValue } from "./useTaskRecurrenceEditor";

export const TASK_RECURRENCE_DIALOG_TITLE = "Repetição da tarefa";

/**
 * A configuração de repetição, que antes ocupava a aba "Data e repetição" inteira, num modal
 * próprio (feature 080): o painel principal fica com Prazo/Horário/Duração — preenchidos em toda
 * tarefa — e o que só interessa às tarefas repetidas vem para cá.
 *
 * O estado vive fora, no `useTaskRecurrenceEditor` do painel, porque mudar o **prazo** (que ficou
 * lá fora) reconstrói a `recurrence_rule` com a configuração escolhida aqui dentro.
 */
export function TaskRecurrenceDialog({
  open,
  onOpenChange,
  value,
  editor,
  recurrings,
  dimensions,
  onRecurringCreated,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: TaskRecurrenceValue;
  editor: TaskRecurrenceEditor;
  recurrings: Recurring[];
  dimensions: Dimension[];
  onRecurringCreated: (recurring: Recurring) => void;
  onChange: (next: TaskRecurrenceValue) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>{TASK_RECURRENCE_DIALOG_TITLE}</DialogTitle>
          <DialogDescription>
            Prazo, horário e duração continuam no formulário — aqui fica só como a tarefa se repete.
          </DialogDescription>
        </DialogHeader>
        <TaskRecurrenceRules
          value={value}
          editor={editor}
          recurrings={recurrings}
          dimensions={dimensions}
          onRecurringCreated={onRecurringCreated}
          onChange={onChange}
        />
      </DialogContent>
    </Dialog>
  );
}
