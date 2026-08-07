import { Link } from "react-router-dom";
import { FolderKanban, Pen, Plus, Trash2 } from "lucide-react";
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
  createProject,
  createProjectEvent,
  deleteProject,
  deleteProjectEvent,
  fetchProjectEvents,
  fetchProjects,
  fetchTasks,
  updateProject,
} from "@/api/tasks";
import { topOngoingTasksForProject } from "@/domain/tasks";
import type {
  Project,
  ProjectCreateRequest,
  ProjectEvent,
  ProjectStatus,
  Task,
} from "@/types/tasks";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTimeBR } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: "Planejado",
  active: "Ativo",
  completed: "Concluído",
  archived: "Arquivado",
};

const KANBAN_STATUSES: ProjectStatus[] = ["planned", "active", "completed"];

const COLOR_SWATCHES = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

const emptyProject = (): ProjectCreateRequest => ({
  name: "",
  description: "",
  color: null,
  notes: "",
  goal_id: null,
  status: "planned",
});

function formatEventDate(iso: string): string {
  const time = new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return formatDateTimeBR(iso, time);
}

function ProjectCard({
  project,
  topTasks,
  nextEvent,
  onEdit,
  onDelete,
}: {
  project: Project;
  topTasks: Task[];
  nextEvent: ProjectEvent | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article
      className="space-y-2 rounded-xl border bg-card p-3.5 shadow-sm sm:p-5"
      style={project.color ? { borderLeft: `3px solid ${project.color}` } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Badge variant="outline" className="mb-2 text-[10px]">
            {STATUS_LABELS[project.status]}
          </Badge>
          <h3 className="truncate font-semibold">{project.name}</h3>
          {project.description && (
            <p className="mt-1 text-xs text-muted-foreground">{project.description}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", ICON_EDIT_BUTTON_CLASS)}
            onClick={onEdit}
          >
            <Pen className="h-3.5 w-3.5" />
          </Button>
          <ConfirmDeleteDialog
            title="Excluir este projeto?"
            description="As tarefas do projeto continuam existindo, mas ficam sem projeto."
            onConfirm={onDelete}
          >
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </ConfirmDeleteDialog>
        </div>
      </div>

      {project.notes && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{project.notes}</p>
      )}

      {topTasks.length > 0 && (
        <ul className="space-y-1 border-t pt-2 text-xs">
          {topTasks.map((t) => (
            <li key={t.id} className="truncate text-muted-foreground">
              • {t.title}
            </li>
          ))}
        </ul>
      )}

      {nextEvent && (
        <p className="border-t pt-2 text-[11px] text-muted-foreground">
          📅 {nextEvent.title} — {formatEventDate(nextEvent.starts_at)}
        </p>
      )}

      <Button variant="link" className="h-auto p-0 text-xs" asChild>
        <Link to={`/tasks/projects/${project.id}`}>Ver projeto</Link>
      </Button>
    </article>
  );
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState(emptyProject());
  const [view, setView] = useState<"lista" | "kanban">("lista");
  const [showArchived, setShowArchived] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventStartsAt, setEventStartsAt] = useState("");
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const [projectList, taskList, eventList] = await Promise.all([
        fetchProjects(),
        fetchTasks(),
        fetchProjectEvents(),
      ]);
      setProjects(projectList);
      setTasks(taskList);
      setEvents(eventList);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível carregar os projetos."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const eventsByProject = useMemo(() => {
    const map = new Map<string, ProjectEvent[]>();
    for (const e of events) {
      const list = map.get(e.project_id);
      if (list) list.push(e);
      else map.set(e.project_id, [e]);
    }
    for (const list of map.values()) list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return map;
  }, [events]);

  function nextEventFor(projectId: string): ProjectEvent | undefined {
    const nowIso = new Date().toISOString();
    return (eventsByProject.get(projectId) ?? []).find((e) => e.starts_at >= nowIso);
  }

  const visibleProjects = useMemo(
    () => (showArchived ? projects : projects.filter((p) => p.status !== "archived")),
    [projects, showArchived]
  );

  const kanbanByStatus = useMemo(() => {
    const map: Record<ProjectStatus, Project[]> = {
      planned: [],
      active: [],
      completed: [],
      archived: [],
    };
    for (const p of projects) map[p.status].push(p);
    return map;
  }, [projects]);

  async function applyProjectStatusChange(project: Project, nextStatus: ProjectStatus) {
    if (project.status === nextStatus) return;
    const previous = projects;
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, status: nextStatus } : p)));
    try {
      await updateProject({ id: project.id, status: nextStatus });
    } catch (error) {
      setProjects(previous);
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível mover o projeto."),
        variant: "destructive",
      });
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyProject());
    setOpen(true);
  }

  function openEdit(project: Project) {
    setEditing(project);
    setForm({
      name: project.name,
      description: project.description ?? "",
      color: project.color ?? null,
      notes: project.notes ?? "",
      goal_id: project.goal_id ?? null,
      status: project.status,
    });
    setEventTitle("");
    setEventStartsAt("");
    setOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    try {
      if (editing) await updateProject({ id: editing.id, ...form });
      else await createProject(form);
      toast({ title: "Projeto salvo!", duration: 2000 });
      setOpen(false);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar o projeto."),
        variant: "destructive",
      });
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteProject(id);
      toast({ title: "Projeto excluído", duration: 2000 });
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível excluir o projeto."),
        variant: "destructive",
      });
    }
  }

  async function handleAddEvent() {
    if (!editing || !eventTitle.trim() || !eventStartsAt) return;
    try {
      await createProjectEvent({
        project_id: editing.id,
        title: eventTitle.trim(),
        starts_at: new Date(eventStartsAt).toISOString(),
        ends_at: null,
      });
      setEventTitle("");
      setEventStartsAt("");
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível adicionar o evento."),
        variant: "destructive",
      });
    }
  }

  async function handleDeleteEvent(id: string) {
    try {
      await deleteProjectEvent(id);
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
      title="Projetos"
      description="Agrupe tarefas por projeto e acompanhe o andamento em Lista ou Kanban."
      actions={<Button onClick={openCreate}>Novo projeto</Button>}
    >
      {loading ? (
        <TableLoadingSkeleton rows={4} />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Nenhum projeto ainda"
          description="Crie seu primeiro projeto para agrupar tarefas."
          action={<Button onClick={openCreate}>Novo projeto</Button>}
        />
      ) : (
        <Tabs value={view} onValueChange={(v) => setView(v === "kanban" ? "kanban" : "lista")}>
          <TabsList>
            <TabsTrigger value="lista">Lista</TabsTrigger>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
          </TabsList>

          <TabsContent value="lista" className="mt-4 space-y-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Mostrar arquivados
            </label>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  topTasks={topOngoingTasksForProject(tasks, project.id)}
                  nextEvent={nextEventFor(project.id)}
                  onEdit={() => openEdit(project)}
                  onDelete={() => handleDelete(project.id)}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="kanban" className="mt-4">
            <div className="grid gap-4 md:grid-cols-3">
              {KANBAN_STATUSES.map((status) => (
                <div key={status} className="space-y-3">
                  <h3 className="text-sm font-semibold">
                    {STATUS_LABELS[status]}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({kanbanByStatus[status].length})
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {kanbanByStatus[status].length === 0 ? (
                      <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                        Nenhum projeto
                      </p>
                    ) : (
                      kanbanByStatus[status].map((project) => (
                        <div key={project.id} className="space-y-1.5">
                          <ProjectCard
                            project={project}
                            topTasks={topOngoingTasksForProject(tasks, project.id)}
                            nextEvent={nextEventFor(project.id)}
                            onEdit={() => openEdit(project)}
                            onDelete={() => handleDelete(project.id)}
                          />
                          <Select
                            value={project.status}
                            onValueChange={(v) =>
                              applyProjectStatusChange(project, v as ProjectStatus)
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {KANBAN_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {STATUS_LABELS[s]}
                                </SelectItem>
                              ))}
                              <SelectItem value="archived">{STATUS_LABELS.archived}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar projeto" : "Novo projeto"}</DialogTitle>
          </DialogHeader>
          <div className={FORM_FIELDS_CLASS}>
            <div>
              <FormLabel required>Nome</FormLabel>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
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
              <FormLabel required>Status</FormLabel>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as ProjectStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FormLabel optional>Cor</FormLabel>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Cor ${c}`}
                    className={cn(
                      "h-6 w-6 rounded-full border-2",
                      form.color === c ? "border-foreground" : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setForm({ ...form, color: form.color === c ? null : c })}
                  />
                ))}
              </div>
            </div>
            <div>
              <FormLabel optional>Notas</FormLabel>
              <textarea
                className="flex min-h-[64px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Contexto, decisões, links úteis…"
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            {editing && (
              <div>
                <FormLabel optional>Eventos (reuniões, horários de trabalho)</FormLabel>
                <div className="mt-1.5 space-y-1.5">
                  {(eventsByProject.get(editing.id) ?? []).map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2 text-xs"
                    >
                      <span className="min-w-0 truncate">
                        {e.title} — {formatEventDate(e.starts_at)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-destructive"
                        onClick={() => handleDeleteEvent(e.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-1.5">
                    <Input
                      placeholder="Título"
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Input
                      type="datetime-local"
                      value={eventStartsAt}
                      onChange={(e) => setEventStartsAt(e.target.value)}
                      className="h-8 w-48 text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={handleAddEvent}
                      aria-label="Adicionar evento"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <Button onClick={handleSave} className="w-full">
              {editing ? "Salvar alterações" : "Criar projeto"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
