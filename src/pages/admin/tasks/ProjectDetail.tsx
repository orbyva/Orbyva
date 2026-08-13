import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
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
import { TaskRecurrenceField } from "./TaskRecurrenceField";
import { TaskSubtasksField, type SubtaskDraft } from "./TaskSubtasksField";
import { TaskDescriptionField } from "./TaskDescriptionField";
import { TaskTimeEntriesField } from "./TaskTimeEntriesField";
import { SubtaskEditDialog, type SubtaskEditPayload } from "./SubtaskEditDialog";
import { TaskPriorityField } from "./TaskPriorityField";
import {
  CompletedTasksSection,
  KanbanCard,
  KanbanColumn,
  STATUSES,
  STATUS_LABELS,
  TaskListRow,
} from "./TaskViews";
import { TagCombobox } from "./TagCombobox";
import { GanttChart } from "./GanttChart";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
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
  filterTasksByStatusView,
  findSeriesTasks,
  groupSubtasksByParent,
  groupTasksByAgendaBucket,
  sortTasksByCompletedAtDesc,
  sortTasksByDueDate,
} from "@/domain/tasks";
import type { TaskStatusView } from "@/domain/tasks";
import type { Project, Tag, Task, TaskCreateRequest, TaskDependency, TaskStatus } from "@/types/tasks";
import type { Recurring } from "@/types/recurring";
import { useToast } from "@/hooks/use-toast";
import { useActiveTimer } from "@/hooks/useActiveTimer";
import { useBreadcrumbTitle } from "@/hooks/useBreadcrumbTitle";
import { useDimensions } from "@/hooks/useDimensions";
import { getErrorMessage } from "@/lib/errors";
import { formatLocalIsoDate } from "@/lib/dates";
import { formatDateTimeBR } from "@/lib/currency";
import { cn } from "@/lib/utils";

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

type TaskFormTab = "geral" | "data" | "organizacao" | "registros";

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

  const pendingTasks = useMemo(
    () => sortTasksByDueDate(filterTasksByStatusView(listTasks, "pending")),
    [listTasks]
  );

  const doneTasks = useMemo(
    () => sortTasksByCompletedAtDesc(filterTasksByStatusView(listTasks, "done")),
    [listTasks]
  );

  const listNothingToShow =
    (!showPending || pendingTasks.length === 0) && (!showDone || doneTasks.length === 0);

  const agendaGroups = useMemo(() => {
    const todayIso = formatLocalIsoDate(new Date());
    return groupTasksByAgendaBucket(collapseRecurringSeries(pendingTasks), todayIso);
  }, [pendingTasks]);

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
                              subtasks={subtasksByParent.get(task.id) ?? []}
                              allTags={tags}
                              expanded={expandedTasks.has(task.id)}
                              onToggleExpand={() => toggleExpanded(task.id)}
                              onToggleSubtask={toggleSubtask}
                              onOpenSubtask={(subtask) => setEditingSubtask(subtask)}
                              onToggleDone={() => toggleSubtask(task)}
                              onStatusChange={(status) =>
                                applyStatusChange(task, status, "Não foi possível atualizar a tarefa.")
                              }
                              onOpenSeries={() => setSeriesTask(task)}
                              onEdit={() => openEdit(task)}
                              onDelete={() => handleDelete(task.id)}
                              isTimerRunning={runningEntry?.task_id === task.id}
                              onToggleTimer={() => toggleTimer(task)}
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
                    allTags={tags}
                    subtasksByParent={subtasksByParent}
                    expandedTasks={expandedTasks}
                    onToggleExpand={toggleExpanded}
                    onToggleSubtask={toggleSubtask}
                    onOpenSubtask={(subtask) => setEditingSubtask(subtask)}
                    onToggleDone={toggleSubtask}
                    onStatusChange={(task, status) =>
                      applyStatusChange(task, status, "Não foi possível atualizar a tarefa.")
                    }
                    onOpenSeries={(task) => setSeriesTask(task)}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    isTimerRunning={(task) => runningEntry?.task_id === task.id}
                    defaultOpen={statusView === "done"}
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
            <GanttChart tasks={ganttTasks} dependencies={dependencies} onDataChanged={load} />
          </TabsContent>
        </Tabs>
      )}

      <SubtaskEditDialog
        subtask={editingSubtask}
        parentDueDate={tasks.find((t) => t.id === editingSubtask?.parent_task_id)?.due_date ?? null}
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
                dimensions={dimensions}
                onRecurringCreated={(rec) => setRecurrings((prev) => [rec, ...prev])}
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
