import { Link } from "react-router-dom";
import { FolderKanban, Pen, Trash2 } from "lucide-react";
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
  deleteProject,
  fetchProjects,
  updateProject,
} from "@/api/tasks";
import type { Project, ProjectCreateRequest, ProjectStatus } from "@/types/tasks";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Ativo",
  completed: "Concluído",
  archived: "Arquivado",
};

const emptyProject = (): ProjectCreateRequest => ({
  name: "",
  description: "",
  color: null,
  goal_id: null,
  status: "active",
});

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState(emptyProject());
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setProjects(await fetchProjects());
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
      goal_id: project.goal_id ?? null,
      status: project.status,
    });
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

  return (
    <PageShell
      title="Projetos"
      description="Agrupe tarefas por projeto e acompanhe o andamento em Kanban."
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <article
              key={project.id}
              className="rounded-xl border bg-card p-3.5 shadow-sm sm:p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Badge variant="outline" className="mb-2 text-[10px]">
                    {STATUS_LABELS[project.status]}
                  </Badge>
                  <h3 className="font-semibold">{project.name}</h3>
                  {project.description && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {project.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-8 w-8", ICON_EDIT_BUTTON_CLASS)}
                    onClick={() => openEdit(project)}
                  >
                    <Pen className="h-3.5 w-3.5" />
                  </Button>
                  <ConfirmDeleteDialog
                    title="Excluir este projeto?"
                    description="As tarefas do projeto continuam existindo, mas ficam sem projeto."
                    onConfirm={() => handleDelete(project.id)}
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
              <Button variant="link" className="mt-3 h-auto p-0 text-xs" asChild>
                <Link to={`/tasks/projects/${project.id}`}>Ver Kanban do projeto</Link>
              </Button>
            </article>
          ))}
        </div>
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
            <Button onClick={handleSave} className="w-full">
              {editing ? "Salvar alterações" : "Criar projeto"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
