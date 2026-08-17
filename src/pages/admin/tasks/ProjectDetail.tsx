import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ListTodo, Plus, Timer } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { type SubtaskDraft } from "./TaskSubtasksField";
import { type TaskIconValue } from "./TaskIconPicker";
import {
  CompletedTasksSection,
  KanbanCard,
  KanbanColumn,
  STATUSES,
  STATUS_LABELS,
  TaskListRow,
  type SubtaskRowActions,
} from "./TaskViews";
import { TaskFormFields, type TaskFormTab } from "./TaskFormFields";
import { GanttChart } from "./GanttChart";
import { formatTimeOfDay } from "./TimeEntryRow";
import { FORM_DIALOG_CONTENT_CLASS } from "@/components/FormLabel";
import { PageShell } from "@/components/PageShell";
import { ProjectShoppingSection } from "@/pages/admin/shopping/ProjectShoppingSection";
import { ProjectNotesSection } from "@/pages/admin/notes/ProjectNotesSection";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import {
  createTag,
  createTask,
  deleteTask,
  deleteTasks,
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
  filterTasksByStatusView,
  findSeriesTasks,
  groupSubtasksByParent,
  groupTasksByAgendaBucket,
  isDoseLate,
  isSubtaskDueDateValid,
  sortTasksByCompletedAtDesc,
  sortTasksByDueDate,
} from "@/domain/tasks";
import type { AgendaBucket, TaskStatusView } from "@/domain/tasks";
import {
  addSubtaskToEditing as addSubtaskDraftToEditing,
  emptyTask,
  removeExistingSubtask as removeExistingSubtaskDraft,
  type SubtaskMutationContext,
} from "@/domain/tasks/taskDraft";
import type {
  Project,
  Tag,
  Task,
  TaskDependency,
  TaskPriority,
  TaskStatus,
} from "@/types/tasks";
import type { Recurring } from "@/types/recurring";
import { useToast } from "@/hooks/use-toast";
import { useActiveTimer } from "@/hooks/useActiveTimer";
import { useBreadcrumbTitle } from "@/hooks/useBreadcrumbTitle";
import { useDimensions } from "@/hooks/useDimensions";
import { getErrorMessage } from "@/lib/errors";
import { formatLocalIsoDate } from "@/lib/dates";
import { formatDateBR, formatDateTimeBR } from "@/lib/currency";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [recurrings, setRecurrings] = useState<Recurring[]>([]);
  const { dimensions } = useDimensions();
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [formTab, setFormTab] = useState<TaskFormTab>("geral");
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyTask(id ?? ""));
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, string>>({});
  const [newTaskSubtasks, setNewTaskSubtasks] = useState<string[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [view, setView] = useState<"kanban" | "lista" | "gantt">("kanban");
  const [statusView, setStatusView] = useState<TaskStatusView>("pending");
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [seriesTask, setSeriesTask] = useState<Task | null>(null);
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

  /** Snapshot de `due_date` por tarefa, como veio do último `load()` — mesma técnica de
   * `TaskList.tsx` pra editar o prazo inline (`handleDueChange`) não mover o card na hora. */
  const frozenDueDatesRef = useRef<Map<string, string | null>>(new Map());

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
      const projectTasks = taskList.filter((t) => t.project_id === id);
      frozenDueDatesRef.current = new Map(projectTasks.map((t) => [t.id, t.due_date]));
      setTasks(projectTasks);
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

  const listTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          !t.parent_task_id &&
          !(t.linked_recurring_id && t.linked_installment_number == null)
      ),
    [tasks]
  );

  const showPending = statusView === "pending" || statusView === "all";
  const showDone = statusView === "done" || statusView === "all";

  /** Envolve tarefas com o `due_date` congelado (`frozenDueDatesRef`) pra usar como chave de
   * ordenação/bucket sem alterar o objeto `Task` real (o card continua mostrando o prazo live). */
  const withFrozenDueDate = useCallback(
    (list: Task[]) =>
      list.map((task) => ({
        task,
        due_date: frozenDueDatesRef.current.has(task.id)
          ? (frozenDueDatesRef.current.get(task.id) ?? null)
          : task.due_date,
      })),
    []
  );

  const pendingTasks = useMemo(() => {
    return sortTasksByDueDate(withFrozenDueDate(filterTasksByStatusView(listTasks, "pending"))).map(
      (entry) => entry.task
    );
  }, [listTasks, withFrozenDueDate]);

  const doneTasks = useMemo(
    () => sortTasksByCompletedAtDesc(filterTasksByStatusView(listTasks, "done")),
    [listTasks]
  );

  const listNothingToShow =
    (!showPending || pendingTasks.length === 0) && (!showDone || doneTasks.length === 0);

  const agendaGroups = useMemo(() => {
    const todayIso = formatLocalIsoDate(new Date());
    const grouped = groupTasksByAgendaBucket(
      withFrozenDueDate(collapseRecurringSeries(pendingTasks)),
      todayIso
    );
    return Object.fromEntries(
      AGENDA_BUCKET_ORDER.map((bucket) => [bucket, grouped[bucket].map((entry) => entry.task)])
    ) as Record<AgendaBucket, Task[]>;
  }, [pendingTasks, withFrozenDueDate]);

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
      icon_key: task.icon_key ?? null,
      icon_url: task.icon_url ?? null,
      is_milestone: task.is_milestone ?? false,
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
    if (form.parent_task_id) {
      const parentTask = tasks.find((t) => t.id === form.parent_task_id);
      if (parentTask && !isSubtaskDueDateValid(form.due_date, parentTask.due_date)) {
        setFormTab("data");
        toast({
          title: "Erro",
          description: `O prazo não pode passar de ${formatDateBR(parentTask.due_date)}, prazo da tarefa principal.`,
          variant: "destructive",
        });
        return;
      }
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

  /** Contexto compartilhado pelas mutações de subtarefa extraídas pra `taskDraft.ts` (feature
   * 042) — cada call site injeta suas próprias `createTask`/`deleteTask`/`load`/`toast`. */
  const subtaskMutationCtx: SubtaskMutationContext = {
    editing,
    createTask,
    deleteTask,
    onSuccess: load,
    onError: (message) => toast({ title: "Erro", description: message, variant: "destructive" }),
  };

  async function addSubtaskToEditing(title: string) {
    await addSubtaskDraftToEditing(subtaskMutationCtx, title);
  }

  async function removeExistingSubtask(subtask: SubtaskDraft) {
    await removeExistingSubtaskDraft(subtaskMutationCtx, subtask);
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

  async function handleDeleteSeries(ids: string[]) {
    try {
      await deleteTasks(ids);
      toast({ title: "Ocorrências excluídas", duration: 2000 });
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível excluir as ocorrências."),
        variant: "destructive",
      });
    }
  }

  /** Edição rápida inline da aba Lista (feature 029) — prioridade e prazo/horário direto no card,
   * sem abrir o form completo. Projeto fica de fora aqui: todas as tarefas já pertencem a este
   * projeto, não há ambiguidade a resolver. */
  async function handlePriorityChange(taskId: string, priority: TaskPriority | null) {
    try {
      await updateTask({ id: taskId, priority });
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível atualizar a prioridade."),
        variant: "destructive",
      });
    }
  }

  /** Diferente de `handlePriorityChange` (que chama `load()`), atualiza só localmente —
   * `load()` também atualizaria `frozenDueDatesRef` (o snapshot que trava a posição/bucket da
   * tarefa), fazendo o card pular pro bucket novo na hora. */
  async function handleDueChange(
    taskId: string,
    next: { due_date: string | null; due_time: string | null; estimated_duration: number | null }
  ) {
    try {
      await updateTask({ id: taskId, ...next });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...next } : t)));
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível atualizar o prazo."),
        variant: "destructive",
      });
    }
  }

  async function handleIconChange(taskId: string, next: TaskIconValue) {
    try {
      await updateTask({ id: taskId, ...next });
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível atualizar o ícone."),
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

  /** Quick actions da linha aninhada de subtarefa na Lista (feature 046) — mesmos handlers já
   * usados pela linha de topo, só parametrizados por subtarefa em vez de já vir bindados por
   * `TaskListRow`. Projeto fica de fora: todas as tarefas já pertencem a este projeto, mesma
   * regra já seguida pela linha de topo aqui (sem `onProjectChange`/`projects`). */
  const subtaskActions: SubtaskRowActions = {
    onDelete: (subtask) => handleDelete(subtask.id),
    onStatusChange: (subtask, status) =>
      applyStatusChange(subtask, status, "Não foi possível atualizar a subtarefa."),
    onOpenSeries: (subtask) => setSeriesTask(subtask),
    isTimerRunning: (subtask) => runningEntry?.task_id === subtask.id,
    onToggleTimer: (subtask) => toggleTimer(subtask),
    onIconChange: (subtask, next) => handleIconChange(subtask.id, next),
    onPriorityChange: (subtask, priority) => handlePriorityChange(subtask.id, priority),
    onDueChange: (subtask, next) => handleDueChange(subtask.id, next),
  };

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
      actions={
        <>
          <Button variant="outline" asChild>
            <Link to={`/tasks/live?project=${id}`}>
              <Timer className="h-4 w-4" />
              Registros de tempo
            </Link>
          </Button>
          <Button onClick={() => openCreate("todo")}>Nova tarefa</Button>
        </>
      }
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
                                allTasks={tasks}
                                colIndex={colIndex}
                                subtasks={subtasks}
                                allTags={tags}
                                subtaskDraft={subtaskDrafts[task.id] ?? ""}
                                onSubtaskDraftChange={(value) =>
                                  setSubtaskDrafts((prev) => ({ ...prev, [task.id]: value }))
                                }
                                onAddSubtask={() => addSubtask(task)}
                                onToggleSubtask={toggleSubtask}
                                onOpenSubtask={openEdit}
                                onEdit={() => openEdit(task)}
                                onDelete={() => handleDelete(task.id)}
                                onDeleteAll={handleDeleteSeries}
                                onMoveStatus={(direction) => moveStatus(task, direction)}
                                isTimerRunning={runningEntry?.task_id === task.id}
                                onToggleTimer={() => toggleTimer(task)}
                                onIconChange={(next) => handleIconChange(task.id, next)}
                                onPriorityChange={(priority) => handlePriorityChange(task.id, priority)}
                                onDueChange={(next) => handleDueChange(task.id, next)}
                                subtaskActions={subtaskActions}
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
            <Select value={statusView} onValueChange={(v) => setStatusView(v as TaskStatusView)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="done">Concluídas</SelectItem>
                <SelectItem value="all">Todas</SelectItem>
              </SelectContent>
            </Select>

            {listNothingToShow ? (
              <EmptyState
                icon={ListTodo}
                title="Nenhuma tarefa"
                description="Crie sua primeira tarefa neste projeto."
                action={<Button onClick={() => openCreate("todo")}>Nova tarefa</Button>}
              />
            ) : (
              <>
                {showPending &&
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
                              allTasks={tasks}
                              subtasks={subtasksByParent.get(task.id) ?? []}
                              allTags={tags}
                              expanded={expandedTasks.has(task.id)}
                              onToggleExpand={() => toggleExpanded(task.id)}
                              onToggleSubtask={toggleSubtask}
                              onOpenSubtask={openEdit}
                              onToggleDone={() => toggleSubtask(task)}
                              onStatusChange={(status) =>
                                applyStatusChange(task, status, "Não foi possível atualizar a tarefa.")
                              }
                              onOpenSeries={() => setSeriesTask(task)}
                              onEdit={() => openEdit(task)}
                              onDelete={() => handleDelete(task.id)}
                              onDeleteAll={handleDeleteSeries}
                              isTimerRunning={runningEntry?.task_id === task.id}
                              onToggleTimer={() => toggleTimer(task)}
                              onIconChange={(next) => handleIconChange(task.id, next)}
                              onPriorityChange={(priority) => handlePriorityChange(task.id, priority)}
                              onDueChange={(next) => handleDueChange(task.id, next)}
                              subtaskActions={subtaskActions}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  )}
                {showDone && (
                  <CompletedTasksSection
                    key={statusView}
                    tasks={doneTasks}
                    allTasks={tasks}
                    allTags={tags}
                    subtasksByParent={subtasksByParent}
                    expandedTasks={expandedTasks}
                    onToggleExpand={toggleExpanded}
                    onToggleSubtask={toggleSubtask}
                    onOpenSubtask={openEdit}
                    onToggleDone={toggleSubtask}
                    onStatusChange={(task, status) =>
                      applyStatusChange(task, status, "Não foi possível atualizar a tarefa.")
                    }
                    onOpenSeries={(task) => setSeriesTask(task)}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onDeleteAll={handleDeleteSeries}
                    isTimerRunning={(task) => runningEntry?.task_id === task.id}
                    defaultOpen={statusView === "done"}
                    onIconChange={(task, next) => handleIconChange(task.id, next)}
                    onPriorityChange={(task, priority) => handlePriorityChange(task.id, priority)}
                    onDueChange={(task, next) => handleDueChange(task.id, next)}
                    subtaskActions={subtaskActions}
                    extraActions={(task) =>
                      !task.linked_recurring_id ? (
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
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="gantt" className="mt-4">
            <GanttChart
              tasks={ganttTasks}
              dependencies={dependencies}
              fullTasks={ganttTasks}
              fullProjects={project ? [project] : []}
              onOpenTask={openEdit}
              onDataChanged={load}
              onIconChange={handleIconChange}
              onPriorityChange={handlePriorityChange}
              onDueChange={handleDueChange}
            />
          </TabsContent>
        </Tabs>
      )}

      {/*
        Fora das abas de propósito: as abas alternam entre visões das *tarefas* do projeto, e
        compras não é uma quarta visão de tarefa — é outra entidade ligada ao projeto, que deve
        continuar visível independentemente da aba escolhida (feature 052).
      */}
      {!loading && id && <ProjectShoppingSection projectId={id} />}

      {/* Mesma razão da seção acima: nota é outra entidade ligada ao projeto (feature 055). */}
      {!loading && id && <ProjectNotesSection projectId={id} />}

      <Dialog open={!!seriesTask} onOpenChange={(v) => !v && setSeriesTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ocorrências de "{seriesTask?.title}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            {seriesTask?.is_medication && !seriesTasks.some((t) => t.status === "done") && (
              <p className="text-xs text-muted-foreground">Nenhuma dose registrada ainda.</p>
            )}
            {seriesTasks.map((t) => {
              const isDose = seriesTask?.is_medication && t.status === "done" && t.completed_at;
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card p-2.5 text-sm"
                >
                  {isDose ? (
                    <span className="flex items-center gap-2">
                      Tomado às {formatTimeOfDay(t.completed_at as string)}
                      {isDoseLate(t) && (
                        <Badge variant="destructive" className="text-[10px]">
                          Atrasada
                        </Badge>
                      )}
                    </span>
                  ) : (
                    <span>{t.due_date ? formatDateTimeBR(t.due_date, t.due_time) : "Sem prazo"}</span>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {t.status === "todo" ? "A fazer" : t.status === "doing" ? "Fazendo" : "Feito"}
                  </Badge>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
          </DialogHeader>
          <TaskFormFields
            formTab={formTab}
            onFormTabChange={setFormTab}
            form={form}
            setForm={setForm}
            editing={editing}
            tasks={tasks}
            tags={tags}
            onCreateTag={handleCreateTag}
            recurrings={recurrings}
            onRecurringCreated={(rec) => setRecurrings((prev) => [rec, ...prev])}
            dimensions={dimensions}
            subtasks={
              editing
                ? (subtasksByParent.get(editing.id) ?? []).map((s) => ({ id: s.id, title: s.title }))
                : newTaskSubtasks.map((title) => ({ title }))
            }
            onAddSubtask={(title) =>
              editing ? addSubtaskToEditing(title) : setNewTaskSubtasks((prev) => [...prev, title])
            }
            onRemoveSubtask={(subtask, index) =>
              editing
                ? removeExistingSubtask(subtask)
                : setNewTaskSubtasks((prev) => prev.filter((_, i) => i !== index))
            }
          />
          <Button onClick={handleSave} className="w-full">
            {editing ? "Salvar alterações" : "Criar tarefa"}
          </Button>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
