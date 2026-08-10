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
import { ChevronLeft, ChevronRight, DollarSign, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/DatePicker";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { FormLabel, FORM_DIALOG_CONTENT_CLASS, FORM_FIELDS_CLASS } from "@/components/FormLabel";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { TaskPriorityField } from "./TaskPriorityField";
import { TaskDescriptionField } from "./TaskDescriptionField";
import {
  deleteProjectEvent,
  fetchProjectEvents,
  fetchProjects,
  fetchTasks,
  updateTask,
} from "@/api/tasks";
import {
  computeMonthGridDays,
  computeVirtualOccurrences,
  computeWeekDays,
  groupCalendarItemsByDay,
  type CalendarItem,
} from "@/domain/tasks";
import { formatLocalIsoDate } from "@/lib/dates";
import type { Project, ProjectEvent, Task } from "@/types/tasks";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_MAX_CHIPS_PER_DAY = 3;
const WEEK_MAX_CHIPS_PER_DAY = 8;

type CalendarViewMode = "month" | "week" | "day";

const STATUS_DOT_CLASS: Record<Task["status"], string> = {
  todo: "bg-muted-foreground/50",
  doing: "bg-blue-500",
  done: "bg-green-500",
};

function dayKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function isVirtualTask(task: Task): boolean {
  return task.id.startsWith("virtual:");
}

function TaskChip({
  task,
  onClick,
}: {
  task: Task;
  onClick: () => void;
}) {
  if (isVirtualTask(task)) {
    return (
      <div
        className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] opacity-60"
        title="Próxima ocorrência — ainda não criada, aparece automaticamente nesse dia"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-muted-foreground/60" />
        <span className="truncate italic">{task.title}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] hover:bg-muted"
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT_CLASS[task.status])} />
      <span className={cn("truncate", task.status === "done" && "text-muted-foreground line-through")}>
        {task.title}
      </span>
      {task.linked_recurring_id && (
        <DollarSign className="h-2.5 w-2.5 shrink-0 text-muted-foreground" aria-label="Vinculada a Recorrência" />
      )}
    </button>
  );
}

function EventChip({
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

/** Linha da visão diária — mais espaço que o chip de 10px do mês/semana, com horário explícito
 * (ou "Sem horário") em vez de só ordenar silenciosamente por ele. */
function DayViewItemRow({
  item,
  projectColor,
  onOpenTask,
  onOpenEvent,
}: {
  item: CalendarItem<Task, ProjectEvent>;
  projectColor: string | null;
  onOpenTask: (task: Task) => void;
  onOpenEvent: (event: ProjectEvent) => void;
}) {
  if (item.kind === "task") {
    const { task } = item;
    const done = task.status === "done";
    const virtual = isVirtualTask(task);
    return (
      <button
        type="button"
        disabled={virtual}
        onClick={() => onOpenTask(task)}
        title={virtual ? "Próxima ocorrência — ainda não criada, aparece automaticamente nesse dia" : undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border p-3 text-left",
          virtual ? "cursor-default opacity-60" : "hover:bg-muted"
        )}
      >
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            virtual ? "border border-muted-foreground/60" : STATUS_DOT_CLASS[task.status]
          )}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-medium",
            done && "text-muted-foreground line-through",
            virtual && "italic"
          )}
        >
          {task.title}
        </span>
        {task.linked_recurring_id && (
          <DollarSign className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Vinculada a Recorrência" />
        )}
        <span className="shrink-0 text-xs text-muted-foreground">
          {task.due_time ? task.due_time.slice(0, 5) : "Sem horário"}
        </span>
      </button>
    );
  }

  const { event } = item;
  return (
    <button
      type="button"
      onClick={() => onOpenEvent(event)}
      className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted"
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: projectColor ?? "hsl(var(--muted-foreground))" }}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{event.title}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {format(new Date(event.starts_at), "HH:mm")}
      </span>
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
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [dayModalKey, setDayModalKey] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [viewingEvent, setViewingEvent] = useState<ProjectEvent | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const [taskList, projectList, eventList] = await Promise.all([
        fetchTasks(),
        fetchProjects(),
        fetchProjectEvents(),
      ]);
      setTasks(taskList);
      setProjects(projectList);
      setEvents(eventList);
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

  const filteredTasks = useMemo(
    () =>
      [...tasks, ...virtualTasks].filter(
        (t) =>
          !t.parent_task_id &&
          !(t.linked_recurring_id && t.linked_installment_number == null) &&
          (projectFilter === "all" ? true : t.project_id === projectFilter)
      ),
    [tasks, virtualTasks, projectFilter]
  );

  const filteredEvents = useMemo(
    () =>
      events.filter((e) => (projectFilter === "all" ? true : e.project_id === projectFilter)),
    [events, projectFilter]
  );

  const itemsByDay = useMemo(
    () => groupCalendarItemsByDay(filteredTasks, filteredEvents),
    [filteredTasks, filteredEvents]
  );

  const today = new Date();
  const dayModalItems = dayModalKey ? (itemsByDay.get(dayModalKey) ?? []) : [];

  function openTaskFromChip(task: Task) {
    setDayModalKey(null);
    setEditingTask(task);
  }

  function openEventFromChip(event: ProjectEvent) {
    setDayModalKey(null);
    setViewingEvent(event);
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

  async function saveTaskEdit(payload: {
    title: string;
    description: string;
    due_date: string | null;
    due_time: string | null;
    priority: Task["priority"];
  }) {
    if (!editingTask) return;
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

  async function handleDeleteEvent(id: string) {
    try {
      await deleteProjectEvent(id);
      setViewingEvent(null);
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
        </div>
      </div>

      {loading ? (
        <TableLoadingSkeleton rows={5} />
      ) : viewMode === "day" ? (
        (() => {
          const key = dayKey(focusDate);
          const items = itemsByDay.get(key) ?? [];
          return (
            <div className="space-y-1.5 rounded-lg border p-3">
              {items.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">Nada agendado nesse dia.</p>
              ) : (
                items.map((item) => (
                  <DayViewItemRow
                    key={item.kind === "task" ? item.task.id : item.event.id}
                    item={item}
                    projectColor={
                      item.kind === "event"
                        ? (projectById.get(item.event.project_id)?.color ?? null)
                        : null
                    }
                    onOpenTask={openTaskFromChip}
                    onOpenEvent={openEventFromChip}
                  />
                ))
              )}
            </div>
          );
        })()
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
              const maxChips = viewMode === "week" ? WEEK_MAX_CHIPS_PER_DAY : MONTH_MAX_CHIPS_PER_DAY;
              const visible = items.slice(0, maxChips);
              const overflow = items.length - visible.length;
              const inMonth = viewMode === "month" ? isSameMonth(day, focusDate) : true;
              const isToday = isSameDay(day, today);
              return (
                <div
                  key={key}
                  className={cn(
                    "border-b border-r p-1",
                    viewMode === "week" ? "min-h-40 sm:min-h-52" : "min-h-24 sm:min-h-28",
                    !inMonth && "bg-muted/20"
                  )}
                >
                  <span
                    className={cn(
                      "mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs",
                      isToday && "bg-primary font-semibold text-primary-foreground",
                      !inMonth && "text-muted-foreground"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  <div className="space-y-0.5">
                    {visible.map((item) =>
                      item.kind === "task" ? (
                        <TaskChip key={item.task.id} task={item.task} onClick={() => openTaskFromChip(item.task)} />
                      ) : (
                        <EventChip
                          key={item.event.id}
                          event={item.event}
                          projectColor={projectById.get(item.event.project_id)?.color ?? null}
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
                <TaskChip key={item.task.id} task={item.task} onClick={() => openTaskFromChip(item.task)} />
              ) : (
                <EventChip
                  key={item.event.id}
                  event={item.event}
                  projectColor={projectById.get(item.event.project_id)?.color ?? null}
                  onClick={() => openEventFromChip(item.event)}
                />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CalendarTaskDialog
        task={editingTask}
        onOpenChange={(v) => !v && setEditingTask(null)}
        onToggleDone={() => editingTask && toggleTaskDone(editingTask)}
        onSave={saveTaskEdit}
      />

      <Dialog open={!!viewingEvent} onOpenChange={(v) => !v && setViewingEvent(null)}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogHeader>
            <DialogTitle>{viewingEvent?.title}</DialogTitle>
          </DialogHeader>
          {viewingEvent && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {format(new Date(viewingEvent.starts_at), "dd/MM/yyyy 'às' HH:mm")}
              </p>
              {projectById.get(viewingEvent.project_id) && (
                <Badge variant="outline" className="gap-1">
                  {projectById.get(viewingEvent.project_id)?.name}
                </Badge>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <Link to={`/tasks/projects/${viewingEvent.project_id}`}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ir para o projeto
                  </Link>
                </Button>
                <ConfirmDeleteDialog title="Excluir este evento?" onConfirm={() => handleDeleteEvent(viewingEvent.id)}>
                  <Button variant="outline" size="sm" className="gap-1.5 text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir
                  </Button>
                </ConfirmDeleteDialog>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CalendarTaskDialog({
  task,
  onOpenChange,
  onToggleDone,
  onSave,
}: {
  task: Task | null;
  onOpenChange: (open: boolean) => void;
  onToggleDone: () => void;
  onSave: (payload: {
    title: string;
    description: string;
    due_date: string | null;
    due_time: string | null;
    priority: Task["priority"];
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [dueTime, setDueTime] = useState<string | null>(null);
  const [priority, setPriority] = useState<Task["priority"]>(null);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? "");
    setDueDate(task.due_date);
    setDueTime(task.due_time ?? null);
    setPriority(task.priority ?? null);
  }, [task]);

  if (!task) {
    return <Dialog open={false} onOpenChange={onOpenChange} />;
  }

  const done = task.status === "done";

  function handleSave() {
    if (!title.trim()) return;
    onSave({ title: title.trim(), description, due_date: dueDate, due_time: dueTime, priority });
  }

  return (
    <Dialog open={!!task} onOpenChange={onOpenChange}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleDone}
              aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                done ? "border-primary bg-primary" : "border-muted-foreground/40 hover:border-primary"
              )}
            />
            Editar tarefa
          </DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          {task.linked_recurring_id && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" />
              Vinculada a uma Recorrência Financeira — concluir aqui já reflete em Finanças.
            </p>
          )}
          <div>
            <FormLabel required>Título</FormLabel>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <FormLabel optional>Descrição</FormLabel>
            <TaskDescriptionField value={description} onChange={setDescription} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FormLabel optional>Prazo</FormLabel>
              <DatePicker
                clearable
                date={dueDate ? new Date(`${dueDate}T12:00:00`) : undefined}
                onSelect={(d) => setDueDate(d ? formatLocalIsoDate(d) : null)}
              />
            </div>
            {dueDate && (
              <div>
                <FormLabel optional>Horário</FormLabel>
                <Input
                  type="time"
                  value={dueTime ?? ""}
                  onChange={(e) => setDueTime(e.target.value || null)}
                  className="h-9"
                />
              </div>
            )}
          </div>
          <TaskPriorityField value={priority ?? null} onChange={setPriority} />
          <Button onClick={handleSave} className="w-full">
            Salvar alterações
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Recorrência, tags, subtarefas e projeto: edite em{" "}
            <Link to="/tasks" className="underline underline-offset-2">
              Tarefas
            </Link>
            .
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
