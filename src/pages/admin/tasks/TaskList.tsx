import { Check, ListTodo, Pen, Repeat, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { TaskRecurrenceField } from "./TaskRecurrenceField";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
  ICON_EDIT_BUTTON_CLASS,
} from "@/components/FormLabel";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import {
  createTask,
  deleteTask,
  fetchProjects,
  fetchTasks,
  updateTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import {
  AGENDA_BUCKET_LABELS,
  AGENDA_BUCKET_ORDER,
  collapseRecurringSeries,
  filterTasks,
  findSeriesTasks,
  groupTasksByAgendaBucket,
  isRecurringTask,
  sortTasksByDueDate,
} from "@/domain/tasks";
import type { Project, Task, TaskCreateRequest, TaskStatus } from "@/types/tasks";
import type { Recurring } from "@/types/recurring";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";

function TaskAgendaCard({
  task,
  projectName,
  onToggleDone,
  onOpenSeries,
}: {
  task: Task;
  projectName: string;
  onToggleDone: () => void;
  onOpenSeries: () => void;
}) {
  const done = task.status === "done";
  const recurring = isRecurringTask(task);
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <button
        type="button"
        onClick={onToggleDone}
        aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          done
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-primary"
        )}
      >
        {done && <Check className="h-3 w-3" />}
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={recurring ? onOpenSeries : undefined}
        disabled={!recurring}
      >
        <div className="flex items-center gap-1.5">
          {recurring && (
            <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Recorrente" />
          )}
          <p
            className={cn(
              "truncate text-sm font-medium",
              done && "text-muted-foreground line-through"
            )}
          >
            {task.title}
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">
            {projectName}
          </Badge>
          {done && task.completed_at ? (
            <span>Concluída em {task.completed_at.slice(0, 10)}</span>
          ) : (
            task.due_date && <span>Prazo: {task.due_date}</span>
          )}
        </div>
      </button>
    </div>
  );
}

const emptyTask = (): TaskCreateRequest => ({
  project_id: null,
  parent_task_id: null,
  title: "",
  description: "",
  status: "todo",
  tags: [],
  due_date: null,
  recurrence_rule: null,
  linked_recurring_id: null,
});

export default function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [recurrings, setRecurrings] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyTask());
  const [tagFilter, setTagFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [tagsInput, setTagsInput] = useState("");
  const [activeTab, setActiveTab] = useState<"lista" | "agenda">("lista");
  const [seriesTask, setSeriesTask] = useState<Task | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const [taskList, projectList, recurringList] = await Promise.all([
        fetchTasks(),
        fetchProjects(),
        fetchRecurringTransactions(),
      ]);
      setTasks(taskList);
      setProjects(projectList);
      setRecurrings(recurringList);
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
      tag: tagFilter || undefined,
      projectId,
    });
    return sortTasksByDueDate(
      filtered.filter(
        (t) =>
          !t.parent_task_id &&
          !(t.linked_recurring_id && t.linked_installment_number == null)
      )
    );
  }, [tasks, tagFilter, projectFilter]);

  const allTags = useMemo(
    () => Array.from(new Set(tasks.flatMap((t) => t.tags))).sort(),
    [tasks]
  );

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.name);
    return map;
  }, [projects]);

  const agendaGroups = useMemo(() => {
    const todayIso = formatLocalIsoDate(new Date());
    return groupTasksByAgendaBucket(collapseRecurringSeries(visibleTasks), todayIso);
  }, [visibleTasks]);

  const seriesTasks = useMemo(
    () => (seriesTask ? findSeriesTasks(tasks, seriesTask) : []),
    [tasks, seriesTask]
  );

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

  function openCreate() {
    setEditing(null);
    setForm(emptyTask());
    setTagsInput("");
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
      tags: task.tags,
      due_date: task.due_date,
      recurrence_rule: task.recurrence_rule,
      linked_recurring_id: task.linked_recurring_id,
    });
    setTagsInput(task.tags.join(", "));
    setOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const isLinked = !!form.linked_recurring_id;
    const isEditingInstance = !!(editing && editing.linked_installment_number != null);
    const payload: TaskCreateRequest = {
      ...form,
      tags,
      due_date: isLinked && !isEditingInstance ? null : form.due_date,
    };
    try {
      if (editing) await updateTask({ id: editing.id, ...payload });
      else await createTask(payload);
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

  return (
    <PageShell
      title="Tarefas"
      description="Todas as suas tarefas, com ou sem projeto."
      actions={<Button onClick={openCreate}>Nova tarefa</Button>}
    >
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v === "agenda" ? "agenda" : "lista")}>
        <TabsList>
          <TabsTrigger value="lista">Lista</TabsTrigger>
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="mt-4 space-y-4">
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
                {allTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <TableLoadingSkeleton rows={6} />
          ) : visibleTasks.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title="Nenhuma tarefa"
              description="Crie sua primeira tarefa."
              action={<Button onClick={openCreate}>Nova tarefa</Button>}
            />
          ) : (
            <div className="space-y-2">
              {visibleTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{task.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px]">
                        {task.status === "todo"
                          ? "A fazer"
                          : task.status === "doing"
                            ? "Fazendo"
                            : "Feito"}
                      </Badge>
                      {task.linked_recurring_id && (
                        <Badge variant="outline" className="text-[10px]">
                          Vinculada a Recorrência
                        </Badge>
                      )}
                      {task.due_date && <span>Prazo: {task.due_date}</span>}
                      {task.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {task.status === "done" && !task.linked_recurring_id && (
                      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" asChild>
                        <Link
                          to={`/finance/transactions?new=1&nature=despesa&desc=${encodeURIComponent(task.title)}`}
                        >
                          Lançar transação
                        </Link>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn("h-8 w-8", ICON_EDIT_BUTTON_CLASS)}
                      onClick={() => openEdit(task)}
                    >
                      <Pen className="h-3.5 w-3.5" />
                    </Button>
                    <ConfirmDeleteDialog
                      title="Excluir esta tarefa?"
                      onConfirm={() => handleDelete(task.id)}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </ConfirmDeleteDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="agenda" className="mt-4 space-y-5">
          {loading ? (
            <TableLoadingSkeleton rows={6} />
          ) : visibleTasks.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title="Nenhuma tarefa"
              description="Crie sua primeira tarefa."
              action={<Button onClick={openCreate}>Nova tarefa</Button>}
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
                      <TaskAgendaCard
                        key={task.id}
                        task={task}
                        projectName={
                          task.project_id
                            ? (projectNameById.get(task.project_id) ?? "Sem projeto")
                            : "Sem projeto"
                        }
                        onToggleDone={() => toggleDone(task)}
                        onOpenSeries={() => setSeriesTask(task)}
                      />
                    ))}
                  </div>
                </div>
              )
            )
          )}
        </TabsContent>
      </Tabs>

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
                <span>{t.due_date ?? "Sem prazo"}</span>
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
          <div className={FORM_FIELDS_CLASS}>
            <div>
              <FormLabel required>Título</FormLabel>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <FormLabel optional>Descrição</FormLabel>
              <Input
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <FormLabel optional>Projeto</FormLabel>
              <Select
                value={form.project_id ?? "none"}
                onValueChange={(v) =>
                  setForm({ ...form, project_id: v === "none" ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem projeto</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FormLabel optional>Tags (separadas por vírgula)</FormLabel>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="casa, urgente"
              />
            </div>
            <TaskRecurrenceField
              value={{
                due_date: form.due_date,
                recurrence_rule: form.recurrence_rule,
                linked_recurring_id: form.linked_recurring_id,
              }}
              recurrings={recurrings}
              onChange={(next) => setForm({ ...form, ...next })}
            />
            <Button onClick={handleSave} className="w-full">
              {editing ? "Salvar alterações" : "Criar tarefa"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
