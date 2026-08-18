import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addDays,
  addMonths,
  addWeeks,
  format,
  isSameDay,
  isSameMonth,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
  DollarSign,
  ExternalLink,
  Plus,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FORM_DIALOG_CONTENT_CLASS_LG } from "@/components/FormLabel";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { AgendaHourGrid } from "./AgendaHourGrid";
import { EventFormDialog } from "./EventFormDialog";
import { TaskIconBadge } from "./TaskIconBadge";
import { TaskFormFields, type TaskFormTab } from "./TaskFormFields";
import {
  createProjectEvent,
  createTag,
  createTask,
  deleteProjectEvent,
  deleteTask,
  fetchProjectEvents,
  fetchProjects,
  fetchTags,
  fetchTasks,
  updateProjectEvent,
  updateTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import {
  computeMonthGridDays,
  computeVirtualOccurrences,
  computeWeekDays,
  groupCalendarItemsByDay,
  groupSubtasksByParent,
  isSubtaskDueDateValid,
  resolveEventProjectId,
} from "@/domain/tasks";
import {
  addSubtaskToEditing as addSubtaskDraftToEditing,
  emptyTask,
  removeExistingSubtask as removeExistingSubtaskDraft,
  type SubtaskMutationContext,
} from "@/domain/tasks/taskDraft";
import { formatLocalIsoDate } from "@/lib/dates";
import { formatDateBR } from "@/lib/currency";
import type {
  Project,
  ProjectEvent,
  ProjectEventCreateRequest,
  SubtaskDraft,
  Tag,
  Task,
  TaskCreateRequest,
} from "@/types/tasks";
import type { Recurring } from "@/types/recurring";
import { useToast } from "@/hooks/use-toast";
import { useDimensions } from "@/hooks/useDimensions";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_MAX_CHIPS_PER_DAY = 3;
/** Hora sugerida ao criar um evento clicando num dia da visão Mês — a célula do mês não tem
 * horário, e começo de expediente é o palpite menos errado (feature 067). */
const MONTH_CLICK_DEFAULT_HOUR = 9;

/** ISO do início sugerido ao clicar num dia da visão Mês: o próprio dia às 09:00 **locais**. */
export function monthCellStartsAt(day: Date): string {
  return hourSlotStartsAt(day, MONTH_CLICK_DEFAULT_HOUR);
}

/** ISO do início sugerido ao clicar numa linha de hora (visões Semana/Dia): o dia na hora cheia
 * clicada, em horário **local** — quem converte para UTC é o `toISOString`, nunca um slice. */
export function hourSlotStartsAt(day: Date, hour: number): string {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0).toISOString();
}

type CalendarViewMode = "month" | "week" | "day";

export const STATUS_DOT_CLASS: Record<Task["status"], string> = {
  todo: "bg-muted-foreground/50",
  doing: "bg-blue-500",
  done: "bg-green-500",
};

export function dayKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function isVirtualTask(task: Task): boolean {
  return task.id.startsWith("virtual:");
}

/** Indicador discreto de que um chip/bloco pertence a uma subtarefa (tem `parent_task_id`) — a
 * Agenda não tem aninhamento visual como Lista/Kanban (grade de tempo, cada item no seu próprio
 * horário), então o vínculo com a tarefa-mãe é só sinalizado, nunca forçado espacialmente
 * (feature 048). */
export function SubtaskLinkIcon({ className }: { className?: string }) {
  return (
    <CornerDownRight
      className={cn("h-2.5 w-2.5 shrink-0 text-muted-foreground", className)}
      aria-hidden="true"
    />
  );
}

/** Cor de Vida > Saúde (`--health`, feature 060) — é o que faz a consulta médica se destacar no
 * calendário geral sem depender do status. */
const CONSULTATION_COLOR_CLASS = "text-[hsl(var(--health))]";

/**
 * Marcador de consulta médica (feature 061): a consulta é uma tarefa com `is_consultation`, mas no
 * calendário ela não se lê como "mais um item a fazer" — troca o ponto de status pelo estetoscópio
 * na cor de Saúde. Tarefa comum e medicação continuam com o ponto de status de sempre.
 */
export function ConsultationMarker({ className }: { className?: string }) {
  return (
    <Stethoscope
      className={cn("h-2.5 w-2.5 shrink-0", CONSULTATION_COLOR_CLASS, className)}
      aria-label="Consulta médica"
    />
  );
}

export function TaskChip({
  task,
  parentTitle,
  onClick,
}: {
  task: Task;
  /** Título da tarefa-mãe, só quando `task.parent_task_id` existe — alimenta o tooltip do
   * indicador de vínculo (feature 048). */
  parentTitle?: string;
  onClick: () => void;
}) {
  const isConsultation = !!task.is_consultation;
  if (isVirtualTask(task)) {
    return (
      <div
        className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] opacity-60"
        title="Próxima ocorrência — ainda não criada, aparece automaticamente nesse dia"
      >
        {isConsultation ? (
          <ConsultationMarker />
        ) : (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-muted-foreground/60" />
        )}
        <span className="truncate italic">{task.title}</span>
      </div>
    );
  }
  const isSubtask = !!task.parent_task_id;
  return (
    <button
      type="button"
      onClick={onClick}
      title={isSubtask ? `Subtarefa de "${parentTitle ?? "…"}"` : undefined}
      className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] hover:bg-muted"
    >
      {isConsultation ? (
        <ConsultationMarker />
      ) : (
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT_CLASS[task.status])} />
      )}
      <TaskIconBadge iconKey={task.icon_key} iconUrl={task.icon_url} className="h-3 w-3" />
      {isSubtask && <SubtaskLinkIcon />}
      <span className={cn("truncate", task.status === "done" && "text-muted-foreground line-through")}>
        {task.title}
      </span>
      {task.linked_recurring_id && (
        <DollarSign className="h-2.5 w-2.5 shrink-0 text-muted-foreground" aria-label="Vinculada a Recorrência" />
      )}
    </button>
  );
}

export function EventChip({
  event,
  projectColor,
  onClick,
}: {
  event: ProjectEvent;
  projectColor: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] hover:bg-muted"
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: projectColor ?? "hsl(var(--muted-foreground))" }}
      />
      <span className="truncate">{event.title}</span>
    </button>
  );
}

/** Grade de calendário (mês/semana/dia) — extraída de `AgendaCalendar.tsx` (a página `/tasks/agenda`)
 * pra ser reutilizada como aba dentro de `TaskList.tsx`. A página standalone continua existindo,
 * só embrulhando isso num `PageShell`. */
export function AgendaGrid() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [recurrings, setRecurrings] = useState<Recurring[]>([]);
  const { dimensions } = useDimensions();
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [dayModalKey, setDayModalKey] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formTab, setFormTab] = useState<TaskFormTab>("geral");
  const [form, setForm] = useState<TaskCreateRequest>(emptyTask());
  /** Dialog de criar/editar evento (feature 067). `editing: null` = criação; `prefillStartsAt` é o
   * início sugerido pelo clique num dia (mês) ou num slot de hora (semana/dia). */
  const [eventDialog, setEventDialog] = useState<{
    open: boolean;
    editing: ProjectEvent | null;
    prefillStartsAt: string | null;
  }>({ open: false, editing: null, prefillStartsAt: null });
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const [taskList, projectList, eventList, tagList, recurringList] = await Promise.all([
        fetchTasks(),
        fetchProjects(),
        fetchProjectEvents(),
        fetchTags(),
        fetchRecurringTransactions(),
      ]);
      setTasks(taskList);
      setProjects(projectList);
      setEvents(eventList);
      setTags(tagList);
      setRecurrings(recurringList);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível carregar a agenda."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Mapa de subtarefas por tarefa-mãe, montado localmente a partir do `tasks` já buscado pela
  // Agenda — mesmo padrão usado em `TaskList.tsx`/`ProjectDetail.tsx` — pra alimentar
  // `TaskSubtasksField` dentro do form unificado (feature 043).
  const subtasksByParent = useMemo(() => groupSubtasksByParent(tasks), [tasks]);

  const gridDays = useMemo(() => {
    if (viewMode === "month") return computeMonthGridDays(focusDate);
    if (viewMode === "week") return computeWeekDays(focusDate);
    return [focusDate];
  }, [viewMode, focusDate]);

  const headerLabel = useMemo(() => {
    if (viewMode === "month") {
      return format(focusDate, "MMMM 'de' yyyy", { locale: ptBR });
    }
    if (viewMode === "day") {
      return format(focusDate, "EEEE, d 'de' MMMM", { locale: ptBR });
    }
    const [first, last] = [gridDays[0], gridDays[gridDays.length - 1]];
    const sameMonth = first.getMonth() === last.getMonth();
    const firstLabel = format(first, sameMonth ? "d" : "d 'de' MMM", { locale: ptBR });
    const lastLabel = format(last, "d 'de' MMM 'de' yyyy", { locale: ptBR });
    return `${firstLabel} – ${lastLabel}`;
  }, [viewMode, focusDate, gridDays]);

  function goToPrevious() {
    setFocusDate((d) =>
      viewMode === "month" ? subMonths(d, 1) : viewMode === "week" ? subWeeks(d, 1) : subDays(d, 1)
    );
  }

  function goToNext() {
    setFocusDate((d) =>
      viewMode === "month" ? addMonths(d, 1) : viewMode === "week" ? addWeeks(d, 1) : addDays(d, 1)
    );
  }

  // Ocorrências futuras de tarefas recorrentes: a materialização em `fetchTasks` só cria linhas
  // até hoje (sob demanda), então uma recorrência de "a cada 15 dias" nunca teria a próxima data
  // visível até o dia chegar. Preenche com uma prévia calculada na hora, sem persistir nada.
  const virtualTasks = useMemo(() => {
    const rangeEndIso = formatLocalIsoDate(gridDays[gridDays.length - 1]);
    const originById = new Map(tasks.map((t) => [t.id, t]));
    return computeVirtualOccurrences(tasks, rangeEndIso).flatMap(({ originId, dueDate }) => {
      const origin = originById.get(originId);
      if (!origin) return [];
      const virtual: Task = {
        ...origin,
        id: `virtual:${originId}:${dueDate}`,
        due_date: dueDate,
        due_time: origin.recurrence_rule?.time ?? null,
        status: "todo",
        recurrence_rule: null,
        recurrence_origin_id: originId,
        completed_at: null,
      };
      return [virtual];
    });
  }, [tasks, gridDays]);

  // Subtarefas com `due_date` próprio entram na Agenda como qualquer tarefa de topo (feature 048)
  // — só ficam de fora as sem prazo (nada pra posicionar na grade) e as parcelas de recorrência
  // financeira ainda não geradas, mesmo critério de antes.
  const filteredTasks = useMemo(
    () =>
      [...tasks, ...virtualTasks].filter(
        (t) =>
          !(t.linked_recurring_id && t.linked_installment_number == null) &&
          (projectFilter === "all" ? true : t.project_id === projectFilter)
      ),
    [tasks, virtualTasks, projectFilter]
  );

  // Mapa id -> tarefa, usado só pra resolver o título da tarefa-mãe no tooltip do indicador de
  // vínculo de subtarefa (`SubtaskLinkIcon`) nos chips/blocos da Agenda (feature 048).
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  function parentTitleFor(task: Task): string | undefined {
    return task.parent_task_id ? taskById.get(task.parent_task_id)?.title : undefined;
  }

  // Desde a 066 o evento pode não ter `project_id`: o de tarefa deriva o projeto da tarefa e o
  // avulso não tem projeto nenhum (fica de fora quando o filtro aponta para um projeto).
  const eventProjectId = useCallback(
    (event: ProjectEvent) => resolveEventProjectId(event, taskById),
    [taskById]
  );

  const eventProjectColor = useCallback(
    (event: ProjectEvent) => {
      const projectId = eventProjectId(event);
      return projectId ? (projectById.get(projectId)?.color ?? null) : null;
    },
    [eventProjectId, projectById]
  );

  const filteredEvents = useMemo(
    () =>
      events.filter((e) =>
        projectFilter === "all" ? true : eventProjectId(e) === projectFilter
      ),
    [events, projectFilter, eventProjectId]
  );

  const itemsByDay = useMemo(
    () => groupCalendarItemsByDay(filteredTasks, filteredEvents),
    [filteredTasks, filteredEvents]
  );

  const today = new Date();
  const dayModalItems = dayModalKey ? (itemsByDay.get(dayModalKey) ?? []) : [];

  // Projeto do evento aberto no dialog de edição — `null` para evento de tarefa sem projeto e para
  // evento avulso, que é quando o botão "Ir para o projeto" some (feature 066).
  const editingEventProject = eventDialog.editing
    ? (projectById.get(eventProjectId(eventDialog.editing) ?? "") ?? null)
    : null;

  function openTaskFromChip(task: Task) {
    setDayModalKey(null);
    setEditingTask(task);
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
    setFormTab("geral");
  }

  async function handleCreateTag(name: string, color: string): Promise<Tag> {
    const tag = await createTag({ name, color });
    setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
    return tag;
  }

  /** Clicar num evento abre o mesmo dialog da criação, em modo edição (feature 067) — o antigo
   * detalhe read-only (título + data + "Ir para o projeto" + excluir) não deixava corrigir nem o
   * horário. */
  function openEventFromChip(event: ProjectEvent) {
    setDayModalKey(null);
    setEventDialog({ open: true, editing: event, prefillStartsAt: null });
  }

  async function toggleTaskDone(task: Task) {
    const nextStatus = task.status === "done" ? "todo" : "done";
    const previous = tasks;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    setEditingTask((prev) => (prev && prev.id === task.id ? { ...prev, status: nextStatus } : prev));
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

  async function handleSaveTaskEdit() {
    if (!editingTask) return;
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
    const isEditingInstance = editingTask.linked_installment_number != null;
    const payload: TaskCreateRequest = {
      ...form,
      due_date: isLinked && !isEditingInstance ? null : form.due_date,
      due_time: isLinked && !isEditingInstance ? null : form.due_time,
    };
    const id = editingTask.id;
    const previous = tasks;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...payload } : t)));
    setEditingTask(null);
    try {
      await updateTask({ id, ...payload });
    } catch (error) {
      setTasks(previous);
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar a tarefa."),
        variant: "destructive",
      });
    }
  }

  /** Contexto compartilhado pelas mutações de subtarefa extraídas pra `taskDraft.ts` (feature 042)
   * — mesmo padrão de `TaskList.tsx`/`ProjectDetail.tsx`, agora reaproveitado pela Agenda
   * (feature 043). */
  const subtaskMutationCtx: SubtaskMutationContext = {
    editing: editingTask,
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

  function closeEventDialog() {
    setEventDialog({ open: false, editing: null, prefillStartsAt: null });
  }

  /** Abre o dialog em modo criação. `startsAt` (ISO) vem do dia/slot clicado; sem ele o usuário
   * escolhe a data no próprio form (botão "Novo evento" do header). */
  function openEventCreate(startsAt: string | null) {
    setDayModalKey(null);
    setEventDialog({ open: true, editing: null, prefillStartsAt: startsAt });
  }

  /**
   * Cria ou edita conforme o `editing` do dialog. O erro é toast **e** re-lançado: quem mostra a
   * mensagem é a Agenda, mas quem decide continuar aberto é o `EventFormDialog` — sem o re-lançar,
   * ele fecharia achando que deu certo e o usuário perderia o que digitou.
   */
  async function handleSaveEvent(draft: ProjectEventCreateRequest) {
    const editing = eventDialog.editing;
    try {
      if (editing) {
        await updateProjectEvent({ id: editing.id, ...draft });
      } else {
        await createProjectEvent(draft);
      }
      closeEventDialog();
      await load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          editing ? "Não foi possível salvar o evento." : "Não foi possível criar o evento."
        ),
        variant: "destructive",
      });
      throw error;
    }
  }

  async function handleDeleteEvent(id: string) {
    try {
      await deleteProjectEvent(id);
      closeEventDialog();
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível excluir o evento."),
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={goToPrevious}
            aria-label={
              viewMode === "month" ? "Mês anterior" : viewMode === "week" ? "Semana anterior" : "Dia anterior"
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-32 text-center text-sm font-semibold capitalize">{headerLabel}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={goToNext}
            aria-label={
              viewMode === "month" ? "Próximo mês" : viewMode === "week" ? "Próxima semana" : "Próximo dia"
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="ml-1 h-8" onClick={() => setFocusDate(new Date())}>
            Hoje
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as CalendarViewMode)}>
            <TabsList>
              <TabsTrigger value="month">Mês</TabsTrigger>
              <TabsTrigger value="week">Semana</TabsTrigger>
              <TabsTrigger value="day">Dia</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Projeto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os projetos</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 gap-1.5" onClick={() => openEventCreate(null)}>
            <Plus className="h-3.5 w-3.5" />
            Novo evento
          </Button>
        </div>
      </div>

      {loading ? (
        <TableLoadingSkeleton rows={5} />
      ) : viewMode === "day" || viewMode === "week" ? (
        <AgendaHourGrid
          days={gridDays}
          itemsByDay={itemsByDay}
          projectById={projectById}
          taskById={taskById}
          onOpenTask={openTaskFromChip}
          onOpenEvent={openEventFromChip}
          onCreateAt={(day, hour) => openEventCreate(hourSlotStartsAt(day, hour))}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <div className="grid grid-cols-7 border-b bg-muted/40">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="p-2 text-center text-xs font-medium text-muted-foreground">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {gridDays.map((day) => {
              const key = dayKey(day);
              const items = itemsByDay.get(key) ?? [];
              const visible = items.slice(0, MONTH_MAX_CHIPS_PER_DAY);
              const overflow = items.length - visible.length;
              const inMonth = isSameMonth(day, focusDate);
              const isToday = isSameDay(day, today);
              return (
                <div
                  key={key}
                  className={cn(
                    "relative min-h-24 border-b border-r p-1 sm:min-h-28",
                    !inMonth && "bg-muted/20"
                  )}
                >
                  {/* Alvo de criação: cobre a célula inteira por baixo do conteúdo (`z-0` contra o
                      `z-10` dos chips), então clicar em qualquer área livre do dia marca um evento
                      ali — o gesto de calendário — sem roubar o clique de chip nem do "+N mais". */}
                  <button
                    type="button"
                    aria-label={`Novo evento em ${format(day, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`}
                    // Fora da ordem de tabulação de propósito: 42 alvos de dia à frente do
                    // conteúdo tornariam a navegação por teclado insuportável, e quem usa teclado
                    // cria pelo botão "Novo evento" do header.
                    tabIndex={-1}
                    onClick={() => openEventCreate(monthCellStartsAt(day))}
                    className="absolute inset-0 z-0 h-full w-full cursor-pointer"
                  />
                  <div className="pointer-events-none relative z-10">
                    <span
                      className={cn(
                        "mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs",
                        isToday && "bg-primary font-semibold text-primary-foreground",
                        !inMonth && "text-muted-foreground"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    <div className="space-y-0.5 [&>*]:pointer-events-auto">
                    {visible.map((item) =>
                      item.kind === "task" ? (
                        <TaskChip
                          key={item.task.id}
                          task={item.task}
                          parentTitle={parentTitleFor(item.task)}
                          onClick={() => openTaskFromChip(item.task)}
                        />
                      ) : (
                        <EventChip
                          key={item.event.id}
                          event={item.event}
                          projectColor={eventProjectColor(item.event)}
                          onClick={() => openEventFromChip(item.event)}
                        />
                      )
                    )}
                    {overflow > 0 && (
                      <button
                        type="button"
                        onClick={() => setDayModalKey(key)}
                        className="w-full truncate rounded px-1 py-0.5 text-left text-[10px] text-muted-foreground hover:bg-muted"
                      >
                        +{overflow} mais
                      </button>
                    )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={!!dayModalKey} onOpenChange={(v) => !v && setDayModalKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dayModalKey && format(new Date(`${dayModalKey}T12:00:00`), "EEEE, d 'de' MMMM", { locale: ptBR })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {dayModalItems.map((item) =>
              item.kind === "task" ? (
                <TaskChip
                  key={item.task.id}
                  task={item.task}
                  parentTitle={parentTitleFor(item.task)}
                  onClick={() => openTaskFromChip(item.task)}
                />
              ) : (
                <EventChip
                  key={item.event.id}
                  event={item.event}
                  projectColor={eventProjectColor(item.event)}
                  onClick={() => openEventFromChip(item.event)}
                />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingTask} onOpenChange={(v) => !v && setEditingTask(null)}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS_LG}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingTask && (
                <button
                  type="button"
                  onClick={() => toggleTaskDone(editingTask)}
                  aria-label={editingTask.status === "done" ? "Reabrir tarefa" : "Concluir tarefa"}
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    editingTask.status === "done"
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/40 hover:border-primary"
                  )}
                />
              )}
              Editar tarefa
            </DialogTitle>
          </DialogHeader>
          {editingTask?.linked_recurring_id && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" />
              Vinculada a uma Recorrência Financeira — concluir aqui já reflete em Finanças.
            </p>
          )}
          {editingTask && (
            <TaskFormFields
              formTab={formTab}
              onFormTabChange={setFormTab}
              form={form}
              setForm={setForm}
              editing={editingTask}
              tasks={tasks}
              tags={tags}
              onCreateTag={handleCreateTag}
              recurrings={recurrings}
              onRecurringCreated={(rec) => setRecurrings((prev) => [rec, ...prev])}
              dimensions={dimensions}
              subtasks={(subtasksByParent.get(editingTask.id) ?? []).map((s) => ({ id: s.id, title: s.title }))}
              onAddSubtask={addSubtaskToEditing}
              onRemoveSubtask={(subtask) => removeExistingSubtask(subtask)}
              projects={projects}
            />
          )}
          <Button onClick={handleSaveTaskEdit} className="w-full">
            Salvar alterações
          </Button>
        </DialogContent>
      </Dialog>

      <EventFormDialog
        open={eventDialog.open}
        onOpenChange={(v) => (v ? undefined : closeEventDialog())}
        editing={eventDialog.editing}
        projects={projects}
        tasks={tasks}
        prefillStartsAt={eventDialog.prefillStartsAt}
        onSave={handleSaveEvent}
        onDelete={
          eventDialog.editing ? () => handleDeleteEvent(eventDialog.editing!.id) : undefined
        }
        extraActions={
          editingEventProject ? (
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link to={`/tasks/projects/${editingEventProject.id}`}>
                <ExternalLink className="h-3.5 w-3.5" />
                Ir para o projeto
              </Link>
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
