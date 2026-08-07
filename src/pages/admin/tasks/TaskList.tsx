import { ListTodo } from "lucide-react";
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
import { formatLocalIsoDate } from "@/lib/dates";
import { formatDateTimeBR } from "@/lib/currency";
import { TaskRecurrenceField } from "./TaskRecurrenceField";
import { TaskPriorityField } from "./TaskPriorityField";
import { TaskSubtasksField, type SubtaskDraft } from "./TaskSubtasksField";
import { TaskDescriptionField } from "./TaskDescriptionField";
import { SubtaskEditDialog, type SubtaskEditPayload } from "./SubtaskEditDialog";
import { TagCombobox } from "./TagCombobox";
import { TaskListRow } from "./TaskViews";
import { EmptyState } from "@/components/EmptyState";
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
  fetchProjects,
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
  filterTasks,
  findSeriesTasks,
  groupSubtasksByParent,
  groupTasksByAgendaBucket,
  sortTasksByDueDate,
} from "@/domain/tasks";
import type { Project, Tag, Task, TaskCreateRequest, TaskStatus } from "@/types/tasks";
import type { Recurring } from "@/types/recurring";
import { useToast } from "@/hooks/use-toast";
import { useActiveTimer } from "@/hooks/useActiveTimer";
import { getErrorMessage } from "@/lib/errors";
import { useCallback, useEffect, useMemo, useState } from "react";

const emptyTask = (): TaskCreateRequest => ({
  project_id: null,
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

export default function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [recurrings, setRecurrings] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyTask());
  const [tagFilter, setTagFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [subtaskDrafts, setSubtaskDrafts] = useState<string[]>([]);
  const [seriesTask, setSeriesTask] = useState<Task | null>(null);
  const [editingSubtask, setEditingSubtask] = useState<Task | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
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

  const load = useCallback(async () => {
    try {
      const [taskList, projectList, tagList, recurringList] = await Promise.all([
        fetchTasks(),
        fetchProjects(),
        fetchTags(),
        fetchRecurringTransactions(),
      ]);
      setTasks(taskList);
      setProjects(projectList);
      setTags(tagList);
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
      tagId: tagFilter || undefined,
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

  const agendaGroups = useMemo(() => {
    const todayIso = formatLocalIsoDate(new Date());
    return groupTasksByAgendaBucket(collapseRecurringSeries(visibleTasks), todayIso);
  }, [visibleTasks]);

  const seriesTasks = useMemo(
    () => (seriesTask ? findSeriesTasks(tasks, seriesTask) : []),
    [tasks, seriesTask]
  );

  const subtasksByParent = useMemo(() => groupSubtasksByParent(tasks), [tasks]);

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

  function openCreate() {
    setEditing(null);
    setForm(emptyTask());
    setSubtaskDrafts([]);
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
    setSubtaskDrafts([]);
    setOpen(true);
  }

  async function handleCreateTag(name: string, color: string): Promise<Tag> {
    const tag = await createTag({ name, color });
    setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
    return tag;
  }

  async function handleSave() {
    if (!form.title.trim()) return;
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

  async function addSubtaskToEditing(title: string) {
    if (!editing) return;
    try {
      await createTask({
        ...emptyTask(),
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
      <div className="space-y-4">
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
          <div className="space-y-5">
            {AGENDA_BUCKET_ORDER.filter((bucket) => agendaGroups[bucket].length > 0).map(
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
                        onOpenSubtask={(subtask) => setEditingSubtask(subtask)}
                        onToggleDone={() => toggleDone(task)}
                        onOpenSeries={() => setSeriesTask(task)}
                        onEdit={() => openEdit(task)}
                        onDelete={() => handleDelete(task.id)}
                        isTimerRunning={runningEntry?.task_id === task.id}
                        onToggleTimer={() => toggleTimer(task)}
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
          </div>
        )}
      </div>

      <SubtaskEditDialog
        subtask={editingSubtask}
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
              <TaskDescriptionField
                value={form.description ?? ""}
                onChange={(description) => setForm({ ...form, description })}
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
            <TaskPriorityField
              value={form.priority ?? null}
              onChange={(priority) => setForm({ ...form, priority })}
            />
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
            />
            <TaskSubtasksField
              subtasks={
                editing
                  ? (subtasksByParent.get(editing.id) ?? []).map((s) => ({ id: s.id, title: s.title }))
                  : subtaskDrafts.map((title) => ({ title }))
              }
              onAdd={(title) =>
                editing ? addSubtaskToEditing(title) : setSubtaskDrafts((prev) => [...prev, title])
              }
              onRemove={(subtask, index) =>
                editing
                  ? removeExistingSubtask(subtask)
                  : setSubtaskDrafts((prev) => prev.filter((_, i) => i !== index))
              }
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
