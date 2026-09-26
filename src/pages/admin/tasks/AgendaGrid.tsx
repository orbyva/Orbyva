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
import { ChevronLeft, ChevronRight, CornerDownRight, DollarSign, ExternalLink, Plus, Stethoscope, Trash2, UserPlus } from "lucide-react";
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
import { PointTaskDots } from "./PointTaskDots";
import { QuickTaskDotRow } from "./QuickTaskDotRow";
import { EventInviteDialog } from "./EventInviteDialog";
import { TaskIconBadge } from "./TaskIconBadge";
import { TaskFormFields } from "./TaskFormFields";
import { TaskDeleteDialog } from "./TaskDeleteDialog";
import { runScopedTaskDelete } from "./scopedDelete";
import { formatTimeOfDay } from "./TimeEntryRow";
import {
  createProjectEvent,
  createTag,
  createTask,
  deleteProjectEvent,
  deleteTask,
  fetchExternalLinksForTask,
  fetchProjectEvents,
  fetchProjects,
  fetchTags,
  fetchTasks,
  saveExternalLinksForTask,
  updateProjectEvent,
  updateTask,
  updateTasksSortOrder,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import { fetchMedications } from "@/api/health/medications";
import {
  computeVirtualDoses,
  formatDoseTitle,
  MEDICATION_TASK_ICON_KEY,
} from "@/domain/health/medication";
import {
  computeMonthGridDays,
  computeVirtualOccurrences,
  computeWeekDays,
  eventProjectColor,
  groupCalendarItemsByDay,
  groupPointItems,
  groupSubtasksByParent,
  isQuickTask,
  isSubtaskDueDateValid,
  normalizeExternalLinkDrafts,
  normalizeProjectFilter,
  PROJECT_FILTER_ALL,
  PROJECT_FILTER_NONE,
  resolveEventProjectId,
  splitAgendaItems,
  type TaskDeleteOption,
} from "@/domain/tasks";
import {
  addSubtaskToEditing as addSubtaskDraftToEditing,
  emptyTask,
  removeExistingSubtask as removeExistingSubtaskDraft,
  type SubtaskMutationContext,
} from "@/domain/tasks/taskDraft";
import { formatLocalIsoDate } from "@/lib/dates";
import { formatDateBR } from "@/lib/currency";
import {
  readTaskProjectFilter,
  writeTaskProjectFilter,
} from "@/lib/taskProjectFilterPreference";
import type {
  Project,
  ProjectEvent,
  ProjectEventCreateRequest,
  SubtaskDraft,
  Tag,
  Task,
  TaskCreateRequest,
  TaskExternalLinkDraft,
} from "@/types/tasks";
import type { Recurring } from "@/types/recurring";
import type { Medication } from "@/types/health";
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
        {/* Feature 073: o ícone é da série, então o preview futuro mostra o mesmo das ocorrências
            já criadas — sem isto, a mesma série apareceria no mês metade com ícone, metade sem
            (o bloco da grade de horas em semana/dia já mostrava). */}
        <TaskIconBadge iconKey={task.icon_key} iconUrl={task.icon_url} className="h-3 w-3" />
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

export interface AgendaGridProps {
  /** Recorte por projeto vindo de fora — a aba Agenda do `TaskList` (feature 097). Mesmo
   * vocabulário do `<Select>` de lá: `"all"`, `"null"` ou o id do projeto. Sem esta prop a grade
   * continua dona do próprio filtro, que é o que mantém a rota standalone `/tasks/agenda` de pé. */
  projectFilter?: string;
  /** Par de `projectFilter`. Quando a grade é controlada, o `<Select>` interno **não é
   * renderizado**: quem desenha o controle é a barra de cima, e dois seletores para o mesmo estado
   * na mesma tela seriam só ruído. */
  onProjectFilterChange?: (value: string) => void;
}

/** Grade de calendário (mês/semana/dia) — extraída de `AgendaCalendar.tsx` (a página `/tasks/agenda`)
 * pra ser reutilizada como aba dentro de `TaskList.tsx`. A página standalone continua existindo,
 * só embrulhando isso num `PageShell`. */
export function AgendaGrid({
  projectFilter: controlledProjectFilter,
  onProjectFilterChange,
}: AgendaGridProps = {}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [recurrings, setRecurrings] = useState<Recurring[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const { dimensions } = useDimensions();
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [focusDate, setFocusDate] = useState(() => new Date());
  /** Fallback de `projectFilter` para quando a grade **não** é controlada (rota standalone). Nasce
   * da preferência salva: é a mesma do usuário, e sem isto abrir a Agenda pela sidebar zeraria o
   * recorte escolhido na aba de Tarefas. */
  const [internalProjectFilter, setInternalProjectFilter] = useState<string>(() =>
    readTaskProjectFilter()
  );
  const [dayModalKey, setDayModalKey] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  /** Feature 085: a Agenda é o terceiro dono do formulário completo e edita tarefas que já existem,
   * então a seção de links é fiada igual aos outros dois. Passar a seção desabilitada mostraria
   * lista vazia numa tarefa que tem links e perderia edições no save — pior do que não tê-la. O que
   * continua fora de escopo aqui são os **chips** nos itens da agenda (nem a Agenda nem o Gantt
   * mostram chip de link hoje). */
  const [externalLinkDrafts, setExternalLinkDrafts] = useState<TaskExternalLinkDraft[]>([]);
  const [form, setForm] = useState<TaskCreateRequest>(emptyTask());
  /** Dialog de criar/editar evento (feature 067). `editing: null` = criação; `prefillStartsAt` é o
   * início sugerido pelo clique num dia (mês) ou num slot de hora (semana/dia). */
  const [eventDialog, setEventDialog] = useState<{
    open: boolean;
    editing: ProjectEvent | null;
    prefillStartsAt: string | null;
  }>({ open: false, editing: null, prefillStartsAt: null });
  /** Evento cujo dialog de convite (feature 076) está aberto. */
  const [invitingEvent, setInvitingEvent] = useState<ProjectEvent | null>(null);
  const { toast } = useToast();

  /** Controlada = a aba dentro do `TaskList`; não controlada = a rota `/tasks/agenda`. */
  const isProjectFilterControlled = controlledProjectFilter !== undefined;
  const projectFilter = isProjectFilterControlled ? controlledProjectFilter : internalProjectFilter;
  const setProjectFilter = useCallback(
    (value: string) => {
      onProjectFilterChange?.(value);
      if (controlledProjectFilter === undefined) {
        setInternalProjectFilter(value);
        writeTaskProjectFilter(value);
      }
    },
    [controlledProjectFilter, onProjectFilterChange]
  );

  const load = useCallback(async () => {
    try {
      const [taskList, projectList, eventList, tagList, recurringList, medicationList] =
        await Promise.all([
          fetchTasks(),
          fetchProjects(),
          fetchProjectEvents(),
          fetchTags(),
          fetchRecurringTransactions(),
          // Tratamentos ativos alimentam só as doses **futuras** sintetizadas (feature 071). Como
          // são um enfeite do calendário e não a agenda em si, uma falha aqui não pode derrubar o
          // `Promise.all` inteiro e deixar a tela sem tarefa nenhuma — sem tratamento, o resto
          // continua exatamente como antes.
          fetchMedications(true).catch((error) => {
            console.error("Falha ao carregar os tratamentos da agenda:", error);
            return [] as Medication[];
          }),
        ]);
      setTasks(taskList);
      setProjects(projectList);
      setEvents(eventList);
      setTags(tagList);
      setRecurrings(recurringList);
      setMedications(medicationList);
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

  /** Mesma conferência que o `TaskList` faz (feature 097), para a rota standalone: o id salvo pode
   * ser de um projeto apagado, e aí o `<Select>` cairia no placeholder com a agenda vazia, sem
   * pista do porquê. Quando é controlada, quem valida é o dono do estado, lá em cima. */
  useEffect(() => {
    if (loading || isProjectFilterControlled) return;
    const valid = normalizeProjectFilter(
      internalProjectFilter,
      projects.map((p) => p.id)
    );
    if (valid !== internalProjectFilter) {
      setInternalProjectFilter(valid);
      writeTaskProjectFilter(valid);
    }
  }, [loading, isProjectFilterControlled, internalProjectFilter, projects]);

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

  // Doses futuras dos tratamentos ativos (feature 071). `materializeMedicationDoses` só cria linha
  // até hoje — decisão da 064, para não encher a base de doses de um tratamento que o usuário pode
  // encerrar amanhã —, então sem isto o calendário não mostraria remédio nenhum no futuro. Mesma
  // mecânica de `virtualTasks` acima: id `virtual:`, nada persistido, bolinha tracejada e não
  // clicável; quando o dia chega, a materialização cria a dose de verdade e a virtual some (ela sai
  // de `computeVirtualDoses` por já estar em `existingDoses`).
  const virtualDoses = useMemo(() => {
    if (medications.length === 0) return [];
    const todayIso = formatLocalIsoDate(new Date());
    const rangeEndIso = formatLocalIsoDate(gridDays[gridDays.length - 1]);

    const dosesByMedication = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.medication_id) continue;
      const list = dosesByMedication.get(task.medication_id);
      if (list) list.push(task);
      else dosesByMedication.set(task.medication_id, [task]);
    }

    return medications.flatMap((medication) =>
      computeVirtualDoses(
        medication,
        dosesByMedication.get(medication.id) ?? [],
        rangeEndIso,
        todayIso
      ).map((slot): Task => ({
        id: `virtual:medication:${medication.id}:${slot.date}:${slot.time}`,
        project_id: null,
        parent_task_id: null,
        recurrence_origin_id: null,
        title: formatDoseTitle(medication),
        status: "todo",
        tag_ids: [],
        due_date: slot.date,
        due_time: slot.time,
        dose_time: slot.time,
        recurrence_rule: null,
        linked_recurring_id: null,
        linked_installment_number: null,
        completed_at: null,
        icon_key: MEDICATION_TASK_ICON_KEY,
        icon_url: null,
        // Os mesmos dois campos que a materialização grava: é o que faz a dose virtual cair na
        // fileira de bolinhas em vez de virar bloco de 30 min.
        is_quick: true,
        is_medication: true,
        medication_id: medication.id,
      }))
    );
  }, [medications, tasks, gridDays]);

  /** O recorte por projeto, num lugar só: tarefas e eventos têm o mesmo `project_id: string | null`
   * e as três respostas possíveis são as mesmas — `"all"` mostra tudo, `"null"` mostra só o que não
   * tem projeto, um id mostra só aquele projeto (feature 097). */
  const matchesProjectFilter = useCallback(
    (projectId: string | null) => {
      if (projectFilter === PROJECT_FILTER_ALL) return true;
      if (projectFilter === PROJECT_FILTER_NONE) return projectId == null;
      return projectId === projectFilter;
    },
    [projectFilter]
  );

  // Subtarefas com `due_date` próprio entram na Agenda como qualquer tarefa de topo (feature 048)
  // — só ficam de fora as sem prazo (nada pra posicionar na grade) e as parcelas de recorrência
  // financeira ainda não geradas, mesmo critério de antes.
  const filteredTasks = useMemo(
    () =>
      [...tasks, ...virtualTasks, ...virtualDoses].filter(
        (t) =>
          !(t.linked_recurring_id && t.linked_installment_number == null) &&
          matchesProjectFilter(t.project_id)
      ),
    [tasks, virtualTasks, virtualDoses, matchesProjectFilter]
  );

  // Mapa id -> tarefa, usado só pra resolver o título da tarefa-mãe no tooltip do indicador de
  // vínculo de subtarefa (`SubtaskLinkIcon`) nos chips/blocos da Agenda (feature 048).
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  function parentTitleFor(task: Task): string | undefined {
    return task.parent_task_id ? taskById.get(task.parent_task_id)?.title : undefined;
  }

  // Desde a 066 o evento pode não ter `project_id`: o de tarefa deriva o projeto da tarefa e o
  // avulso não tem projeto nenhum (fica de fora quando o filtro aponta para um projeto).
  // Evento recebido por convite (076) também tem `project_id` nulo.
  const eventProjectId = useCallback(
    (event: ProjectEvent) => resolveEventProjectId(event, taskById),
    [taskById]
  );

  const filteredEvents = useMemo(
    () => events.filter((e) => matchesProjectFilter(eventProjectId(e))),
    [events, matchesProjectFilter, eventProjectId]
  );

  const editingEventProject = eventDialog.editing
    ? (projectById.get(eventProjectId(eventDialog.editing) ?? "") ?? null)
    : null;

  const itemsByDay = useMemo(
    () => groupCalendarItemsByDay(filteredTasks, filteredEvents),
    [filteredTasks, filteredEvents]
  );

  const today = new Date();
  const dayModalItems = dayModalKey ? (itemsByDay.get(dayModalKey) ?? []) : [];

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
      // Feature 072: `estimated_duration` já está acima; `is_medication`/`is_consultation`
      // precisam sobreviver ao salvar — `TaskRecurrenceField` devolve esses campos no `onChange`.
      is_medication: task.is_medication ?? false,
      is_consultation: task.is_consultation ?? false,
    });
    loadExternalLinkDrafts(task.id);
  }

  /** Carrega os links da tarefa aberta pela agenda — zera antes de buscar para não mostrar os da
   * tarefa anterior enquanto a consulta está em voo. */
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

  function openEventFromChip(event: ProjectEvent) {
    setDayModalKey(null);
    setEventDialog({ open: true, editing: event, prefillStartsAt: null });
  }

  function closeEventDialog() {
    setEventDialog({ open: false, editing: null, prefillStartsAt: null });
  }

  /** "Ir para a tarefa" do dialog de evento (feature 068): fecha o evento e abre o form da própria
   * tarefa aqui mesmo — navegar para `/tasks` jogaria o usuário para fora do calendário. */
  function openTaskFromEventDialog(taskId: string) {
    const task = taskById.get(taskId);
    closeEventDialog();
    if (task) openTaskFromChip(task);
  }

  /** Abre o dialog em modo criação. `startsAt` (ISO) vem do dia/slot clicado; sem ele o usuário
   * escolhe a data no próprio form (botão "Novo evento" do header). */
  function openEventCreate(startsAt: string | null) {
    setDayModalKey(null);
    setEventDialog({ open: true, editing: null, prefillStartsAt: startsAt });
  }

  /**
   * Cria ou edita conforme o `editing` do dialog. O erro é toast **e** re-lançado: quem mostra a
   * mensagem é a Agenda, mas quem decide continuar aberto é o `EventFormDialog`.
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

  async function toggleTaskDone(task: Task) {
    const nextStatus = task.status === "done" ? "todo" : "done";
    // Mesmo instante que `updateTask` grava em `completed_at` — refletido já no estado local para a
    // bolinha da dose poder anunciar "Tomado às HH:mm" (e o anel de atraso) sem esperar um recarregamento.
    const completedAt = nextStatus === "done" ? new Date().toISOString() : null;
    const previous = tasks;
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus, completed_at: completedAt } : t))
    );
    setEditingTask((prev) => (prev && prev.id === task.id ? { ...prev, status: nextStatus } : prev));
    try {
      await updateTask({ id: task.id, status: nextStatus });
      // Feature 071: marcar a dose é um clique só, sem tela de confirmação — o toast é a única
      // devolutiva de que o remédio foi registrado, e a hora nele é o que o prompt pede acompanhar.
      if (task.medication_id) {
        toast(
          nextStatus === "done"
            ? {
                title: `Tomado às ${formatTimeOfDay(completedAt as string)}`,
                description: task.title,
              }
            : { title: "Marcada como não tomada", description: task.title }
        );
      }
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
    const isEditingInstance = editingTask.linked_installment_number != null;
    const payload: TaskCreateRequest = {
      ...form,
      due_date: isLinked && !isEditingInstance ? null : form.due_date,
      due_time: isLinked && !isEditingInstance ? null : form.due_time,
    };
    const id = editingTask.id;
    const previous = tasks;
    const links = normalizeExternalLinkDrafts(externalLinkDrafts).drafts;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...payload } : t)));
    setEditingTask(null);
    try {
      await updateTask({ id, ...payload });
      await saveExternalLinksForTask(id, links);
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
    const siblingCount = editingTask
      ? (subtasksByParent.get(editingTask.id) ?? []).length
      : 0;
    await addSubtaskDraftToEditing(subtaskMutationCtx, title, siblingCount);
  }

  async function removeExistingSubtask(subtask: SubtaskDraft) {
    await removeExistingSubtaskDraft(subtaskMutationCtx, subtask);
  }

  /**
   * Feature 075 — a Agenda passa a ter exclusão. É onde o usuário estava quando tentou apagar a
   * medicação dele: até aqui o dialog de editar tarefa só tinha "Salvar alterações", e a única
   * lixeira da tela era a de evento de projeto. Ele teria de descobrir sozinho que precisava ir
   * para a Lista.
   */
  async function handleDeleteTask(id: string) {
    setEditingTask(null);
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

  async function handleDeleteScoped(task: Task, option: TaskDeleteOption) {
    setEditingTask(null);
    await runScopedTaskDelete(task, option, { reload: load, notify: toast });
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
          {/* Controlada (aba do `TaskList`), o seletor de cima é o único — ver `AgendaGridProps`. */}
          {!isProjectFilterControlled && (
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-44" aria-label="Projeto">
                <SelectValue placeholder="Projeto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os projetos</SelectItem>
                {/* Feature 097: alinha as opções com as das outras visões. Vale para os dois
                    conjuntos da grade — tarefa sem projeto e evento recebido por convite, que
                    desde a 076 também tem `project_id` nulo. */}
                <SelectItem value="null">Sem projeto</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
          onToggleQuick={toggleTaskDone}
          onToggleTaskDone={toggleTaskDone}
          onCreateAt={(day, hour) => openEventCreate(hourSlotStartsAt(day, hour))}
          onOpenDay={setDayModalKey}
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
              // Pontuais por duração/medicação (072) e por `is_quick` (070) não disputam as 3
              // vagas de chip: um dia com 4 remédios deixa de gastar os chips e continua mostrando
              // as tarefas de verdade.
              const { groups: pointGroups, rest: afterPoints } = groupPointItems(items);
              const pointTasks = pointGroups.flatMap((group) =>
                group.items.flatMap((item) => (item.kind === "task" ? [item.task] : []))
              );
              const { quick } = splitAgendaItems(afterPoints);
              const chipItems = afterPoints.filter(
                (item) => !(item.kind === "task" && isQuickTask(item.task))
              );
              const visible = chipItems.slice(0, MONTH_MAX_CHIPS_PER_DAY);
              const overflow = chipItems.length - visible.length;
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
                  {/* Alvo de criação (feature 067): cobre a célula por baixo do conteúdo. */}
                  <button
                    type="button"
                    aria-label={`Novo evento em ${format(day, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`}
                    tabIndex={-1}
                    onClick={() => openEventCreate(monthCellStartsAt(day))}
                    className="absolute inset-0 z-0 h-full w-full cursor-pointer"
                  />
                  <div className="pointer-events-none relative z-10">
                    {/* Feature 075: o número do dia abre o modal do dia. */}
                    <button
                      type="button"
                      onClick={() => setDayModalKey(key)}
                      aria-label={`Ver tudo do dia ${format(day, "d 'de' MMMM", { locale: ptBR })}`}
                      className={cn(
                        "pointer-events-auto mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs hover:bg-muted",
                        isToday &&
                          "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
                        !inMonth && "text-muted-foreground"
                      )}
                    >
                      {format(day, "d")}
                    </button>
                    <QuickTaskDotRow
                      tasks={quick}
                      onToggle={toggleTaskDone}
                      onOverflow={() => setDayModalKey(key)}
                      label={`Tarefas pontuais de ${format(day, "d 'de' MMMM", { locale: ptBR })}`}
                      className="mb-0.5 [&>*]:pointer-events-auto"
                    />
                    <PointTaskDots
                      items={pointTasks}
                      onToggle={toggleTaskDone}
                      onOverflowClick={() => setDayModalKey(key)}
                      className="mb-0.5 [&>*]:pointer-events-auto"
                      label={`Tarefas pontuais — ${format(day, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`}
                    />
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
                            projectColor={eventProjectColor(
                              eventProjectId(item.event),
                              projectById
                            )}
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
                  projectColor={eventProjectColor(eventProjectId(item.event), projectById)}
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
              onReorderSubtasks={(next) => {
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
                    description: getErrorMessage(
                      error,
                      "Não foi possível reordenar as subtarefas."
                    ),
                    variant: "destructive",
                  });
                });
              }}
              externalLinks={externalLinkDrafts}
              onExternalLinksChange={setExternalLinkDrafts}
              projects={projects}
            />
          )}
          <div className="flex gap-2">
            <Button onClick={handleSaveTaskEdit} className="flex-1">
              Salvar alterações
            </Button>
            {/* Item virtual (`virtual:`) não existe no banco — não há o que excluir. Na prática ele
                nem chega aqui (o chip/bolinha dele é `disabled`), mas a guarda fica explícita. */}
            {editingTask && !isVirtualTask(editingTask) && (
              <TaskDeleteDialog
                task={editingTask}
                onConfirm={() => handleDeleteTask(editingTask.id)}
                onConfirmScoped={(option) => handleDeleteScoped(editingTask, option)}
              >
                <Button variant="outline" size="icon" className="text-destructive" aria-label="Excluir tarefa">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TaskDeleteDialog>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <EventFormDialog
        open={eventDialog.open}
        onOpenChange={(v) => (v ? undefined : closeEventDialog())}
        editing={eventDialog.editing}
        projects={projects}
        tasks={tasks}
        prefillStartsAt={eventDialog.prefillStartsAt}
        onOpenTask={openTaskFromEventDialog}
        onSave={handleSaveEvent}
        onDelete={
          eventDialog.editing ? () => handleDeleteEvent(eventDialog.editing!.id) : undefined
        }
        extraActions={
          <>
            {editingEventProject ? (
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link to={`/tasks/projects/${editingEventProject.id}`}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ir para o projeto
                </Link>
              </Button>
            ) : null}
            {/* Feature 076: convidar — só no evento com projeto próprio (não cópia por convite). */}
            {eventDialog.editing?.project_id ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setInvitingEvent(eventDialog.editing)}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Convidar
              </Button>
            ) : null}
          </>
        }
      />

      {invitingEvent && (
        <EventInviteDialog
          eventId={invitingEvent.id}
          eventTitle={invitingEvent.title}
          open
          onOpenChange={(aberto) => {
            if (!aberto) setInvitingEvent(null);
          }}
        />
      )}
    </div>
  );
}
