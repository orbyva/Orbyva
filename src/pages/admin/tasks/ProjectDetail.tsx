import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ListTodo,
  Pen,
  Play,
  Plus,
  Square,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { TaskRecurrenceField } from "./TaskRecurrenceField";
import { TaskSubtasksField, type SubtaskDraft } from "./TaskSubtasksField";
import { TaskDescriptionField } from "./TaskDescriptionField";
import { TaskTimeEntriesField } from "./TaskTimeEntriesField";
import { SubtaskEditDialog, type SubtaskEditPayload } from "./SubtaskEditDialog";
import { TaskPriorityField, TaskPriorityFlag } from "./TaskPriorityField";
import { ExternalLinkChip, TagBadge, TaskListRow } from "./TaskViews";
import { TagCombobox } from "./TagCombobox";
import { GanttChart } from "./GanttChart";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
  ICON_EDIT_BUTTON_CLASS,
} from "@/components/FormLabel";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import {
  createTag,
  createTask,
  deleteTask,
  fetchDependencies,
  fetchProjectById,
  fetchTags,
  fetchTasks,
  updateTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import {
  AGENDA_BUCKET_LABELS,
  AGENDA_BUCKET_ORDER,
  collapseRecurringSeries,
  detectExternalProvider,
  findSeriesTasks,
  groupSubtasksByParent,
  groupTasksByAgendaBucket,
  sortTasksByDueDate,
} from "@/domain/tasks";
import type { Project, Tag, Task, TaskCreateRequest, TaskDependency, TaskStatus } from "@/types/tasks";
import type { Recurring } from "@/types/recurring";
import { useToast } from "@/hooks/use-toast";
import { useActiveTimer } from "@/hooks/useActiveTimer";
import { useBreadcrumbTitle } from "@/hooks/useBreadcrumbTitle";
import { getErrorMessage } from "@/lib/errors";
import { formatLocalIsoDate } from "@/lib/dates";
import { formatDateTimeBR } from "@/lib/currency";
import { stripMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

const STATUSES: TaskStatus[] = ["todo", "doing", "done"];
const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "A fazer",
  doing: "Fazendo",
  done: "Feito",
};

const emptyTask = (projectId: string): TaskCreateRequest => ({
  project_id: projectId,
  parent_task_id: null,
  title: "",
  description: "",
  status: "todo",
  tag_ids: [],
  due_date: null,
  due_time: null,
  start_date: null,
  priority: null,
  recurrence_rule: null,
  linked_recurring_id: null,
  external_url: null,
  external_provider: null,
});

function KanbanColumn({ status, children }: { status: TaskStatus; children: ReactNode }) {
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

function KanbanCard({
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

type TaskFormTab = "geral" | "data" | "organizacao" | "registros";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [recurrings, setRecurrings] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [formTab, setFormTab] = useState<TaskFormTab>("geral");
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyTask(id ?? ""));
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, string>>({});
  const [newTaskSubtasks, setNewTaskSubtasks] = useState<string[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [view, setView] = useState<"kanban" | "lista" | "gantt">("kanban");
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [seriesTask, setSeriesTask] = useState<Task | null>(null);
  const [editingSubtask, setEditingSubtask] = useState<Task | null>(null);
  const { toast } = useToast();
  const { runningEntry, start: startTimer, stop: stopTimer } = useActiveTimer();

  async function toggleTimer(task: Task) {
    try {
      if (runningEntry?.task_id === task.id) await stopTimer();
      else await startTimer(task.id);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível atualizar o timer."),
        variant: "destructive",
      });
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useBreadcrumbTitle(project?.name);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [projectData, taskList, dependencyList, tagList, recurringList] = await Promise.all([
        fetchProjectById(id),
        fetchTasks(),
        fetchDependencies(),
        fetchTags(),
        fetchRecurringTransactions(),
      ]);
      setProject(projectData);
      setTasks(taskList.filter((t) => t.project_id === id));
      setDependencies(dependencyList);
      setTags(tagList);
      setRecurrings(recurringList);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível carregar o projeto."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const topLevelByStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] };
    for (const task of tasks) {
      if (
        !task.parent_task_id &&
        !(task.linked_recurring_id && task.linked_installment_number == null)
      ) {
        map[task.status].push(task);
      }
    }
    return map;
  }, [tasks]);

  const subtasksByParent = useMemo(() => groupSubtasksByParent(tasks), [tasks]);

  const visibleTasks = useMemo(
    () =>
      sortTasksByDueDate(
        tasks.filter(
          (t) =>
            !t.parent_task_id &&
            !(t.linked_recurring_id && t.linked_installment_number == null)
        )
      ),
    [tasks]
  );

  const agendaGroups = useMemo(() => {
    const todayIso = formatLocalIsoDate(new Date());
    return groupTasksByAgendaBucket(collapseRecurringSeries(visibleTasks), todayIso);
  }, [visibleTasks]);

  const seriesTasks = useMemo(
    () => (seriesTask ? findSeriesTasks(tasks, seriesTask) : []),
    [tasks, seriesTask]
  );

  const ganttTasks = useMemo(
    () => tasks.filter((t) => !(t.linked_recurring_id && t.linked_installment_number == null)),
    [tasks]
  );

  function toggleExpanded(taskId: string) {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function openCreate(status: TaskStatus) {
    if (!id) return;
    setEditing(null);
    setForm({ ...emptyTask(id), status });
    setNewTaskSubtasks([]);
    setFormTab("geral");
    setOpen(true);
  }

  function openEdit(task: Task) {
    setEditing(task);
    setForm({
      project_id: task.project_id,
      parent_task_id: task.parent_task_id,
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      tag_ids: task.tag_ids,
      due_date: task.due_date,
      due_time: task.due_time ?? null,
      start_date: task.start_date ?? null,
      priority: task.priority ?? null,
      recurrence_rule: task.recurrence_rule,
      linked_recurring_id: task.linked_recurring_id,
      external_url: task.external_url ?? null,
      external_provider: task.external_provider ?? null,
    });
    setNewTaskSubtasks([]);
    setFormTab("geral");
    setOpen(true);
  }

  async function handleCreateTag(name: string, color: string): Promise<Tag> {
    const tag = await createTag({ name, color });
    setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
    return tag;
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setFormTab("geral");
      return;
    }
    const isLinked = !!form.linked_recurring_id;
    const isEditingInstance = !!(editing && editing.linked_installment_number != null);
    const payload = {
      ...form,
      due_date: isLinked && !isEditingInstance ? null : form.due_date,
      due_time: isLinked && !isEditingInstance ? null : form.due_time,
    };
    try {
      if (editing) {
        await updateTask({ id: editing.id, ...payload });
      } else {
        const created = await createTask(payload);
        for (const title of newTaskSubtasks) {
          await createTask({
            ...emptyTask(id!),
            project_id: created.project_id,
            parent_task_id: created.id,
            title,
          });
        }
      }
      toast({ title: "Tarefa salva!", duration: 2000 });
      setOpen(false);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar a tarefa."),
        variant: "destructive",
      });
    }
  }

  async function addSubtaskToEditing(title: string) {
    if (!editing) return;
    try {
      await createTask({
        ...emptyTask(id!),
        project_id: editing.project_id,
        parent_task_id: editing.id,
        title,
      });
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível adicionar a subtarefa."),
        variant: "destructive",
      });
    }
  }

  async function removeExistingSubtask(subtask: SubtaskDraft) {
    if (!subtask.id) return;
    try {
      await deleteTask(subtask.id);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível remover a subtarefa."),
        variant: "destructive",
      });
    }
  }

  async function handleDelete(taskId: string) {
    try {
      await deleteTask(taskId);
      toast({ title: "Tarefa excluída", duration: 2000 });
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível excluir a tarefa."),
        variant: "destructive",
      });
    }
  }

  /** Atualiza o status localmente na hora (sem esperar um reload completo) e reverte se a chamada falhar. */
  async function applyStatusChange(task: Task, nextStatus: TaskStatus, errorMessage: string) {
    if (task.status === nextStatus) return;
    const previous = tasks;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    try {
      await updateTask({ id: task.id, status: nextStatus });
    } catch (error) {
      setTasks(previous);
      toast({
        title: "Erro",
        description: getErrorMessage(error, errorMessage),
        variant: "destructive",
      });
    }
  }

  /** Mesmo princípio de `applyStatusChange`: atualiza na hora, reverte se a chamada falhar. */
  async function saveSubtaskEdit(payload: SubtaskEditPayload) {
    if (!editingSubtask) return;
    const id = editingSubtask.id;
    const previous = tasks;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...payload } : t)));
    setEditingSubtask(null);
    try {
      await updateTask({ id, ...payload });
    } catch (error) {
      setTasks(previous);
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar a subtarefa."),
        variant: "destructive",
      });
    }
  }

  async function moveStatus(task: Task, direction: -1 | 1) {
    const nextIndex = STATUSES.indexOf(task.status) + direction;
    if (nextIndex < 0 || nextIndex >= STATUSES.length) return;
    await applyStatusChange(task, STATUSES[nextIndex], "Não foi possível mover a tarefa.");
  }

  async function toggleSubtask(subtask: Task) {
    await applyStatusChange(
      subtask,
      subtask.status === "done" ? "todo" : "done",
      "Não foi possível atualizar a subtarefa."
    );
  }

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;

    const draggedTask = tasks.find((t) => t.id === active.id);
    if (!draggedTask) return;

    const overId = String(over.id);
    const targetStatus = (STATUSES as string[]).includes(overId)
      ? (overId as TaskStatus)
      : tasks.find((t) => t.id === overId)?.status;
    if (!targetStatus) return;

    await applyStatusChange(draggedTask, targetStatus, "Não foi possível mover a tarefa.");
  }

  async function addSubtask(parent: Task) {
    const title = (subtaskDrafts[parent.id] ?? "").trim();
    if (!title) return;
    try {
      await createTask({
        project_id: parent.project_id,
        parent_task_id: parent.id,
        title,
        description: "",
        status: "todo",
        tag_ids: [],
        due_date: null,
        recurrence_rule: null,
        linked_recurring_id: null,
      });
      setSubtaskDrafts((prev) => ({ ...prev, [parent.id]: "" }));
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível adicionar a subtarefa."),
        variant: "destructive",
      });
    }
  }

  if (!loading && !project) {
    return (
      <PageShell title="Projeto não encontrado" eyebrow="Produtividade">
        <EmptyState
          title="Este projeto não existe mais"
          description="Ele pode ter sido excluído."
          action={
            <Button asChild>
              <Link to="/tasks/projects">Voltar para projetos</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={project?.name ?? "Kanban"}
      description={project?.description ?? "Acompanhe o andamento das tarefas do projeto."}
      eyebrow="Produtividade"
      actions={<Button onClick={() => openCreate("todo")}>Nova tarefa</Button>}
    >
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
          <Link to="/tasks/projects" aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <span className="text-xs text-muted-foreground">Projetos</span>
      </div>

      {loading ? (
        <TableLoadingSkeleton rows={4} columns={3} />
      ) : (
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
            <TabsTrigger value="lista">Lista</TabsTrigger>
            <TabsTrigger value="gantt">Gantt</TabsTrigger>
          </TabsList>

          <TabsContent value="kanban" className="mt-4">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="grid gap-4 md:grid-cols-3">
                {STATUSES.map((status, colIndex) => (
                  <div key={status} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">
                        {STATUS_LABELS[status]}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({topLevelByStatus[status].length})
                        </span>
                      </h3>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openCreate(status)}
                        aria-label={`Nova tarefa em ${STATUS_LABELS[status]}`}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    <SortableContext
                      items={topLevelByStatus[status].map((task) => task.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <KanbanColumn status={status}>
                        {topLevelByStatus[status].length === 0 ? (
                          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                            Nenhuma tarefa
                          </p>
                        ) : (
                          topLevelByStatus[status].map((task) => {
                            const subtasks = subtasksByParent.get(task.id) ?? [];
                            return (
                              <KanbanCard
                                key={task.id}
                                task={task}
                                colIndex={colIndex}
                                subtasks={subtasks}
                                allTags={tags}
                                subtaskDraft={subtaskDrafts[task.id] ?? ""}
                                onSubtaskDraftChange={(value) =>
                                  setSubtaskDrafts((prev) => ({ ...prev, [task.id]: value }))
                                }
                                onAddSubtask={() => addSubtask(task)}
                                onToggleSubtask={toggleSubtask}
                                onOpenSubtask={(subtask) => setEditingSubtask(subtask)}
                                onEdit={() => openEdit(task)}
                                onDelete={() => handleDelete(task.id)}
                                onMoveStatus={(direction) => moveStatus(task, direction)}
                                isTimerRunning={runningEntry?.task_id === task.id}
                                onToggleTimer={() => toggleTimer(task)}
                              />
                            );
                          })
                        )}
                      </KanbanColumn>
                    </SortableContext>
                  </div>
                ))}
              </div>
              <DragOverlay>
                {activeTask ? (
                  <article className="space-y-2 rounded-xl border bg-card p-3 shadow-lg">
                    <p className="truncate text-sm font-medium">{activeTask.title}</p>
                  </article>
                ) : null}
              </DragOverlay>
            </DndContext>
          </TabsContent>

          <TabsContent value="lista" className="mt-4 space-y-5">
            {visibleTasks.length === 0 ? (
              <EmptyState
                icon={ListTodo}
                title="Nenhuma tarefa"
                description="Crie sua primeira tarefa neste projeto."
              />
            ) : (
              AGENDA_BUCKET_ORDER.filter((bucket) => agendaGroups[bucket].length > 0).map(
                (bucket) => (
                  <div key={bucket} className="space-y-2">
                    <h3 className="text-sm font-semibold">
                      {AGENDA_BUCKET_LABELS[bucket]}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({agendaGroups[bucket].length})
                      </span>
                    </h3>
                    <div className="space-y-2">
                      {agendaGroups[bucket].map((task) => (
                        <TaskListRow
                          key={task.id}
                          task={task}
                          subtasks={subtasksByParent.get(task.id) ?? []}
                          allTags={tags}
                          expanded={expandedTasks.has(task.id)}
                          onToggleExpand={() => toggleExpanded(task.id)}
                          onToggleSubtask={toggleSubtask}
                          onOpenSubtask={(subtask) => setEditingSubtask(subtask)}
                          onToggleDone={() => toggleSubtask(task)}
                          onOpenSeries={() => setSeriesTask(task)}
                          onEdit={() => openEdit(task)}
                          onDelete={() => handleDelete(task.id)}
                          isTimerRunning={runningEntry?.task_id === task.id}
                          onToggleTimer={() => toggleTimer(task)}
                          extraActions={
                            task.status === "done" && !task.linked_recurring_id ? (
                              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" asChild>
                                <Link
                                  to={`/finance/transactions?new=1&nature=despesa&desc=${encodeURIComponent(task.title)}`}
                                >
                                  Lançar transação
                                </Link>
                              </Button>
                            ) : undefined
                          }
                        />
                      ))}
                    </div>
                  </div>
                )
              )
            )}
          </TabsContent>

          <TabsContent value="gantt" className="mt-4">
            <GanttChart tasks={ganttTasks} dependencies={dependencies} onDataChanged={load} />
          </TabsContent>
        </Tabs>
      )}

      <SubtaskEditDialog
        subtask={editingSubtask}
        onOpenChange={(v) => !v && setEditingSubtask(null)}
        onSave={saveSubtaskEdit}
      />

      <Dialog open={!!seriesTask} onOpenChange={(v) => !v && setSeriesTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ocorrências de "{seriesTask?.title}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            {seriesTasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-2.5 text-sm"
              >
                <span>{t.due_date ? formatDateTimeBR(t.due_date, t.due_time) : "Sem prazo"}</span>
                <Badge variant="outline" className="text-[10px]">
                  {t.status === "todo" ? "A fazer" : t.status === "doing" ? "Fazendo" : "Feito"}
                </Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
          </DialogHeader>
          <Tabs value={formTab} onValueChange={(v) => setFormTab(v as TaskFormTab)}>
            <TabsList className="grid w-full grid-cols-3 sm:grid-cols-4">
              <TabsTrigger value="geral">Geral</TabsTrigger>
              <TabsTrigger value="data">Data e repetição</TabsTrigger>
              <TabsTrigger value="organizacao">Organização</TabsTrigger>
              {editing && <TabsTrigger value="registros">Registros de tempo</TabsTrigger>}
            </TabsList>

            <TabsContent value="geral" className={cn(FORM_FIELDS_CLASS, "mt-4")}>
              <div>
                <FormLabel required>Título</FormLabel>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div>
                <FormLabel optional>Descrição</FormLabel>
                <TaskDescriptionField
                  value={form.description ?? ""}
                  onChange={(description) => setForm({ ...form, description })}
                />
              </div>
              <TaskPriorityField
                value={form.priority ?? null}
                onChange={(priority) => setForm({ ...form, priority })}
              />
            </TabsContent>

            <TabsContent value="data" className={cn(FORM_FIELDS_CLASS, "mt-4")}>
              <TaskRecurrenceField
                value={{
                  due_date: form.due_date,
                  due_time: form.due_time,
                  start_date: form.start_date,
                  recurrence_rule: form.recurrence_rule,
                  linked_recurring_id: form.linked_recurring_id,
                }}
                recurrings={recurrings}
                onChange={(next) => setForm({ ...form, ...next })}
              />
            </TabsContent>

            <TabsContent value="organizacao" className={cn(FORM_FIELDS_CLASS, "mt-4")}>
              <div>
                <FormLabel optional>Tags</FormLabel>
                <TagCombobox
                  allTags={tags}
                  selectedIds={form.tag_ids}
                  onChange={(tag_ids) => setForm({ ...form, tag_ids })}
                  onCreateTag={handleCreateTag}
                />
              </div>
              <div>
                <FormLabel optional>Link externo</FormLabel>
                <Input
                  value={form.external_url ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      external_url: e.target.value || null,
                      external_provider: detectExternalProvider(e.target.value),
                    })
                  }
                  placeholder="https://github.com/owner/repo/issues/123"
                />
              </div>
              <TaskSubtasksField
                subtasks={
                  editing
                    ? (subtasksByParent.get(editing.id) ?? []).map((s) => ({ id: s.id, title: s.title }))
                    : newTaskSubtasks.map((title) => ({ title }))
                }
                onAdd={(title) =>
                  editing ? addSubtaskToEditing(title) : setNewTaskSubtasks((prev) => [...prev, title])
                }
                onRemove={(subtask, index) =>
                  editing
                    ? removeExistingSubtask(subtask)
                    : setNewTaskSubtasks((prev) => prev.filter((_, i) => i !== index))
                }
              />
            </TabsContent>

            {editing && (
              <TabsContent value="registros" className={cn(FORM_FIELDS_CLASS, "mt-4")}>
                <TaskTimeEntriesField taskId={editing.id} />
              </TabsContent>
            )}
          </Tabs>
          <Button onClick={handleSave} className="w-full">
            {editing ? "Salvar alterações" : "Criar tarefa"}
          </Button>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
