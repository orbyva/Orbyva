import { Calendar, Check, ChevronDown, ChevronRight, Pen, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { isRecurringTask } from "@/domain/tasks";
import type { Task } from "@/types/tasks";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatDateTimeBR } from "@/lib/currency";
import { TaskPriorityFlag } from "./TaskPriorityField";

export function SubtaskChecklist({
  subtasks,
  onToggle,
}: {
  subtasks: Task[];
  onToggle: (subtask: Task) => void;
}) {
  return (
    <ul className="mt-2 space-y-1 border-t pt-2">
      {subtasks.map((s) => (
        <li key={s.id} className="flex items-center gap-2">
          <input type="checkbox" checked={s.status === "done"} onChange={() => onToggle(s)} />
          <span
            className={cn(
              "truncate text-xs",
              s.status === "done" && "text-muted-foreground line-through"
            )}
          >
            {s.title}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ExpandSubtasksButton({
  count,
  expanded,
  onClick,
}: {
  count: number;
  expanded: boolean;
  onClick: () => void;
}) {
  if (count === 0) return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 shrink-0"
      onClick={onClick}
      aria-label={expanded ? "Recolher subtarefas" : "Expandir subtarefas"}
    >
      {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
    </Button>
  );
}

export function TaskAgendaCard({
  task,
  projectName,
  subtasks,
  expanded,
  onToggleDone,
  onToggleExpand,
  onToggleSubtask,
  onOpenSeries,
}: {
  task: Task;
  projectName: string;
  subtasks: Task[];
  expanded: boolean;
  onToggleDone: () => void;
  onToggleExpand: () => void;
  onToggleSubtask: (subtask: Task) => void;
  onOpenSeries: () => void;
}) {
  const done = task.status === "done";
  const recurring = isRecurringTask(task);
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleDone}
          aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            done
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40 hover:border-primary"
          )}
        >
          {done && <Check className="h-3 w-3" />}
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={recurring ? onOpenSeries : undefined}
          disabled={!recurring}
        >
          <div className="flex items-center gap-1.5">
            {recurring && (
              <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Recorrente" />
            )}
            <TaskPriorityFlag priority={task.priority} />
            <p
              className={cn(
                "truncate text-sm font-medium",
                done && "text-muted-foreground line-through"
              )}
            >
              {task.title}
            </p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">
              {projectName}
            </Badge>
            {done && task.completed_at ? (
              <span>Concluída em {formatDateTimeBR(task.completed_at)}</span>
            ) : (
              task.due_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDateTimeBR(task.due_date, task.due_time)}
                </span>
              )
            )}
          </div>
        </button>
        <ExpandSubtasksButton
          count={subtasks.length}
          expanded={expanded}
          onClick={onToggleExpand}
        />
      </div>
      {expanded && subtasks.length > 0 && (
        <SubtaskChecklist subtasks={subtasks} onToggle={onToggleSubtask} />
      )}
    </div>
  );
}

export function TaskListRow({
  task,
  subtasks,
  expanded,
  onToggleExpand,
  onToggleSubtask,
  onEdit,
  onDelete,
  extraActions,
}: {
  task: Task;
  subtasks: Task[];
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleSubtask: (subtask: Task) => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Ações extras (ex.: "Lançar transação") renderizadas antes de editar/excluir. */
  extraActions?: ReactNode;
}) {
  const recurring = isRecurringTask(task);
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {recurring && (
              <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Recorrente" />
            )}
            <TaskPriorityFlag priority={task.priority} />
            <p className="truncate font-medium">{task.title}</p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">
              {task.status === "todo" ? "A fazer" : task.status === "doing" ? "Fazendo" : "Feito"}
            </Badge>
            {task.linked_recurring_id && (
              <Badge variant="outline" className="text-[10px]">
                Vinculada a Recorrência
              </Badge>
            )}
            {task.due_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDateTimeBR(task.due_date, task.due_time)}
              </span>
            )}
            {task.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {extraActions}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onEdit}>
            <Pen className="h-3.5 w-3.5" />
          </Button>
          <ConfirmDeleteDialog title="Excluir esta tarefa?" onConfirm={onDelete}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </ConfirmDeleteDialog>
          <ExpandSubtasksButton count={subtasks.length} expanded={expanded} onClick={onToggleExpand} />
        </div>
      </div>
      {expanded && subtasks.length > 0 && (
        <SubtaskChecklist subtasks={subtasks} onToggle={onToggleSubtask} />
      )}
    </div>
  );
}
