import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Pen, Plus, Trash2 } from "lucide-react";
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
import { DatePicker } from "@/components/DatePicker";
import { formatLocalIsoDate } from "@/lib/dates";
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
  fetchProjectById,
  fetchTasks,
  updateTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Project, Task, TaskCreateRequest, TaskStatus } from "@/types/tasks";
import type { Recurring } from "@/types/recurring";
import { useToast } from "@/hooks/use-toast";
import { useBreadcrumbTitle } from "@/hooks/useBreadcrumbTitle";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const STATUSES: TaskStatus[] = ["todo", "doing", "done"];
const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "A fazer",
  doing: "Fazendo",
  done: "Feito",
};

const emptyTask = (projectId: string): TaskCreateRequest => ({
  project_id: projectId,
  parent_task_id: null,
  title: "",
  description: "",
  status: "todo",
  tags: [],
  due_date: null,
  recurrence_rule: null,
  linked_recurring_id: null,
});

export default function ProjectKanban() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recurrings, setRecurrings] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyTask(id ?? ""));
  const [tagsInput, setTagsInput] = useState("");
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, string>>({});
  const { toast } = useToast();

  useBreadcrumbTitle(project?.name);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [projectData, taskList, recurringList] = await Promise.all([
        fetchProjectById(id),
        fetchTasks(),
        fetchRecurringTransactions(),
      ]);
      setProject(projectData);
      setTasks(taskList.filter((t) => t.project_id === id));
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

  const subtasksByParent = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.parent_task_id) continue;
      const list = map.get(task.parent_task_id) ?? [];
      list.push(task);
      map.set(task.parent_task_id, list);
    }
    return map;
  }, [tasks]);

  function openCreate(status: TaskStatus) {
    if (!id) return;
    setEditing(null);
    setForm({ ...emptyTask(id), status });
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
    const payload = {
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
        tags: [],
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

              <div className="space-y-2">
                {topLevelByStatus[status].length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Nenhuma tarefa
                  </p>
                ) : (
                  topLevelByStatus[status].map((task) => {
                    const subtasks = subtasksByParent.get(task.id) ?? [];
                    const doneSubtasks = subtasks.filter((s) => s.status === "done").length;
                    return (
                      <article
                        key={task.id}
                        className="space-y-2 rounded-xl border bg-card p-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-medium">{task.title}</p>
                          <div className="flex shrink-0 gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn("h-7 w-7", ICON_EDIT_BUTTON_CLASS)}
                              onClick={() => openEdit(task)}
                            >
                              <Pen className="h-3 w-3" />
                            </Button>
                            <ConfirmDeleteDialog
                              title="Excluir esta tarefa?"
                              description={
                                subtasks.length > 0
                                  ? "As subtarefas também serão excluídas."
                                  : undefined
                              }
                              onConfirm={() => handleDelete(task.id)}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </ConfirmDeleteDialog>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {task.due_date && <span>Prazo: {task.due_date}</span>}
                          {task.linked_recurring_id && (
                            <Badge variant="outline" className="text-[10px]">
                              Vinculada a Recorrência
                            </Badge>
                          )}
                          {subtasks.length > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              {doneSubtasks}/{subtasks.length} subtarefas
                            </Badge>
                          )}
                          {task.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-[10px]">
                              {tag}
                            </Badge>
                          ))}
                        </div>

                        {subtasks.length > 0 && (
                          <ul className="space-y-1 border-t pt-2">
                            {subtasks.map((subtask) => (
                              <li key={subtask.id} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={subtask.status === "done"}
                                  onChange={() => toggleSubtask(subtask)}
                                />
                                <span
                                  className={cn(
                                    "truncate text-xs",
                                    subtask.status === "done" &&
                                      "text-muted-foreground line-through"
                                  )}
                                >
                                  {subtask.title}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="flex gap-1">
                          <Input
                            value={subtaskDrafts[task.id] ?? ""}
                            onChange={(e) =>
                              setSubtaskDrafts((prev) => ({ ...prev, [task.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") addSubtask(task);
                            }}
                            placeholder="Adicionar subtarefa"
                            className="h-7 text-xs"
                          />
                        </div>

                        <div className="flex justify-between border-t pt-2">
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              disabled={colIndex === 0}
                              onClick={() => moveStatus(task, -1)}
                              aria-label="Mover para trás"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              disabled={colIndex === STATUSES.length - 1}
                              onClick={() => moveStatus(task, 1)}
                              aria-label="Mover para frente"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {task.status === "done" && !task.linked_recurring_id && (
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" asChild>
                              <Link
                                to={`/finance/transactions?new=1&nature=despesa&desc=${encodeURIComponent(task.title)}`}
                              >
                                Lançar transação
                              </Link>
                            </Button>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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
              <FormLabel optional>Tags (separadas por vírgula)</FormLabel>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="casa, urgente"
              />
            </div>
            <div>
              <FormLabel optional>Vincular a uma Recorrência Financeira</FormLabel>
              <Select
                value={form.linked_recurring_id ?? "none"}
                onValueChange={(v) =>
                  setForm({ ...form, linked_recurring_id: v === "none" ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {recurrings.map((rec) => (
                    <SelectItem key={rec.id} value={rec.id}>
                      {rec.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!form.linked_recurring_id && (
              <div>
                <FormLabel optional>Prazo</FormLabel>
                <DatePicker
                  clearable
                  date={form.due_date ? new Date(`${form.due_date}T12:00:00`) : undefined}
                  onSelect={(d) =>
                    setForm({ ...form, due_date: d ? formatLocalIsoDate(d) : null })
                  }
                />
              </div>
            )}
            <Button onClick={handleSave} className="w-full">
              {editing ? "Salvar alterações" : "Criar tarefa"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
