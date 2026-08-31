import { useState } from "react";
import { Check, Pen, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { elapsedSeconds, formatDuration } from "@/domain/tasks";
import type { TaskTimeEntry } from "@/types/tasks";

export function formatTimeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}

/** Linha de um registro de tempo — editável (início/fim, com segundos) e excluível. Usada tanto
 * em `Live.tsx` (histórico completo) quanto em `TaskTimeEntriesField.tsx` (seção "Registros de
 * tempo" do dialog de edição de tarefa), as duas superfícies de acesso a registros de tempo. */
export function TimeEntryRow({
  entry,
  taskTitle,
  now,
  onSave,
  onDelete,
}: {
  entry: TaskTimeEntry;
  /** Só faz sentido em `Live.tsx`, que cruza tarefas — `TaskTimeEntriesField.tsx` já está
   * escopado a uma tarefa só. */
  taskTitle?: string;
  now: Date;
  onSave: (payload: { started_at: string; ended_at: string | null }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [startValue, setStartValue] = useState("");
  const [endValue, setEndValue] = useState("");
  const [saving, setSaving] = useState(false);

  function startEditing() {
    setStartValue(toDatetimeLocalValue(entry.started_at));
    setEndValue(entry.ended_at ? toDatetimeLocalValue(entry.ended_at) : "");
    setEditing(true);
  }

  async function handleSave() {
    if (!startValue) return;
    setSaving(true);
    try {
      await onSave({
        started_at: fromDatetimeLocalValue(startValue),
        ended_at: endValue ? fromDatetimeLocalValue(endValue) : null,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-1.5 rounded-lg border bg-card p-2.5">
        {taskTitle && <p className="truncate text-sm font-medium">{taskTitle}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          <Input
            type="datetime-local"
            step="1"
            value={startValue}
            onChange={(e) => setStartValue(e.target.value)}
            className="h-8 w-56 text-xs"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <Input
            type="datetime-local"
            step="1"
            value={endValue}
            onChange={(e) => setEndValue(e.target.value)}
            placeholder="Em andamento"
            className="h-8 w-56 text-xs"
          />
        </div>
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setEditing(false)}
            aria-label="Cancelar edição"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleSave}
            disabled={saving || !startValue}
            aria-label="Salvar registro"
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
      <div className="min-w-0">
        {taskTitle && <p className="truncate text-sm">{taskTitle}</p>}
        <p className="text-xs text-muted-foreground">
          {formatTimeOfDay(entry.started_at)} –{" "}
          {entry.ended_at ? formatTimeOfDay(entry.ended_at) : "em andamento"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {formatDuration(
            elapsedSeconds(
              { taskId: entry.task_id, startedAt: entry.started_at, endedAt: entry.ended_at },
              now
            )
          )}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={startEditing}
          aria-label="Editar registro"
        >
          <Pen className="h-3.5 w-3.5" />
        </Button>
        <ConfirmDeleteDialog title="Excluir este registro de tempo?" onConfirm={onDelete}>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </ConfirmDeleteDialog>
      </div>
    </div>
  );
}
