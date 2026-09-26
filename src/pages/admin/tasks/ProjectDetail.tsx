import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ListTodo, Pen, Plus, Timer } from "lucide-react";
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
import { TaskFormFields } from "./TaskFormFields";
import type { TaskDueQuickEditValue } from "./TaskDueQuickEdit";
import { GanttChart } from "./GanttChart";
import { ProjectFormDialog } from "./ProjectFormDialog";
import { TaskSortToggle } from "./TaskSortToggle";
import { SeriesOccurrencesDialog } from "./SeriesOccurrencesDialog";
import { FORM_DIALOG_CONTENT_CLASS_LG } from "@/components/FormLabel";
import { PageShell } from "@/components/PageShell";
import { ProjectShoppingSection } from "@/pages/admin/shopping/ProjectShoppingSection";
import { ProjectNotesSection } from "@/pages/admin/notes/ProjectNotesSection";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import {
  createProjectEvent,
  createTag,
  createTask,
  deleteProjectEvent,
  deleteTask,
  fetchDependencies,
  fetchExternalLinksForTask,
  fetchExternalLinksForTasks,
  fetchProjectById,
  fetchProjectEvents,
  fetchTags,
  fetchTasks,
  saveExternalLinksForTask,
  updateProject,
  updateTask,
  updateTasksSortOrder,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import { countShoppingCategoriesByProject } from "@/api/shopping/categories";
import { countNotesByProject } from "@/api/notes/notes";
import {
  AGENDA_BUCKET_LABELS,
  AGENDA_BUCKET_ORDER,
  bucketForDueDate,
  collapseRecurringSeries,
  filterTasksByStatusView,
  findSeriesTasks,
  type TaskDeleteOption,
  groupSubtasksByParent,
  groupTasksByAgendaBucket,
  isSubtaskDueDateValid,
  normalizeExternalLinkDrafts,
  sortTasksBy,
  sortTasksByCompletedAtDesc,
} from "@/domain/tasks";
import type { AgendaBucket, TaskSortKey, TaskStatusView } from "@/domain/tasks";
import { readTaskSortKey, writeTaskSortKey } from "@/lib/taskSortPreference";
import {
  addSubtaskToEditing as addSubtaskDraftToEditing,
  emptyTask,
  removeExistingSubtask as removeExistingSubtaskDraft,
  type SubtaskMutationContext,
} from "@/domain/tasks/taskDraft";
import type {
  Project,
  ProjectCreateRequest,
  ProjectEvent,
  Tag,
  Task,
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
import { useBreadcrumbTitle } from "@/hooks/useBreadcrumbTitle";
import { useDimensions } from "@/hooks/useDimensions";
import { getErrorMessage } from "@/lib/errors";
import { runScopedTaskDelete } from "./scopedDelete";
import { formatLocalIsoDate } from "@/lib/dates";
import { formatDateBR } from "@/lib/currency";

/**
 * As abas da página do projeto (feature 069). Kanban/Lista/Gantt são visões das tarefas; Compras e
 * Notas são as entidades ligadas ao projeto, que antes ficavam empilhadas embaixo do quadro e
 * comiam o espaço vertical dele.
 */
const PROJECT_TABS = ["kanban", "lista", "gantt", "compras", "notas"] as const;
type ProjectTab = (typeof PROJECT_TABS)[number];

/** Aba pedida na URL (`?tab=`). Valor ausente ou desconhecido cai no Kanban, sem quebrar. */
function parseProjectTab(raw: string | null): ProjectTab {
  return (PROJECT_TABS as readonly string[]).includes(raw ?? "")
    ? (raw as ProjectTab)
    : "kanban";
}

/** "Compras (7)" — sem número quando a contagem é zero ou não veio (`null`). */
function tabLabel(label: string, count: number | null): string {
  return count ? `${label} (${count})` : label;
}

const emptyProjectForm = (): ProjectCreateRequest => ({
  name: "",
  description: "",
  color: null,
  goal_id: null,
  status: "planned",
  tag_ids: [],
});

function projectToForm(project: Project): ProjectCreateRequest {
  return {
    name: project.name,
    description: project.description ?? "",
    color: project.color ?? null,
    goal_id: project.goal_id ?? null,
    status: project.status,
    tag_ids: project.tag_ids,
  };
}

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
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyTask(id ?? ""));
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, string>>({});
  const [newTaskSubtasks, setNewTaskSubtasks] = useState<string[]>([]);
  /** Links externos da tarefa aberta no formulário (feature 085) — mesma fiação de `TaskList.tsx`,
   * o outro dono do formulário completo. */
  const [externalLinkDrafts, setExternalLinkDrafts] = useState<TaskExternalLinkDraft[]>([]);
  /** Links de todas as tarefas do projeto, numa consulta só por `load()`, para os chips dos cards. */
  const [externalLinksByTask, setExternalLinksByTask] = useState<Record<string, TaskExternalLink[]>>(
    {}
  );
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  /**
   * A aba ativa mora na URL (`?tab=`), não em `useState` — mesmo idioma do filtro por projeto da
   * `ShoppingList` (feature 052). Assim voltar da Lista de Compras cai de novo na aba "Compras",
   * recarregar não joga o usuário no Kanban, e o link é compartilhável.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseProjectTab(searchParams.get("tab"));

  function handleTabChange(next: string) {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  }
  /**
   * Contagens dos gatilhos "Compras"/"Notas" (feature 069). `null` = sem número: ou a contagem
   * ainda não voltou, ou falhou. Fora das abas, essas seções eram o único sinal de que o projeto
   * tinha lista de compras ou nota; dentro delas, o número é que faz esse papel.
   */
  const [shoppingCount, setShoppingCount] = useState<number | null>(null);
  const [notesCount, setNotesCount] = useState<number | null>(null);
  const [statusView, setStatusView] = useState<TaskStatusView>("pending");
  /** Mesma preferência de ordenação da Lista principal (feature 079): as duas telas leem e
   * escrevem a mesma chave de `localStorage`, então escolher aqui vale lá e vice-versa. */
  const [sortKey, setSortKey] = useState<TaskSortKey>(() => readTaskSortKey());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [seriesTask, setSeriesTask] = useState<Task | null>(null);
  const [projectEvents, setProjectEvents] = useState<ProjectEvent[]>([]);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [projectForm, setProjectForm] = useState<ProjectCreateRequest>(emptyProjectForm());
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
   * `TaskList.tsx` pra editar o prazo inline (`handleDueChange`) não mover o card **enquanto o
   * popover de prazo daquela linha está aberto**. Fechar o popover derruba o congelamento e
   * recarrega (`handleDueOpenChange`), feature 081. */
  const frozenDueDatesRef = useRef<Map<string, string | null>>(new Map());

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [
        projectData,
        taskList,
        dependencyList,
        tagList,
        recurringList,
        eventList,
        shoppingTotal,
        notesTotal,
      ] = await Promise.all([
        fetchProjectById(id),
        fetchTasks(),
        fetchDependencies(),
        fetchTags(),
        fetchRecurringTransactions(),
        fetchProjectEvents(),
        // Contagem é enfeite do gatilho: se falhar, a aba continua lá, só sem número — não é
        // motivo para derrubar a página inteira no `catch` de baixo.
        countShoppingCategoriesByProject(id).catch(() => null),
        countNotesByProject(id).catch(() => null),
      ]);
      setShoppingCount(shoppingTotal);
      setNotesCount(notesTotal);
      setProject(projectData);
      const projectTasks = taskList.filter((t) => t.project_id === id);
      frozenDueDatesRef.current = new Map(projectTasks.map((t) => [t.id, t.due_date]));
      setTasks(projectTasks);
      setDependencies(dependencyList);
      setTags(tagList);
      setRecurrings(recurringList);
      setProjectEvents(eventList.filter((e) => e.project_id === id));
      // Feature 085: chip de link é enfeite do card. Falha aqui cai para "sem chips" em vez de
      // derrubar o projeto inteiro — por isso fora do `Promise.all`.
      try {
        setExternalLinksByTask(await fetchExternalLinksForTasks(projectTasks.map((t) => t.id)));
      } catch {
        setExternalLinksByTask({});
      }
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

  /** Botão "Imediatamente" (feature 078) — mesmo hook compartilhado que a Lista de `TaskList.tsx`
   * usa, em vez de mais uma cópia do handler. `load()` depois: a tarefa vira "hoje" e tem de
   * reagrupar na hora. */
  const { startNow, pendingTaskId: startingNowTaskId } = useStartTaskNow({
    resolveTaskTitle: (taskId) => tasks.find((t) => t.id === taskId)?.title,
    onApplied: load,
  });

  /** Colunas do Kanban do projeto — mesmo `sortKey` da Lista (feature 079). */
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
    for (const status of Object.keys(map) as TaskStatus[]) {
      map[status] = sortTasksBy(sortKey, map[status]);
    }
    return map;
  }, [tasks, sortKey]);

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
        // Carimbos junto do item porque o comparador de "última atualização" (079) lê do próprio
        // item do array, não do `task` embrulhado.
        id: task.id,
        updated_at: task.updated_at,
        created_at: task.created_at,
        due_date: frozenDueDatesRef.current.has(task.id)
          ? (frozenDueDatesRef.current.get(task.id) ?? null)
          : task.due_date,
      })),
    []
  );

  const pendingTasks = useMemo(() => {
    return sortTasksBy(
      sortKey,
      withFrozenDueDate(filterTasksByStatusView(listTasks, "pending"))
    ).map((entry) => entry.task);
  }, [listTasks, withFrozenDueDate, sortKey]);

  /** Troca a ordenação e grava a escolha (compartilhada com a Lista principal). */
  const handleSortKeyChange = useCallback((key: TaskSortKey) => {
    setSortKey(key);
    writeTaskSortKey(key);
  }, []);

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
    setNewTaskSubtasks([]);
    loadExternalLinkDrafts(task.id);
    setOpen(true);
  }

  /** Carrega os links da tarefa em edição — zera antes de buscar para o formulário nunca mostrar os
   * links da tarefa anterior enquanto a consulta está em voo. */
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

  function openEditProject() {
    if (!project) return;
    setProjectForm(projectToForm(project));
    setEditProjectOpen(true);
  }

  async function handleSaveProject() {
    if (!project) return;
    try {
      await updateProject({ id: project.id, ...projectForm });
      toast({ title: "Projeto salvo!", duration: 2000 });
      setEditProjectOpen(false);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar o projeto."),
        variant: "destructive",
      });
    }
  }

  async function handleAddProjectEvent({ title, startsAt }: { title: string; startsAt: string }) {
    if (!project) return;
    try {
      await createProjectEvent({
        project_id: project.id,
        title,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: null,
      });
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível adicionar o evento."),
        variant: "destructive",
      });
    }
  }

  async function handleDeleteProjectEvent(eventId: string) {
    try {
      await deleteProjectEvent(eventId);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível excluir o evento."),
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
    const payload = {
      ...form,
      due_date: isLinked && !isEditingInstance ? null : form.due_date,
      due_time: isLinked && !isEditingInstance ? null : form.due_time,
    };
    // Feature 085: linha em branco sai, espaços saem, `position` vira 0..n-1 e a URL repetida
    // (já acusada na linha) fica de fora, antes de o `unique` do banco estourar.
    const links = normalizeExternalLinkDrafts(externalLinkDrafts).drafts;
    try {
      if (editing) {
        await updateTask({ id: editing.id, ...payload });
        await saveExternalLinksForTask(editing.id, links);
      } else {
        const created = await createTask(payload);
        for (const [index, title] of newTaskSubtasks.entries()) {
          await createTask({
            ...emptyTask(id!),
            project_id: created.project_id,
            parent_task_id: created.id,
            title,
            sort_order: index,
          });
        }
        // Só aqui existe `task_id` para gravar.
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

  /** Diferente de `handlePriorityChange` (que chama `load()`), grava só localmente — `load()`
   * também refaria `frozenDueDatesRef` (o snapshot que trava a posição/bucket da tarefa) e o card
   * pularia de caixa com o popover ainda aberto. Quem descongela e reagrupa é
   * `handleDueOpenChange`, no fechamento (feature 081). Falha no `updateTask` desfaz o otimismo. */
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

  /** Espelho de `TaskList.handleDueOpenChange` (feature 081): fechar o popover de prazo solta o
   * congelamento daquela tarefa, avisa pra qual caixa ela foi e recarrega — é o `load()` que refaz
   * `frozenDueDatesRef` a partir do servidor e reorganiza a Lista. */
  function handleDueOpenChange(taskId: string, open: boolean) {
    if (open) return;
    const frozen = frozenDueDatesRef.current;
    const previousDueDate = frozen.has(taskId) ? (frozen.get(taskId) ?? null) : undefined;
    frozen.delete(taskId);
    const current = tasks.find((t) => t.id === taskId);
    if (current && previousDueDate !== undefined) {
      const todayIso = formatLocalIsoDate(new Date());
      const from = bucketForDueDate(previousDueDate, todayIso);
      const to = bucketForDueDate(current.due_date, todayIso);
      if (from !== to) {
        toast({ title: `Movida para «${AGENDA_BUCKET_LABELS[to]}»`, duration: 2000 });
      }
    }
    load();
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
    onStartNow: (subtask) => startNow(subtask),
    isStartingNow: (subtask) => startingNowTaskId === subtask.id,
    onIconChange: (subtask, next) => handleIconChange(subtask.id, next),
    onPriorityChange: (subtask, priority) => handlePriorityChange(subtask.id, priority),
    onDueChange: (subtask, next) => handleDueChange(subtask.id, next),
    onDueOpenChange: (subtask, open) => handleDueOpenChange(subtask.id, open),
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
          {project && (
            <Button variant="outline" onClick={openEditProject}>
              <Pen className="h-4 w-4" />
              Editar projeto
            </Button>
          )}
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

      <Tabs value={view} onValueChange={handleTabChange}>
        {/* `flex-wrap`: cinco gatilhos não cabem numa linha só em tela estreita (feature 069). */}
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="lista">Lista</TabsTrigger>
          <TabsTrigger value="gantt">Gantt</TabsTrigger>
          <TabsTrigger value="compras">{tabLabel("Compras", shoppingCount)}</TabsTrigger>
          <TabsTrigger value="notas">{tabLabel("Notas", notesCount)}</TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="mt-4">
          {loading ? (
            <TableLoadingSkeleton rows={4} columns={3} />
          ) : (
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

        <TabsContent value="lista" className="mt-4 space-y-5">
          {loading ? (
            <TableLoadingSkeleton rows={4} columns={3} />
          ) : (
            <>
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
                <TaskSortToggle value={sortKey} onChange={handleSortKeyChange} />
              </div>

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
                                onOpenSubtask={openEdit}
                                onToggleDone={() => toggleSubtask(task)}
                                onStatusChange={(status) =>
                                  applyStatusChange(task, status, "Não foi possível atualizar a tarefa.")
                                }
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
                                externalLinksByTask={externalLinksByTask}
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
                      onDeleteScoped={handleDeleteScoped}
                      isTimerRunning={(task) => runningEntry?.task_id === task.id}
                      defaultOpen={statusView === "done"}
                      onIconChange={(task, next) => handleIconChange(task.id, next)}
                      onPriorityChange={(task, priority) => handlePriorityChange(task.id, priority)}
                      onDueChange={(task, next) => handleDueChange(task.id, next)}
                      onDueOpenChange={(task, open) => handleDueOpenChange(task.id, open)}
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
                </>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="gantt" className="mt-4">
          {loading ? (
            <TableLoadingSkeleton rows={4} columns={3} />
          ) : (
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
          )}
        </TabsContent>

        {/*
          Compras e notas moraram fora das abas até a feature 069 — a ideia era que elas não são
          "uma quarta visão de tarefa" e deviam ficar sempre visíveis. Na tela isso empurrava o
          quadro para cima do dobrão, e o usuário pediu o contrário ("preciso do espaço para
          poder visualizar as tarefas"): viraram abas. Como o `TabsContent` do Radix só monta o
          conteúdo da aba aberta, as requisições de compras/notas passaram a ser sob demanda —
          quem só olha as tarefas não paga por elas.
        */}
        <TabsContent value="compras" className="mt-4">
          {id && <ProjectShoppingSection projectId={id} showHeading={false} />}
        </TabsContent>

        <TabsContent value="notas" className="mt-4">
          {id && <ProjectNotesSection projectId={id} showHeading={false} />}
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
            onReorderSubtasks={(next) => {
              if (!editing) {
                setNewTaskSubtasks(next.map((s) => s.title));
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
          />
          <Button onClick={handleSave} className="w-full">
            {editing ? "Salvar alterações" : "Criar tarefa"}
          </Button>
        </DialogContent>
      </Dialog>

      {project && (
        <ProjectFormDialog
          open={editProjectOpen}
          onOpenChange={setEditProjectOpen}
          editing={project}
          form={projectForm}
          setForm={setProjectForm}
          tags={tags}
          onCreateTag={handleCreateTag}
          events={projectEvents}
          onSave={handleSaveProject}
          onAddEvent={handleAddProjectEvent}
          onDeleteEvent={handleDeleteProjectEvent}
        />
      )}
    </PageShell>
  );
}
