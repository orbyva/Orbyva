import { useCallback, useEffect, useMemo, useState } from "react";
import { Pen, Tag as TagIcon, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmptyState } from "@/components/EmptyState";
import { FormLabel, FORM_DIALOG_CONTENT_CLASS, FORM_FIELDS_CLASS } from "@/components/FormLabel";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { LabelColorPicker } from "./LabelColorPicker";
import { deleteTag, fetchProjects, fetchTags, fetchTasks, updateTag } from "@/api/tasks";
import type { Project, Tag, Task } from "@/types/tasks";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

export default function Tags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#94a3b8");
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const [tagList, taskList, projectList] = await Promise.all([
        fetchTags(),
        fetchTasks(),
        fetchProjects(),
      ]);
      setTags(tagList);
      setTasks(taskList);
      setProjects(projectList);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível carregar as tags."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const usageCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      for (const id of t.tag_ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const p of projects) {
      for (const id of p.tag_ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [tasks, projects]);

  function openEdit(tag: Tag) {
    setEditing(tag);
    setName(tag.name);
    setColor(tag.color);
  }

  async function handleSave() {
    if (!editing || !name.trim()) return;
    try {
      await updateTag({ id: editing.id, name: name.trim(), color });
      toast({ title: "Tag salva!", duration: 2000 });
      setEditing(null);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar a tag."),
        variant: "destructive",
      });
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTag(id);
      toast({ title: "Tag excluída", duration: 2000 });
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível excluir a tag."),
        variant: "destructive",
      });
    }
  }

  return (
    <PageShell
      title="Tags"
      description="Gerencie as tags usadas em tarefas e projetos — nome, cor e onde estão em uso."
      eyebrow="Produtividade"
      actions={
        // As duas telas de configuração do módulo ficam fora da sidebar (feature 087): sem um
        // ponteiro de uma para a outra, a de regras de ícone só seria alcançável de dentro do
        // formulário de tarefa.
        <Button asChild variant="outline">
          <Link to="/tasks/link-icons">Ícones de link</Link>
        </Button>
      }
    >
      {loading ? (
        <TableLoadingSkeleton rows={5} columns={3} />
      ) : tags.length === 0 ? (
        <EmptyState
          icon={TagIcon}
          title="Nenhuma tag ainda"
          description="Tags são criadas direto no formulário de tarefa ou projeto — digite um nome novo e confirme."
        />
      ) : (
        <div className="space-y-2">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="truncate font-medium">{tag.name}</span>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {usageCount.get(tag.id) ?? 0} em uso
                </Badge>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => openEdit(tag)}
                >
                  <Pen className="h-3.5 w-3.5" />
                </Button>
                <ConfirmDeleteDialog
                  title="Excluir esta tag?"
                  description="As tarefas e projetos continuam existindo, só perdem o vínculo com esta tag."
                  onConfirm={() => handleDelete(tag.id)}
                >
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </ConfirmDeleteDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogHeader>
            <DialogTitle>Editar tag</DialogTitle>
          </DialogHeader>
          <div className={FORM_FIELDS_CLASS}>
            <div>
              <FormLabel required>Nome</FormLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <FormLabel optional>Cor</FormLabel>
              <div className="mt-1.5">
                <LabelColorPicker color={color} onChange={setColor} />
              </div>
            </div>
            <Button onClick={handleSave} className="w-full">
              Salvar alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
