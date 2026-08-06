import { ListTodo, Pen, Trash2 } from "lucide-react";
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
  fetchProjects,
  fetchTasks,
  updateTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import { filterTasks, sortTasksByDueDate } from "@/domain/tasks";
import type {
  Project,
  RecurrenceFrequency,
  Task,
  TaskCreateRequest,
} from "@/types/tasks";
import type { Recurring } from "@/types/recurring";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  const [repeats, setRepeats] = useState(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("daily");
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

  function openCreate() {
    setEditing(null);
    setForm(emptyTask());
    setTagsInput("");
    setRepeats(false);
    setFrequency("daily");
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
    setRepeats(!!task.recurrence_rule);
    setFrequency(task.recurrence_rule?.frequency ?? "daily");
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
      recurrence_rule:
        !isLinked && repeats && form.due_date ? { frequency, interval: 1 } : null,
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
            <div>
              <FormLabel optional>Tags (separadas por vírgula)</FormLabel>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="casa, urgente"
              />
            </div>
            {!form.linked_recurring_id && (
              <>
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
                {form.due_date && (
                  <div className="flex items-center gap-2">
                    <input
                      id="repeats"
                      type="checkbox"
                      checked={repeats}
                      onChange={(e) => setRepeats(e.target.checked)}
                    />
                    <FormLabel htmlFor="repeats">Repetir</FormLabel>
                    {repeats && (
                      <Select
                        value={frequency}
                        onValueChange={(v) => setFrequency(v as RecurrenceFrequency)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Diária</SelectItem>
                          <SelectItem value="weekly">Semanal</SelectItem>
                          <SelectItem value="monthly">Mensal</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </>
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
