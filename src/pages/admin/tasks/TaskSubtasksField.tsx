import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/FormLabel";
import type { SubtaskDraft } from "@/types/tasks";

export type { SubtaskDraft };

/**
 * Lista editável de subtarefas (adicionar/remover), usada tanto na criação (linhas ainda não
 * salvas, viram `createTask` encadeado ao salvar a tarefa-pai) quanto na edição (cada
 * adicionar/remover já dispara a chamada correspondente — mesmo comportamento imediato que o
 * Kanban já tinha).
 */
export function TaskSubtasksField({
  subtasks,
  onAdd,
  onRemove,
}: {
  subtasks: SubtaskDraft[];
  onAdd: (title: string) => void;
  onRemove: (subtask: SubtaskDraft, index: number) => void;
}) {
  const [draft, setDraft] = useState("");

  function submit() {
    const title = draft.trim();
    if (!title) return;
    onAdd(title);
    setDraft("");
  }

  return (
    <div className="space-y-1.5">
      <FormLabel optional>Subtarefas</FormLabel>
      {subtasks.length > 0 && (
        <ul className="space-y-1">
          {subtasks.map((s, i) => (
            <li
              key={s.id ?? `draft-${i}`}
              className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs"
            >
              <span className="truncate">{s.title}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0"
                onClick={() => onRemove(s, i)}
                aria-label="Remover subtarefa"
              >
                <X className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Adicionar subtarefa"
          className="h-8 text-xs"
        />
        <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={submit}>
          Adicionar
        </Button>
      </div>
    </div>
  );
}
