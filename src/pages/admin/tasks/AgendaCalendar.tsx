import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addMonths, format, isSameDay, isSameMonth, subMonths } from "date-fns";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/DatePicker";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { FormLabel, FORM_DIALOG_CONTENT_CLASS, FORM_FIELDS_CLASS } from "@/components/FormLabel";
import { PageShell } from "@/components/PageShell";
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
import { computeMonthGridDays, groupCalendarItemsByDay } from "@/domain/tasks";
import { formatLocalIsoDate } from "@/lib/dates";
import type { Project, ProjectEvent, Task } from "@/types/tasks";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MAX_CHIPS_PER_DAY = 3;

const STATUS_DOT_CLASS: Record<Task["status"], string> = {
  todo: "bg-muted-foreground/50",
  doing: "bg-blue-500",
  done: "bg-green-500",
};

function dayKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function TaskChip({
  task,
  onClick,
}: {
  task: Task;
  onClick: () => void;
}) {
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

export default function AgendaCalendar() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date());
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

  const filteredTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          !t.parent_task_id &&
          !(t.linked_recurring_id && t.linked_installment_number == null) &&
          (projectFilter === "all" ? true : t.project_id === projectFilter)
      ),
    [tasks, projectFilter]
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

  const gridDays = useMemo(() => computeMonthGridDays(month), [month]);
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
    <PageShell
      title="Agenda"
      description="Tarefas, eventos de projeto e pagamentos vinculados, num calendário só."
      eyebrow="Produtividade"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setMonth((m) => subMonths(m, 1))} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-32 text-center text-sm font-semibold capitalize">
            {format(month, "MMMM 'de' yyyy", { locale: ptBR })}
          </span>
          <Button variant="ghost" size="icon" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="ml-1 h-8" onClick={() => setMonth(new Date())}>
            Hoje
          </Button>
        </div>
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

      {loading ? (
        <TableLoadingSkeleton rows={5} />
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
              const visible = items.slice(0, MAX_CHIPS_PER_DAY);
              const overflow = items.length - visible.length;
              const inMonth = isSameMonth(day, month);
              const isToday = isSameDay(day, today);
              return (
                <div
                  key={key}
                  className={cn(
                    "min-h-24 border-b border-r p-1 sm:min-h-28",
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
    </PageShell>
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
