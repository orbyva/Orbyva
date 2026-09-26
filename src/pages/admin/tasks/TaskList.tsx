import { ListTodo, Tag as TagIcon, Timer, X } from "lucide-react";
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
import { formatDateBR } from "@/lib/currency";
import { ProjectsRail } from "./ProjectsRail";
import { TaskQuadrant } from "./TaskQuadrant";
import { TaskSortToggle } from "./TaskSortToggle";
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
import { TaskFormFields } from "./TaskFormFields";
import type { TaskDueQuickEditValue } from "./TaskDueQuickEdit";
import { EmptyState } from "@/components/EmptyState";
import { FORM_DIALOG_CONTENT_CLASS_LG } from "@/components/FormLabel";
import { ModuleGuide, ModuleGuideButton } from "@/components/ModuleGuide";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { GanttChart } from "./GanttChart";
import { AgendaGrid } from "./AgendaGrid";
import { SeriesOccurrencesDialog } from "./SeriesOccurrencesDialog";
import {
  createTag,
  createTask,
  deleteTask,
  fetchDependencies,
  fetchExternalLinksForTask,
  fetchExternalLinksForTasks,
  fetchProjects,
  fetchTags,
  fetchTasks,
  saveExternalLinksForTask,
  updateTask,
  updateTasksSortOrder,
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
  type TaskDeleteOption,
  groupSubtasksByParent,
  groupTasksByAgendaBucket,
  isSubtaskDueDateValid,
  normalizeExternalLinkDrafts,
  normalizeProjectFilter,
  PRIORITY_OPTIONS,
  PROJECT_FILTER_ALL,
  PROJECT_FILTER_NONE,
  rankProjectsByActivity,
  sortTasksBy,
  sortTasksByCompletedAtDesc,
} from "@/domain/tasks";
import type {
  AgendaBucket,
  TaskSortKey,
  TaskSortOrderPair,
  TaskStatusView,
} from "@/domain/tasks";
import { readTaskSortKey, writeTaskSortKey } from "@/lib/taskSortPreference";
import {
  readTaskProjectFilter,
  writeTaskProjectFilter,
} from "@/lib/taskProjectFilterPreference";
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
  TaskExternalLink,
  TaskExternalLinkDraft,
  TaskPriority,
  TaskStatus,
} from "@/types/tasks";
import type { Recurring } from "@/types/recurring";
import { useToast } from "@/hooks/use-toast";
import { useActiveTimer } from "@/hooks/useActiveTimer";
import { useStartTaskNow } from "@/hooks/useStartTaskNow";
import { useDimensions } from "@/hooks/useDimensions";
import { getErrorMessage } from "@/lib/errors";
import { runScopedTaskDelete } from "./scopedDelete";
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
  const [editing, setEditing] = useState<Task | null>(null);
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
  /** Recorte por projeto, compartilhado pelas quatro abas e pela `ProjectsRail` (feature 097).
   * Nasce da preferência salva no navegador; sem nada salvo, "todos os projetos". */
  const [projectFilter, setProjectFilter] = useState<string>(() => readTaskProjectFilter());
  const [statusView, setStatusView] = useState<TaskStatusView>("pending");
  /** Chips de filtro rápido da aba Lista — só afetam essa aba (Kanban/Gantt seguem usando
   * `visibleTasks`/`ganttTasks` sem esse recorte). */
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | null>(null);
  const [todayOnly, setTodayOnly] = useState(false);
  /** Ordenação da Lista e das colunas do Kanban (feature 079). Nasce da preferência salva no
   * navegador; sem nada salvo, o padrão é "última atualização". */
  const [sortKey, setSortKey] = useState<TaskSortKey>(() => readTaskSortKey());
  const [subtaskDrafts, setSubtaskDrafts] = useState<string[]>([]);
  /** Links externos da tarefa aberta no formulário (feature 085). Em edição vêm do banco ao abrir;
   * em criação nascem vazios e são gravados depois do `createTask`, quando já existe `task_id` —
   * o mesmo caminho que `subtaskDrafts` faz. */
  const [externalLinkDrafts, setExternalLinkDrafts] = useState<TaskExternalLinkDraft[]>([]);
  /** Links de **todas** as tarefas da tela, numa consulta só por `load()`, para os chips dos cards
   * não virarem uma ida ao banco por tarefa. */
  const [externalLinksByTask, setExternalLinksByTask] = useState<Record<string, TaskExternalLink[]>>(
    {}
  );
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
   * (`handleDueChange`) não mover o card **enquanto o popover está aberto**, fazendo o usuário
   * perder o foco dele. O valor exibido no `TaskDueQuickEdit` continua vindo de `tasks` (live), só
   * a posição fica "congelada". Fechar o popover derruba o congelamento daquela tarefa e recarrega
   * (`handleDueOpenChange`), então o card cai na caixa certa na hora — feature 081, que reverteu
   * pela metade a decisão da 029 (congelar até o próximo `load()` real). */
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
      // Feature 085: os chips de link são enfeite da lista, não a lista. Falha aqui cai para "sem
      // chips" em vez de derrubar as tarefas — por isso fica fora do `Promise.all` acima.
      try {
        setExternalLinksByTask(await fetchExternalLinksForTasks(taskList.map((t) => t.id)));
      } catch {
        setExternalLinksByTask({});
      }
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

  /** Botão "Imediatamente" (feature 078) — inicia o timer e grava o prazo como agora + duração
   * estimada. `load()` depois é de propósito: a tarefa acabou de virar "hoje" e tem de pular para
   * o bucket "Hoje" na hora (o `frozenDueDatesRef` é re-tirado no `load`, então nada a congelar
   * aqui — ao contrário do `handleDueChange`, que é edição de prazo sem começar a trabalhar). */
  const { startNow, pendingTaskId: startingNowTaskId } = useStartTaskNow({
    resolveTaskTitle: (taskId) => tasks.find((t) => t.id === taskId)?.title,
    onApplied: load,
  });

  const visibleTasks = useMemo(() => {
    const projectId =
      projectFilter === PROJECT_FILTER_ALL
        ? undefined
        : projectFilter === PROJECT_FILTER_NONE
          ? null
          : projectFilter;
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

  /** Troca a ordenação e grava a escolha, para que ela sobreviva ao remontar/recarregar. */
  const handleSortKeyChange = useCallback((key: TaskSortKey) => {
    setSortKey(key);
    writeTaskSortKey(key);
  }, []);

  /** Troca o filtro de projeto e grava a escolha (feature 097). Passa por aqui tanto o `<Select>`
   * da barra quanto a `ProjectsRail`, que dispara o mesmo `onSelect` — é o mesmo recorte. */
  const handleProjectFilterChange = useCallback((value: string) => {
    setProjectFilter(value);
    writeTaskProjectFilter(value);
  }, []);

  /** A preferência salva pode apontar para um projeto apagado desde a última sessão — sem esta
   * conferência a tela abriria filtrada por um projeto que nem aparece no `<Select>`, parecendo
   * vazia sem motivo. Só roda depois que `loading` vira `false`: lista de projetos vazia enquanto
   * a carga está em voo não é prova de projeto apagado. */
  useEffect(() => {
    if (loading) return;
    const valid = normalizeProjectFilter(
      projectFilter,
      projects.map((p) => p.id)
    );
    if (valid !== projectFilter) {
      setProjectFilter(valid);
      writeTaskProjectFilter(valid);
    }
  }, [loading, projects, projectFilter]);

  /** Prazo "congelado" desta tarefa (o do último `load()`, enquanto o popover de prazo dela está
   * aberto) ou o prazo vivo, quando não há nada congelado. */
  const frozenDueDateOf = useCallback(
    (task: Task) =>
      frozenDueDatesRef.current.has(task.id)
        ? (frozenDueDatesRef.current.get(task.id) ?? null)
        : task.due_date,
    []
  );

  /** Chips de Prioridade/"Hoje" — só entram na aba Lista (Kanban/Gantt usam `visibleTasks` puro).
   * O chip "Hoje" usa o prazo congelado pelo mesmo motivo do bucket: com ele ligado, o prazo vivo
   * faria a linha sumir da lista **no meio da edição**, levando junto o popover ancorado nela. */
  const applyListQuickFilters = useCallback(
    (list: Task[]) => {
      const withPriority = priorityFilter ? filterTasks(list, { priority: priorityFilter }) : list;
      return todayOnly
        ? withPriority.filter((t) => bucketForDueDate(frozenDueDateOf(t), todayIso) === "today")
        : withPriority;
    },
    [priorityFilter, todayOnly, todayIso, frozenDueDateOf]
  );

  /** Envolve tarefas com o `due_date` congelado (`frozenDueDatesRef`) pra usar como chave de
   * ordenação/bucket sem alterar o objeto `Task` real (o card continua mostrando o prazo live). */
  const withFrozenDueDate = useCallback(
    (list: Task[]) =>
      list.map((task) => ({
        task,
        // `id`/`updated_at`/`created_at` viajam junto porque o comparador de "última atualização"
        // (feature 079) lê do próprio item do array, não do `task` embrulhado.
        id: task.id,
        updated_at: task.updated_at,
        created_at: task.created_at,
        due_date: frozenDueDateOf(task),
      })),
    [frozenDueDateOf]
  );

  const pendingTasks = useMemo(() => {
    const sorted = sortTasksBy(
      sortKey,
      withFrozenDueDate(filterTasksByStatusView(visibleTasks, "pending"))
    ).map((entry) => entry.task);
    return applyListQuickFilters(sorted);
  }, [visibleTasks, applyListQuickFilters, withFrozenDueDate, sortKey]);

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
    if (projectFilter === PROJECT_FILTER_ALL || projectFilter === PROJECT_FILTER_NONE) return null;
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
      projectFilter === PROJECT_FILTER_ALL
        ? undefined
        : projectFilter === PROJECT_FILTER_NONE
          ? null
          : projectFilter;
    return filterTasks(tasks, { tagId: tagFilter || undefined, projectId }).filter(
      (t) => !(t.linked_recurring_id && t.linked_installment_number == null)
    );
  }, [tasks, tagFilter, projectFilter]);

  /** Colunas do Kanban. Cada uma respeita o mesmo `sortKey` da Lista (feature 079) — antes elas
   * herdavam a ordem crua do `fetchTasks` (`due_date` asc), que as materializações já bagunçavam
   * anexando linhas no fim do array. */
  const topLevelByStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] };
    for (const task of visibleTasks) {
      map[task.status].push(task);
    }
    for (const status of Object.keys(map) as TaskStatus[]) {
      map[status] = sortTasksBy(sortKey, map[status]);
    }
    return map;
  }, [visibleTasks, sortKey]);

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
    setExternalLinkDrafts([]);
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
      icon_key: task.icon_key ?? null,
      icon_url: task.icon_url ?? null,
      is_milestone: task.is_milestone ?? false,
      // Feature 080: sem isto o painel abria "+ Duração" numa tarefa que já tem duração — o
      // campo nunca era carregado para edição (bug pré-existente, invisível enquanto a duração
      // morava numa aba secundária).
      estimated_duration: task.estimated_duration ?? null,
      // Feature 070: sem isto o interruptor "Tarefa pontual" abriria sempre desligado numa
      // tarefa que já é pontual, e salvar a desmarcaria sem o usuário pedir.
      is_quick: task.is_quick ?? false,
    });
    setSubtaskDrafts([]);
    loadExternalLinkDrafts(task.id);
    setOpen(true);
  }

  /** Carrega os links da tarefa em edição. Zera **antes** de buscar para o formulário nunca mostrar
   * os links da tarefa anterior enquanto a consulta está em voo; falhar cai para lista vazia, com
   * aviso — abrir a tarefa continua funcionando. */
  async function loadExternalLinkDrafts(taskId: string) {
    setExternalLinkDrafts([]);
    try {
      const links = await fetchExternalLinksForTask(taskId);
      setExternalLinkDrafts(
        links.map((link) => ({
          id: link.id,
          url: link.url,
          comment: link.comment,
          position: link.position,
        }))
      );
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível carregar os links externos."),
        variant: "destructive",
      });
    }
  }

  async function handleCreateTag(name: string, color: string): Promise<Tag> {
    const tag = await createTag({ name, color });
    setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
    return tag;
  }

  async function handleSave() {
    if (!form.title.trim()) {
        return;
    }
    if (form.parent_task_id) {
      const parentTask = tasks.find((t) => t.id === form.parent_task_id);
      if (parentTask && !isSubtaskDueDateValid(form.due_date, parentTask.due_date)) {
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
    // Feature 085: linha em branco sai, espaços saem, `position` vira 0..n-1 e a URL repetida
    // (já acusada na própria linha) fica de fora — o `unique (task_id, url)` do banco nunca chega a
    // estourar em erro genérico.
    const links = normalizeExternalLinkDrafts(externalLinkDrafts).drafts;
    try {
      if (editing) {
        await updateTask({ id: editing.id, ...payload });
        await saveExternalLinksForTask(editing.id, links);
      } else {
        const created = await createTask(payload);
        for (const [index, title] of subtaskDrafts.entries()) {
          await createTask({
            ...emptyTask(),
            project_id: created.project_id,
            parent_task_id: created.id,
            title,
            sort_order: index,
          });
        }
        // Só aqui existe `task_id` para gravar — mesmo motivo pelo qual as subtarefas de uma tarefa
        // nova esperam o `createTask`.
        if (links.length > 0) await saveExternalLinksForTask(created.id, links);
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
    const siblingCount = editing
      ? (subtasksByParent.get(editing.id) ?? []).length
      : 0;
    await addSubtaskDraftToEditing(subtaskMutationCtx, title, siblingCount);
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

  /**
   * Exclusão com escopo (feature 075): série de recorrência, doses de um tratamento, ou o
   * encerramento do tratamento junto. O conjunto é resolvido **no servidor** a partir da opção —
   * antes disto a tela montava os ids com `findSeriesTasks` sobre `visibleTasks`, já filtrada por
   * projeto/tag/status, e um filtro ativo fazia o botão apagar só a parte visível da série.
   */
  async function handleDeleteScoped(task: Task, option: TaskDeleteOption) {
    await runScopedTaskDelete(task, option, {
      reload: load,
      notify: toast,
    });
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

  /**
   * Feature 082 — arraste no painel "Por prioridade". A faixa afetada chega já renumerada de
   * 0..n-1 (`reorderWithinBand`/`reorderIntoBand`) e é gravada em lote.
   *
   * O otimismo aqui não é enfeite: sem ele a linha só se moveria depois da resposta do servidor, e
   * arrastar teria aquele "volta e vai" que faz o gesto parecer quebrado. A reversão é cirúrgica
   * (só o `sort_order` das tarefas do lote, não um `setTasks(before)` inteiro) porque um arraste
   * entre faixas dispara `handleQuadrantPriorityChange` em paralelo — restaurar o array velho
   * desfaria a mudança de prioridade junto.
   */
  async function handleQuadrantReorder(pairs: TaskSortOrderPair[]) {
    if (pairs.length === 0) return;
    const nextOrder = new Map(pairs.map((pair) => [pair.id, pair.sort_order]));
    const previousOrder = new Map(
      tasks.filter((t) => nextOrder.has(t.id)).map((t) => [t.id, t.sort_order ?? 0])
    );
    setTasks((prev) =>
      prev.map((t) => (nextOrder.has(t.id) ? { ...t, sort_order: nextOrder.get(t.id) } : t))
    );
    try {
      await updateTasksSortOrder(pairs);
    } catch (error) {
      setTasks((prev) =>
        prev.map((t) => (previousOrder.has(t.id) ? { ...t, sort_order: previousOrder.get(t.id) } : t))
      );
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar a nova ordem."),
        variant: "destructive",
      });
    }
  }

  /** Feature 082 — soltar numa faixa vizinha muda a prioridade além de posicionar. Diferente de
   * `handlePriorityChange` (que chama `load()`), este caminho é otimista e **não** recarrega: o
   * `load()` chegaria correndo com o `updateTasksSortOrder` do mesmo gesto e poderia repor a ordem
   * antiga na tela. A reversão também é cirúrgica, pelo mesmo motivo do `handleQuadrantReorder`. */
  async function handleQuadrantPriorityChange(taskId: string, priority: TaskPriority | null) {
    const before = tasks.find((t) => t.id === taskId);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, priority } : t)));
    try {
      await updateTask({ id: taskId, priority });
    } catch (error) {
      if (before) {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, priority: before.priority ?? null } : t))
        );
      }
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível atualizar a prioridade."),
        variant: "destructive",
      });
    }
  }

  /** Diferente de `handlePriorityChange`/`handleProjectChange` (que chamam `load()`), grava só
   * localmente: `load()` também refaz `frozenDueDatesRef` (o snapshot que trava a posição/bucket
   * da tarefa) e o card pularia de caixa com o popover ainda aberto — a queixa da feature 029.
   * Quem descongela e reagrupa é `handleDueOpenChange`, quando o popover fecha (feature 081).
   *
   * Se o `updateTask` falhar, o otimismo é desfeito (a tarefa volta exatamente como estava): antes
   * da 081 o toast de erro aparecia mas a data errada ficava na tela. */
  async function handleDueChange(
    taskId: string,
    next: TaskDueQuickEditValue
  ) {
    const before = tasks.find((t) => t.id === taskId);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...next } : t)));
    try {
      await updateTask({ id: taskId, ...next });
    } catch (error) {
      if (before) setTasks((prev) => prev.map((t) => (t.id === taskId ? before : t)));
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível atualizar o prazo."),
        variant: "destructive",
      });
    }
  }

  /**
   * Fechou o popover de prazo desta linha: solta o congelamento (feature 029) daquela tarefa e
   * recarrega — é o `load()` que refaz `frozenDueDatesRef` a partir do servidor e faz a lista se
   * reorganizar, colocando cada prazo na sua caixa (feature 081).
   *
   * O aviso "Movida para «caixa»" sai aqui, e não em `handleDueChange`, porque é aqui que o card
   * efetivamente muda de lugar (ou some da vista, com o filtro "Hoje" ligado): avisar a cada
   * clique no calendário renderia um toast por data experimentada, ainda com a linha parada.
   */
  function handleDueOpenChange(taskId: string, open: boolean) {
    if (open) return;
    const frozen = frozenDueDatesRef.current;
    const previousDueDate = frozen.has(taskId) ? (frozen.get(taskId) ?? null) : undefined;
    frozen.delete(taskId);
    const current = tasks.find((t) => t.id === taskId);
    if (current && previousDueDate !== undefined) {
      const from = bucketForDueDate(previousDueDate, todayIso);
      const to = bucketForDueDate(current.due_date, todayIso);
      if (from !== to) {
        toast({ title: `Movida para «${AGENDA_BUCKET_LABELS[to]}»`, duration: 2000 });
      }
    }
    load();
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
    onStartNow: (subtask) => startNow(subtask),
    isStartingNow: (subtask) => startingNowTaskId === subtask.id,
    onIconChange: (subtask, next) => handleIconChange(subtask.id, next),
    onPriorityChange: (subtask, priority) => handlePriorityChange(subtask.id, priority),
    onDueChange: (subtask, next) => handleDueChange(subtask.id, next),
    onDueOpenChange: (subtask, open) => handleDueOpenChange(subtask.id, open),
  };

  return (
    <PageShell
      title="Tarefas"
      description="Todas as suas tarefas, com ou sem projeto."
      actions={
        <>
          <ModuleGuideButton moduleId="tasks" />
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
          <Button onClick={openCreate}>Nova tarefa</Button>
        </>
      }
    >
      <ModuleGuide moduleId="tasks" />
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as TaskViewMode)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="lista">Lista</TabsTrigger>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
            <TabsTrigger value="gantt">Gantt</TabsTrigger>
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
          </TabsList>
          {/* Feature 097: o filtro de **Projeto** vale para as quatro abas — o recorte "estou
              trabalhando no projeto X" é do usuário, não da visão. O de **Tag** continua fora da
              Agenda, que não filtra por tag em lugar nenhum (seria um controle que não faz nada). */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={projectFilter} onValueChange={handleProjectFilterChange}>
              {/* Com um valor escolhido o `placeholder` some, e o gatilho ficava sem nome
                  acessível nenhum — o `aria-label` é o nome estável do controle. */}
              <SelectTrigger className="w-44" aria-label="Projeto">
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
            {/* Saída de um clique: o filtro agora **persiste** entre sessões, e sem uma forma
                óbvia de limpá-lo uma tela filtrada dias depois viraria "sumiu tudo". */}
            {projectFilter !== PROJECT_FILTER_ALL && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label="Limpar filtro de projeto"
                title="Limpar filtro de projeto"
                onClick={() => handleProjectFilterChange(PROJECT_FILTER_ALL)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            {viewMode !== "agenda" && (
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
            )}
          </div>
        </div>

        <TabsContent value="lista" className="mt-4 flex flex-col gap-4 md:flex-row">
          <div className="hidden shrink-0 md:block">
            <ProjectsRail
              projects={projects}
              activeProjectId={projectFilter}
              onSelect={handleProjectFilterChange}
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
            <TaskSortToggle value={sortKey} onChange={handleSortKeyChange} />
          </div>

          {!loading && quadrantProjectTasks && (
            <TaskQuadrant
              tasks={quadrantProjectTasks}
              todayIso={todayIso}
              onSelectTask={openEdit}
              onReorder={handleQuadrantReorder}
              onPriorityChange={handleQuadrantPriorityChange}
            />
          )}

          {loading ? (
            <TableLoadingSkeleton rows={6} />
          ) : nothingToShow ? (
            <EmptyState
              icon={ListTodo}
              title="Nenhuma tarefa"
              description="Crie sua primeira tarefa."
              action={<Button onClick={openCreate}>Nova tarefa</Button>}
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
                          onDeleteScoped={handleDeleteScoped}
                          isTimerRunning={runningEntry?.task_id === task.id}
                          onToggleTimer={() => toggleTimer(task)}
                          onStartNow={() => startNow(task)}
                          isStartingNow={startingNowTaskId === task.id}
                          onIconChange={(next) => handleIconChange(task.id, next)}
                          onPriorityChange={(priority) => handlePriorityChange(task.id, priority)}
                          onDueChange={(next) => handleDueChange(task.id, next)}
                          onDueOpenChange={(open) => handleDueOpenChange(task.id, open)}
                          onProjectChange={(projectId) => handleProjectChange(task.id, projectId)}
                          projects={projectsByActivity}
                          externalLinksByTask={externalLinksByTask}
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
                  onDeleteScoped={handleDeleteScoped}
                  isTimerRunning={(task) => runningEntry?.task_id === task.id}
                  defaultOpen={statusView === "done"}
                  onIconChange={(task, next) => handleIconChange(task.id, next)}
                  onPriorityChange={(task, priority) => handlePriorityChange(task.id, priority)}
                  onDueChange={(task, next) => handleDueChange(task.id, next)}
                  onDueOpenChange={(task, open) => handleDueOpenChange(task.id, open)}
                  onProjectChange={(task, projectId) => handleProjectChange(task.id, projectId)}
                  projects={projectsByActivity}
                  externalLinksByTask={externalLinksByTask}
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
                                onDeleteScoped={handleDeleteScoped}
                                onMoveStatus={(direction) => moveStatus(task, direction)}
                                isTimerRunning={runningEntry?.task_id === task.id}
                                onToggleTimer={() => toggleTimer(task)}
                                onStartNow={() => startNow(task)}
                                isStartingNow={startingNowTaskId === task.id}
                                onIconChange={(next) => handleIconChange(task.id, next)}
                                onPriorityChange={(priority) => handlePriorityChange(task.id, priority)}
                                onDueChange={(next) => handleDueChange(task.id, next)}
                                onDueOpenChange={(open) => handleDueOpenChange(task.id, open)}
                                onProjectChange={(projectId) => handleProjectChange(task.id, projectId)}
                                projects={projectsByActivity}
                                externalLinksByTask={externalLinksByTask}
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
          {/* Feature 097: a Agenda passa a obedecer ao filtro da barra de cima. Controlada, ela
              esconde o `<Select>` de projeto que tinha — dois seletores para o mesmo recorte, um
              embaixo do outro, seria ruído (e a barra de cima agora aparece nesta aba). */}
          <AgendaGrid
            projectFilter={projectFilter}
            onProjectFilterChange={handleProjectFilterChange}
          />
        </TabsContent>
      </Tabs>

      <SeriesOccurrencesDialog
        seriesTask={seriesTask}
        seriesTasks={seriesTasks}
        onClose={() => setSeriesTask(null)}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS_LG}>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
          </DialogHeader>
          <TaskFormFields
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
            onReorderSubtasks={(next) => {
              if (!editing) {
                setSubtaskDrafts(next.map((s) => s.title));
                return;
              }
              const pairs = next
                .filter((s): s is SubtaskDraft & { id: string } => !!s.id)
                .map((s, i) => ({ id: s.id, sort_order: i }));
              const previous = tasks;
              setTasks((prev) =>
                prev.map((t) => {
                  const pair = pairs.find((p) => p.id === t.id);
                  return pair ? { ...t, sort_order: pair.sort_order } : t;
                })
              );
              void updateTasksSortOrder(pairs).catch((error) => {
                setTasks(previous);
                toast({
                  title: "Erro",
                  description: getErrorMessage(error, "Não foi possível reordenar as subtarefas."),
                  variant: "destructive",
                });
              });
            }}
            externalLinks={externalLinkDrafts}
            onExternalLinksChange={setExternalLinkDrafts}
            projects={projectsByActivity}
          />
          <Button onClick={handleSave} className="w-full">
            {editing ? "Salvar alterações" : "Criar tarefa"}
          </Button>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
