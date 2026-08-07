import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Github,
  Pen,
  Play,
  Repeat,
  Square,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { detectGitHubLink, isRecurringTask } from "@/domain/tasks";
import type { Tag, Task } from "@/types/tasks";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { contrastTextColor } from "@/lib/color";
import { formatDateTimeBR } from "@/lib/currency";
import { stripMarkdown } from "@/lib/markdown";
import { TaskPriorityFlag } from "./TaskPriorityField";

/** Chip de link externo — reconhece issue/PR do GitHub pela URL (sem chamada de rede) e mostra
 * "owner/repo#N"; qualquer outra URL vira um chip genérico "Link externo". */
export function ExternalLinkChip({ url }: { url: string }) {
  const github = detectGitHubLink(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
    >
      {github ? (
        <>
          <Github className="h-3 w-3" />
          {github.owner}/{github.repo}#{github.number}
        </>
      ) : (
        <>
          <ExternalLink className="h-3 w-3" />
          Link externo
        </>
      )}
    </a>
  );
}

/** Badge de tag colorida estilo GitHub labels (fundo na cor da tag, texto com melhor contraste). */
export function TagBadge({ tag }: { tag: Tag }) {
  return (
    <Badge
      className="border-none text-[10px]"
      style={{ backgroundColor: tag.color, color: contrastTextColor(tag.color) }}
    >
      {tag.name}
    </Badge>
  );
}

export function SubtaskChecklist({
  subtasks,
  onToggle,
  onOpenSubtask,
}: {
  subtasks: Task[];
  onToggle: (subtask: Task) => void;
  onOpenSubtask: (subtask: Task) => void;
}) {
  return (
    <ul className="mt-2 space-y-1 border-t pt-2">
      {subtasks.map((s) => (
        <li key={s.id} className="flex items-start gap-2 py-0.5">
          <input
            type="checkbox"
            checked={s.status === "done"}
            onChange={() => onToggle(s)}
            className="mt-0.5 shrink-0"
          />
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => onOpenSubtask(s)}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "truncate text-xs",
                  s.status === "done" && "text-muted-foreground line-through"
                )}
              >
                {s.title}
              </span>
              {s.due_date && (
                <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
                  <Calendar className="h-2.5 w-2.5" />
                  {formatDateTimeBR(s.due_date, s.due_time)}
                </span>
              )}
            </div>
            {s.description && (
              <p className="truncate text-[10px] text-muted-foreground">
                {stripMarkdown(s.description)}
              </p>
            )}
          </button>
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

export function TaskListRow({
  task,
  subtasks,
  allTags,
  expanded,
  onToggleExpand,
  onToggleSubtask,
  onOpenSubtask,
  onToggleDone,
  onOpenSeries,
  onEdit,
  onDelete,
  isTimerRunning,
  onToggleTimer,
  extraActions,
}: {
  task: Task;
  subtasks: Task[];
  /** Catálogo completo de tags do usuário — usado pra resolver `task.tag_ids` nos badges coloridos. */
  allTags: Tag[];
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleSubtask: (subtask: Task) => void;
  onOpenSubtask: (subtask: Task) => void;
  onToggleDone: () => void;
  onOpenSeries: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Timer "Live" rodando pra esta tarefa agora. */
  isTimerRunning?: boolean;
  onToggleTimer?: () => void;
  /** Ações extras (ex.: "Lançar transação") renderizadas antes de editar/excluir. */
  extraActions?: ReactNode;
}) {
  const taskTags = task.tag_ids
    .map((id) => allTags.find((t) => t.id === id))
    .filter((t): t is Tag => !!t);
  const recurring = isRecurringTask(task);
  const done = task.status === "done";
  return (
    <div
      className="cursor-pointer rounded-lg border bg-card p-3 transition-colors hover:border-primary/40"
      onClick={onEdit}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone();
            }}
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
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {recurring && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSeries();
                  }}
                  aria-label="Ver ocorrências"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <Repeat className="h-3 w-3" />
                </button>
              )}
              <TaskPriorityFlag priority={task.priority} />
              <p
                className={cn(
                  "truncate font-medium",
                  done && "text-muted-foreground line-through"
                )}
              >
                {task.title}
              </p>
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
              {taskTags.map((tag) => (
                <TagBadge key={tag.id} tag={tag} />
              ))}
              {task.external_url && <ExternalLinkChip url={task.external_url} />}
            </div>
            {task.description && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {stripMarkdown(task.description)}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {onToggleTimer && !done && (
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", isTimerRunning ? "text-primary" : "text-muted-foreground hover:text-foreground")}
              onClick={onToggleTimer}
              aria-label={isTimerRunning ? "Parar timer" : "Iniciar timer"}
            >
              {isTimerRunning ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
          )}
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
        <div onClick={(e) => e.stopPropagation()}>
          <SubtaskChecklist
            subtasks={subtasks}
            onToggle={onToggleSubtask}
            onOpenSubtask={onOpenSubtask}
          />
        </div>
      )}
    </div>
  );
}
