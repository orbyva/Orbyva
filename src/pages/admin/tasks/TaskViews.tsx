import {
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Github,
  GripVertical,
  Pen,
  Play,
  Repeat,
  Square,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import { detectGitHubLink, isRecurringTask } from "@/domain/tasks";
import type { Tag, Task, TaskStatus } from "@/types/tasks";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { contrastTextColor } from "@/lib/color";
import { formatDateTimeBR } from "@/lib/currency";
import { stripMarkdown } from "@/lib/markdown";
import { TaskPriorityFlag } from "./TaskPriorityField";

export const STATUSES: TaskStatus[] = ["todo", "doing", "done"];
export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "A fazer",
  doing: "Fazendo",
  done: "Feito",
};

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
  onStatusChange,
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
  /** Select inline de status (A fazer/Fazendo/Feito) — `onToggleDone` continua como atalho
   * rápido pra concluir/reabrir; o Select cobre o caso "Fazendo" que o atalho binário não cobre. */
  onStatusChange: (status: TaskStatus) => void;
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
              <Select value={task.status} onValueChange={(v) => onStatusChange(v as TaskStatus)}>
                <SelectTrigger
                  onClick={(e) => e.stopPropagation()}
                  className="h-5 w-auto gap-1 border-none bg-transparent px-1.5 py-0 text-[10px] font-semibold text-muted-foreground shadow-none hover:bg-muted [&>svg]:h-3 [&>svg]:w-3"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

/** Seção "Concluídas" recolhível — sem agrupamento por prazo, cada tarefa já vem ordenada por
 * quem chama (`sortTasksByCompletedAtDesc`). Remonta (perde estado de aberto/fechado) quando o
 * `key` passado pela página muda, o que a página usa pra abrir por padrão no filtro "Concluídas"
 * e fechada dentro de "Todas". */
export function CompletedTasksSection({
  tasks,
  allTags,
  subtasksByParent,
  expandedTasks,
  onToggleExpand,
  onToggleSubtask,
  onOpenSubtask,
  onToggleDone,
  onStatusChange,
  onOpenSeries,
  onEdit,
  onDelete,
  isTimerRunning,
  extraActions,
  defaultOpen = false,
}: {
  tasks: Task[];
  allTags: Tag[];
  subtasksByParent: Map<string, Task[]>;
  expandedTasks: Set<string>;
  onToggleExpand: (taskId: string) => void;
  onToggleSubtask: (subtask: Task) => void;
  onOpenSubtask: (subtask: Task) => void;
  onToggleDone: (task: Task) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  onOpenSeries: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  isTimerRunning: (task: Task) => boolean;
  extraActions?: (task: Task) => ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (tasks.length === 0) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Concluídas <span className="font-normal">({tasks.length})</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2">
        {tasks.map((task) => (
          <TaskListRow
            key={task.id}
            task={task}
            subtasks={subtasksByParent.get(task.id) ?? []}
            allTags={allTags}
            expanded={expandedTasks.has(task.id)}
            onToggleExpand={() => onToggleExpand(task.id)}
            onToggleSubtask={onToggleSubtask}
            onOpenSubtask={onOpenSubtask}
            onToggleDone={() => onToggleDone(task)}
            onStatusChange={(status) => onStatusChange(task, status)}
            onOpenSeries={() => onOpenSeries(task)}
            onEdit={() => onEdit(task)}
            onDelete={() => onDelete(task.id)}
            isTimerRunning={isTimerRunning(task)}
            extraActions={extraActions?.(task)}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function KanbanColumn({ status, children }: { status: TaskStatus; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn("space-y-2 rounded-lg p-1 transition-colors", isOver && "bg-muted/60")}
    >
      {children}
    </div>
  );
}

export function KanbanCard({
  task,
  colIndex,
  subtasks,
  allTags,
  subtaskDraft,
  onSubtaskDraftChange,
  onAddSubtask,
  onToggleSubtask,
  onEdit,
  onDelete,
  onMoveStatus,
  isTimerRunning,
  onToggleTimer,
  onOpenSubtask,
  /** Badge do projeto — só faz sentido num Kanban que cruza projetos (ex.: aba Kanban de
   * `TaskList.tsx`); o Kanban de dentro de um projeto (`ProjectDetail.tsx`) não passa isso. */
  projectBadge,
}: {
  task: Task;
  colIndex: number;
  subtasks: Task[];
  allTags: Tag[];
  subtaskDraft: string;
  onSubtaskDraftChange: (value: string) => void;
  onAddSubtask: () => void;
  onToggleSubtask: (subtask: Task) => void;
  onEdit: () => void;
  onDelete: () => void;
  onMoveStatus: (direction: -1 | 1) => void;
  isTimerRunning?: boolean;
  onToggleTimer?: () => void;
  onOpenSubtask: (subtask: Task) => void;
  projectBadge?: ReactNode;
}) {
  const taskTags = task.tag_ids
    .map((id) => allTags.find((t) => t.id === id))
    .filter((t): t is Tag => !!t);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const doneSubtasks = subtasks.filter((s) => s.status === "done").length;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cn(
        "cursor-pointer space-y-2 rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/40",
        isDragging && "opacity-40"
      )}
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            className="shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
            aria-label="Arrastar tarefa"
            onClick={(e) => e.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <TaskPriorityFlag priority={task.priority} />
          <p className="min-w-0 truncate text-sm font-medium">{task.title}</p>
        </div>
        <div className="flex shrink-0 gap-0.5" onClick={(e) => e.stopPropagation()}>
          {onToggleTimer && task.status !== "done" && (
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7", isTimerRunning ? "text-primary" : "text-muted-foreground")}
              onClick={onToggleTimer}
              aria-label={isTimerRunning ? "Parar timer" : "Iniciar timer"}
            >
              {isTimerRunning ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", ICON_EDIT_BUTTON_CLASS)}
            onClick={onEdit}
          >
            <Pen className="h-3 w-3" />
          </Button>
          <ConfirmDeleteDialog
            title="Excluir esta tarefa?"
            description={
              subtasks.length > 0 ? "As subtarefas também serão excluídas." : undefined
            }
            onConfirm={onDelete}
          >
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
              <Trash2 className="h-3 w-3" />
            </Button>
          </ConfirmDeleteDialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {projectBadge}
        {task.due_date && <span>Prazo: {formatDateTimeBR(task.due_date, task.due_time)}</span>}
        {task.linked_recurring_id && (
          <Badge variant="outline" className="text-[10px]">
            Vinculada a Recorrência
          </Badge>
        )}
        {subtasks.length > 0 && (
          <Badge variant="outline" className="text-[10px]">
            {doneSubtasks}/{subtasks.length} subtarefas
          </Badge>
        )}
        {taskTags.map((tag) => (
          <TagBadge key={tag.id} tag={tag} />
        ))}
        {task.external_url && <ExternalLinkChip url={task.external_url} />}
      </div>

      {task.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {stripMarkdown(task.description)}
        </p>
      )}

      {subtasks.length > 0 && (
        <ul className="space-y-1 border-t pt-2" onClick={(e) => e.stopPropagation()}>
          {subtasks.map((subtask) => (
            <li key={subtask.id} className="flex items-start gap-2 py-0.5">
              <input
                type="checkbox"
                checked={subtask.status === "done"}
                onChange={() => onToggleSubtask(subtask)}
                className="mt-0.5 shrink-0"
              />
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onOpenSubtask(subtask)}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      "truncate text-xs",
                      subtask.status === "done" && "text-muted-foreground line-through"
                    )}
                  >
                    {subtask.title}
                  </span>
                  {subtask.due_date && (
                    <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
                      <Calendar className="h-2.5 w-2.5" />
                      {formatDateTimeBR(subtask.due_date, subtask.due_time)}
                    </span>
                  )}
                </div>
                {subtask.description && (
                  <p className="truncate text-[10px] text-muted-foreground">
                    {stripMarkdown(subtask.description)}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
        <Input
          value={subtaskDraft}
          onChange={(e) => onSubtaskDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAddSubtask();
          }}
          placeholder="Adicionar subtarefa"
          className="h-7 text-xs"
        />
      </div>

      <div className="flex justify-between border-t pt-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={colIndex === 0}
            onClick={() => onMoveStatus(-1)}
            aria-label="Mover para trás"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={colIndex === STATUSES.length - 1}
            onClick={() => onMoveStatus(1)}
            aria-label="Mover para frente"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        {task.status === "done" && !task.linked_recurring_id && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" asChild>
            <Link
              to={`/finance/transactions?new=1&nature=despesa&desc=${encodeURIComponent(task.title)}`}
            >
              Lançar transação
            </Link>
          </Button>
        )}
      </div>
    </article>
  );
}
