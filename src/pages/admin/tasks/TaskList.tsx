import { ListTodo, Pill, Tag as TagIcon, Timer } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatLocalIsoDate } from "@/lib/dates";
import { formatDateBR, formatDateTimeBR } from "@/lib/currency";
import { ProjectsRail } from "./ProjectsRail";
import { TaskQuadrant } from "./TaskQuadrant";
import { type TaskIconValue } from "./TaskIconPicker";
import { type SubtaskDraft } from "./TaskSubtasksField";
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
import { EmptyState } from "@/components/EmptyState";
import { FORM_DIALOG_CONTENT_CLASS_LG } from "@/components/FormLabel";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { GanttChart } from "./GanttChart";
import { AgendaGrid } from "./AgendaGrid";
import { MedicationQuickCreateDialog } from "./MedicationQuickCreateDialog";
import { formatTimeOfDay } from "./TimeEntryRow";
import {
  createTag,
  createTask,
  deleteTask,
  deleteTasks,
  fetchDependencies,
  fetchProjects,
  fetchTags,
  fetchTasks,
  updateTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import {
  AGENDA_BUCKET_LABELS,
  AGENDA_BUCKET_ORDER,
  bucketForDueDate,
  collapseRecurringSeries,
  filterTasks,
  filterTasksByStatusView,
  findSeriesTasks,
  groupSubtasksByParent,
  groupTasksByAgendaBucket,
  isDoseLate,
  isSubtaskDueDateValid,
  PRIORITY_OPTIONS,
  rankProjectsByActivity,
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
  TaskCreateRequest,
  TaskDependency,
  TaskPriority,
  TaskStatus,
} from "@/types/tasks";
import type { Recurring } from "@/types/recurring";
import { useToast } from "@/hooks/use-toast";
import { useActiveTimer } from "@/hooks/useActiveTimer";
import { useDimensions } from "@/hooks/useDimensions";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TaskViewMode = "lista" | "kanban" | "gantt" | "agenda";
const TASK_VIEW_MODES: TaskViewMode[] = ["lista", "kanban", "gantt", "agenda"];

export default function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [recurrings, setRecurrings] = useState<Recurring[]>([]);
  const { dimensions } = useDimensions();
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [medicationDialogOpen, setMedicationDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [formTab, setFormTab] = useState<TaskFormTab>("geral");
  const [form, setForm] = useState(emptyTask());
  // `?view=` só é lido na primeira renderização (redirecionamento de `/tasks/gantt`, removido na
  // feature 044 por ser redundante com esta aba — ver Notas): não sincroniza de volta pra URL a
  // cada troca de aba, então navegar pelas abas depois não deixa `?view=` desatualizado na barra
  // de endereço, de propósito — mesma convenção "estado local" já usada pelas outras abas aqui.
  const [searchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<TaskViewMode>(() => {
    const requested = searchParams.get("view");
    return TASK_VIEW_MODES.includes(requested as TaskViewMode) ? (requested as TaskViewMode) : "lista";
  });
  const [tagFilter, setTagFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [statusView, setStatusView] = useState<TaskStatusView>("pending");
  /** Chips de filtro rápido da aba Lista — só afetam essa aba (Kanban/Gantt seguem usando
   * `visibleTasks`/`ganttTasks` sem esse recorte). */
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | null>(null);
  const [todayOnly, setTodayOnly] = useState(false);
  const [subtaskDrafts, setSubtaskDrafts] = useState<string[]>([]);
  const [kanbanSubtaskDrafts, setKanbanSubtaskDrafts] = useState<Record<string, string>>({});
  const [seriesTask, setSeriesTask] = useState<Task | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const { toast } = useToast();
  const { runningEntry, start: startTimer, stop: stopTimer } = useActiveTimer();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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

  /** Snapshot de `due_date` por tarefa, como veio do último `load()` — usado só para decidir
   * bucket/ordem por prazo na Lista (`pendingTasks`/`agendaGroups`), pra editar o prazo inline
   * (`handleDueChange`) não mover o card na hora, fazendo o usuário perder o foco dele. O valor
   * exibido no `TaskDueQuickEdit` continua vindo de `tasks` (live), só a posição fica "congelada"
   * até a próxima recarga real. */
  const frozenDueDatesRef = useRef<Map<string, string | null>>(new Map());

  const load = useCallback(async () => {
    try {
      const [taskList, projectList, tagList, recurringList, dependencyList] = await Promise.all([
        fetchTasks(),
        fetchProjects(),
        fetchTags(),
        fetchRecurringTransactions(),
        fetchDependencies(),
      ]);
      frozenDueDatesRef.current = new Map(taskList.map((t) => [t.id, t.due_date]));
      setTasks(taskList);
      setProjects(projectList);
      setTags(tagList);
      setRecurrings(recurringList);
      setDependencies(dependencyList);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível carregar as tarefas."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleTasks = useMemo(() => {
    const projectId =
      projectFilter === "all" ? undefined : projectFilter === "null" ? null : projectFilter;
    const filtered = filterTasks(tasks, {
      tagId: tagFilter || undefined,
      projectId,
    });
    return filtered.filter(
      (t) =>
        !t.parent_task_id &&
        !(t.linked_recurring_id && t.linked_installment_number == null)
    );
  }, [tasks, tagFilter, projectFilter]);

  const showPending = statusView === "pending" || statusView === "all";
  const showDone = statusView === "done" || statusView === "all";

  const todayIso = useMemo(() => formatLocalIsoDate(new Date()), []);

  /** Chips de Prioridade/"Hoje" — só entram na aba Lista (Kanban/Gantt usam `visibleTasks` puro). */
  const applyListQuickFilters = useCallback(
    (list: Task[]) => {
      const withPriority = priorityFilter ? filterTasks(list, { priority: priorityFilter }) : list;
      return todayOnly
        ? withPriority.filter((t) => bucketForDueDate(t.due_date, todayIso) === "today")
        : withPriority;
    },
    [priorityFilter, todayOnly, todayIso]
  );

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
    const sorted = sortTasksByDueDate(
      withFrozenDueDate(filterTasksByStatusView(visibleTasks, "pending"))
    ).map((entry) => entry.task);
    return applyListQuickFilters(sorted);
  }, [visibleTasks, applyListQuickFilters, withFrozenDueDate]);

  const doneTasks = useMemo(
    () => applyListQuickFilters(sortTasksByCompletedAtDesc(filterTasksByStatusView(visibleTasks, "done"))),
    [visibleTasks, applyListQuickFilters]
  );

  const agendaGroups = useMemo(() => {
    const grouped = groupTasksByAgendaBucket(
      withFrozenDueDate(collapseRecurringSeries(pendingTasks)),
      todayIso
    );
    return Object.fromEntries(
      AGENDA_BUCKET_ORDER.map((bucket) => [bucket, grouped[bucket].map((entry) => entry.task)])
    ) as Record<AgendaBucket, Task[]>;
  }, [pendingTasks, todayIso, withFrozenDueDate]);

  /** Projeto específico selecionado na `ProjectsRail` — "all"/"null" não contam. */
  const quadrantProjectTasks = useMemo(() => {
    if (projectFilter === "all" || projectFilter === "null") return null;
    return pendingTasks;
  }, [pendingTasks, projectFilter]);

  const nothingToShow =
    (!showPending || pendingTasks.length === 0) && (!showDone || doneTasks.length === 0);

  const seriesTasks = useMemo(
    () => (seriesTask ? findSeriesTasks(tasks, seriesTask) : []),
    [tasks, seriesTask]
  );

  const subtasksByParent = useMemo(() => groupSubtasksByParent(tasks), [tasks]);

  // Ordenação usada pelo `ProjectPicker` do formulário de tarefa — projetos mais ativos primeiro.
  const projectsByActivity = useMemo(
    () => rankProjectsByActivity(projects, tasks),
    [projects, tasks]
  );

  // Gantt precisa das subtarefas também (a lib hierarquiza pai→filho sozinha), diferente de
  // `visibleTasks` (que já exclui subtarefas pras outras visões).
  const ganttTasks = useMemo(() => {
    const projectId =
      projectFilter === "all" ? undefined : projectFilter === "null" ? null : projectFilter;
    return filterTasks(tasks, { tagId: tagFilter || undefined, projectId }).filter(
      (t) => !(t.linked_recurring_id && t.linked_installment_number == null)
    );
  }, [tasks, tagFilter, projectFilter]);

  const topLevelByStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] };
    for (const task of visibleTasks) {
      map[task.status].push(task);
    }
    return map;
  }, [visibleTasks]);

  function toggleExpanded(taskId: string) {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  /** Atualiza o status localmente na hora (sem esperar um reload completo) e reverte se a chamada falhar. */
  async function applyStatusChange(task: Task, nextStatus: TaskStatus) {
    if (task.status === nextStatus) return;
    const previous = tasks;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    try {
      await updateTask({ id: task.id, status: nextStatus });
    } catch (error) {
      setTasks(previous);
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível atualizar a tarefa."),
        variant: "destructive",
      });
    }
  }

  function toggleDone(task: Task) {
    return applyStatusChange(task, task.status === "done" ? "todo" : "done");
  }

  async function moveStatus(task: Task, direction: -1 | 1) {
    const nextIndex = STATUSES.indexOf(task.status) + direction;
    if (nextIndex < 0 || nextIndex >= STATUSES.length) return;
    await applyStatusChange(task, STATUSES[nextIndex]);
  }

  function handleKanbanDragStart(event: DragStartEvent) {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task ?? null);
  }

  async function handleKanbanDragEnd(event: DragEndEvent) {
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

    await applyStatusChange(draggedTask, targetStatus);
  }

  async function addKanbanSubtask(parent: Task) {
    const title = (kanbanSubtaskDrafts[parent.id] ?? "").trim();
    if (!title) return;
    try {
      await createTask({
        ...emptyTask(),
        project_id: parent.project_id,
        parent_task_id: parent.id,
        title,
      });
      setKanbanSubtaskDrafts((prev) => ({ ...prev, [parent.id]: "" }));
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível adicionar a subtarefa."),
        variant: "destructive",
      });
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyTask());
    setSubtaskDrafts([]);
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
    setSubtaskDrafts([]);
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
    const payload: TaskCreateRequest = {
      ...form,
      due_date: isLinked && !isEditingInstance ? null : form.due_date,
      due_time: isLinked && !isEditingInstance ? null : form.due_time,
    };
    try {
      if (editing) {
        await updateTask({ id: editing.id, ...payload });
      } else {
        const created = await createTask(payload);
        for (const title of subtaskDrafts) {
          await createTask({
            ...emptyTask(),
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

  async function handleDelete(id: string) {
    try {
      await deleteTask(id);
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

  /** Edição rápida inline da aba Lista (feature 029) — prioridade, prazo/horário e projeto direto
   * no card, sem abrir o form completo. */
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

  /** Diferente de `handlePriorityChange`/`handleProjectChange` (que chamam `load()`), atualiza só
   * localmente — `load()` também atualizaria `frozenDueDatesRef` (o snapshot que trava a
   * posição/bucket da tarefa), fazendo o card pular pro bucket novo na hora. */
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

  async function handleProjectChange(taskId: string, projectId: string | null) {
    try {
      await updateTask({ id: taskId, project_id: projectId });
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível atualizar o projeto."),
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

  /** Quick actions da linha aninhada de subtarefa na Lista (feature 046) — mesmos handlers já
   * usados pela linha de topo, só parametrizados por subtarefa em vez de já vir bindados por
   * `TaskListRow`. Projeto fica de fora: subtarefa herda o projeto do pai, badge somente-leitura. */
  const subtaskActions: SubtaskRowActions = {
    onDelete: (subtask) => handleDelete(subtask.id),
    onStatusChange: (subtask, status) => applyStatusChange(subtask, status),
    onOpenSeries: (subtask) => setSeriesTask(subtask),
    isTimerRunning: (subtask) => runningEntry?.task_id === subtask.id,
    onToggleTimer: (subtask) => toggleTimer(subtask),
    onIconChange: (subtask, next) => handleIconChange(subtask.id, next),
    onPriorityChange: (subtask, priority) => handlePriorityChange(subtask.id, priority),
    onDueChange: (subtask, next) => handleDueChange(subtask.id, next),
  };

  return (
    <PageShell
      title="Tarefas"
      description="Todas as suas tarefas, com ou sem projeto."
      actions={
        <>
          <Button variant="outline" asChild>
            <Link to="/tasks/live">
              <Timer className="h-4 w-4" />
              Live
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/tasks/tags">
              <TagIcon className="h-4 w-4" />
              Tags
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setMedicationDialogOpen(true)}>
            <Pill className="h-4 w-4" />
            Nova medicação
          </Button>
          <Button onClick={openCreate}>Nova tarefa</Button>
        </>
      }
    >
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as TaskViewMode)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="lista">Lista</TabsTrigger>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
            <TabsTrigger value="gantt">Gantt</TabsTrigger>
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
          </TabsList>
          {viewMode !== "agenda" && (
            <div className="flex flex-wrap gap-2">
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Projeto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os projetos</SelectItem>
                  <SelectItem value="null">Sem projeto</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={tagFilter || "all"}
                onValueChange={(v) => setTagFilter(v === "all" ? "" : v)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as tags</SelectItem>
                  {tags.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {tag.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <TabsContent value="lista" className="mt-4 flex flex-col gap-4 md:flex-row">
          <div className="hidden shrink-0 md:block">
            <ProjectsRail
              projects={projects}
              activeProjectId={projectFilter}
              onSelect={setProjectFilter}
            />
          </div>
          <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
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
            <div className="flex flex-wrap items-center gap-1.5">
              {PRIORITY_OPTIONS.filter(
                (entry): entry is [TaskPriority, string] => entry[0] !== null
              ).map(([p, label]) => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={priorityFilter === p ? "secondary" : "outline"}
                  className={cn("h-7 px-2.5 text-xs", priorityFilter === p && "border border-primary/40")}
                  onClick={() => setPriorityFilter((prev) => (prev === p ? null : p))}
                >
                  {label}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant={todayOnly ? "secondary" : "outline"}
                className={cn("h-7 px-2.5 text-xs", todayOnly && "border border-primary/40")}
                onClick={() => setTodayOnly((prev) => !prev)}
              >
                Hoje
              </Button>
            </div>
          </div>

          {!loading && quadrantProjectTasks && (
            <TaskQuadrant
              tasks={quadrantProjectTasks}
              todayIso={todayIso}
              onSelectTask={openEdit}
            />
          )}

          {loading ? (
            <TableLoadingSkeleton rows={6} />
          ) : nothingToShow ? (
            <EmptyState
              icon={ListTodo}
              title="Nenhuma tarefa"
              description="Crie sua primeira tarefa."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" onClick={() => setMedicationDialogOpen(true)}>
                    <Pill className="h-4 w-4" />
                    Nova medicação
                  </Button>
                  <Button onClick={openCreate}>Nova tarefa</Button>
                </div>
              }
            />
          ) : (
            <div className="space-y-5">
              {showPending && AGENDA_BUCKET_ORDER.filter((bucket) => agendaGroups[bucket].length > 0).map(
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
                          onToggleSubtask={toggleDone}
                          onOpenSubtask={openEdit}
                          onToggleDone={() => toggleDone(task)}
                          onStatusChange={(status) => applyStatusChange(task, status)}
                          onOpenSeries={() => setSeriesTask(task)}
                          onEdit={() => openEdit(task)}
                          onDelete={() => handleDelete(task.id)}
                          onDeleteAll={handleDeleteSeries}
                          isTimerRunning={runningEntry?.task_id === task.id}
                          onToggleTimer={() => toggleTimer(task)}
                          onIconChange={(next) => handleIconChange(task.id, next)}
                          onPriorityChange={(priority) => handlePriorityChange(task.id, priority)}
                          onDueChange={(next) => handleDueChange(task.id, next)}
                          onProjectChange={(projectId) => handleProjectChange(task.id, projectId)}
                          projects={projectsByActivity}
                          subtaskActions={subtaskActions}
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
                  onToggleSubtask={toggleDone}
                  onOpenSubtask={openEdit}
                  onToggleDone={toggleDone}
                  onStatusChange={(task, status) => applyStatusChange(task, status)}
                  onOpenSeries={(task) => setSeriesTask(task)}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onDeleteAll={handleDeleteSeries}
                  isTimerRunning={(task) => runningEntry?.task_id === task.id}
                  defaultOpen={statusView === "done"}
                  onIconChange={(task, next) => handleIconChange(task.id, next)}
                  onPriorityChange={(task, priority) => handlePriorityChange(task.id, priority)}
                  onDueChange={(task, next) => handleDueChange(task.id, next)}
                  onProjectChange={(task, projectId) => handleProjectChange(task.id, projectId)}
                  projects={projectsByActivity}
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
            </div>
          )}
          </div>
        </TabsContent>

        <TabsContent value="kanban" className="mt-4">
          {loading ? (
            <TableLoadingSkeleton rows={6} />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleKanbanDragStart}
              onDragEnd={handleKanbanDragEnd}
            >
              <div className="grid gap-4 md:grid-cols-3">
                {STATUSES.map((status, colIndex) => (
                  <div key={status} className="space-y-3">
                    <h3 className="text-sm font-semibold">
                      {STATUS_LABELS[status]}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({topLevelByStatus[status].length})
                      </span>
                    </h3>
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
                                subtaskDraft={kanbanSubtaskDrafts[task.id] ?? ""}
                                onSubtaskDraftChange={(value) =>
                                  setKanbanSubtaskDrafts((prev) => ({ ...prev, [task.id]: value }))
                                }
                                onAddSubtask={() => addKanbanSubtask(task)}
                                onToggleSubtask={toggleDone}
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
                                onProjectChange={(projectId) => handleProjectChange(task.id, projectId)}
                                projects={projectsByActivity}
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
          )}
        </TabsContent>

        <TabsContent value="gantt" className="mt-4">
          {loading ? (
            <TableLoadingSkeleton rows={6} />
          ) : (
            <GanttChart
              tasks={ganttTasks}
              projects={projects}
              dependencies={dependencies}
              fullTasks={ganttTasks}
              fullProjects={projects}
              onOpenTask={openEdit}
              onDataChanged={load}
              onIconChange={handleIconChange}
              onPriorityChange={handlePriorityChange}
              onDueChange={handleDueChange}
              onProjectChange={handleProjectChange}
              quickActionProjects={projectsByActivity}
            />
          )}
        </TabsContent>

        <TabsContent value="agenda" className="mt-4">
          <AgendaGrid />
        </TabsContent>
      </Tabs>

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
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS_LG}>
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
                : subtaskDrafts.map((title) => ({ title }))
            }
            onAddSubtask={(title) =>
              editing ? addSubtaskToEditing(title) : setSubtaskDrafts((prev) => [...prev, title])
            }
            onRemoveSubtask={(subtask, index) =>
              editing
                ? removeExistingSubtask(subtask)
                : setSubtaskDrafts((prev) => prev.filter((_, i) => i !== index))
            }
            projects={projectsByActivity}
          />
          <Button onClick={handleSave} className="w-full">
            {editing ? "Salvar alterações" : "Criar tarefa"}
          </Button>
        </DialogContent>
      </Dialog>

      <MedicationQuickCreateDialog
        open={medicationDialogOpen}
        onOpenChange={setMedicationDialogOpen}
        onCreated={load}
      />
    </PageShell>
  );
}
