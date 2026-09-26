import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/FormLabel";
import { reorderItems } from "@/domain/tasks/subtasks";
import type { SubtaskDraft } from "@/types/tasks";

export type { SubtaskDraft };

/**
 * Lista editável de subtarefas (adicionar/remover/reordenar), usada tanto na criação (linhas ainda
 * não salvas, viram `createTask` encadeado ao salvar a tarefa-pai) quanto na edição (cada
 * adicionar/remover já dispara a chamada correspondente — mesmo comportamento imediato que o
 * Kanban já tinha). A ordem é `task.sort_order`.
 */

function itemId(subtask: SubtaskDraft, index: number): string {
  return subtask.id ?? `draft-${index}`;
}

function SortableSubtaskRow({
  id,
  title,
  onRemove,
}: {
  id: string;
  title: string;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs ${
        isDragging ? "opacity-60" : ""
      }`}
    >
      <button
        type="button"
        className="shrink-0 touch-none text-muted-foreground hover:text-foreground"
        aria-label={`Reordenar ${title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-5 w-5 shrink-0"
        onClick={onRemove}
        aria-label="Remover subtarefa"
      >
        <X className="h-3 w-3" />
      </Button>
    </li>
  );
}

export function TaskSubtasksField({
  subtasks,
  onAdd,
  onRemove,
  onReorder,
}: {
  subtasks: SubtaskDraft[];
  onAdd: (title: string) => void;
  onRemove: (subtask: SubtaskDraft, index: number) => void;
  onReorder?: (next: SubtaskDraft[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const ids = subtasks.map(itemId);

  function submit() {
    const title = draft.trim();
    if (!title) return;
    onAdd(title);
    setDraft("");
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(reorderItems(subtasks, from, to));
  }

  return (
    <div className="space-y-1.5">
      <FormLabel optional>Subtarefas</FormLabel>
      {subtasks.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1">
              {subtasks.map((s, i) => (
                <SortableSubtaskRow
                  key={ids[i]}
                  id={ids[i]}
                  title={s.title}
                  onRemove={() => onRemove(s, i)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
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
