import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, NotebookPen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { createNote, deleteNote, fetchNote, fetchNotes } from "@/api/notes/notes";
import { fetchProjects } from "@/api/tasks/projects";
import { useBreadcrumbTitle } from "@/hooks/useBreadcrumbTitle";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { Note } from "@/types/notes";
import type { Project } from "@/types/tasks";
import { NoteEditor } from "./NoteEditor";
import { CanvasEditor } from "./CanvasEditor";

/**
 * Página de uma nota (`/notes/:id`) — carrega e monta o editor que corresponde ao `kind`: markdown
 * vai para o `NoteEditor` (055), canvas para o `CanvasEditor` (058). Os dois cuidam do próprio
 * autosave.
 */
export default function NoteDetail() {
  const { id } = useParams<{ id: string }>();
  const [note, setNote] = useState<Note | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();
  useBreadcrumbTitle(note?.title);

  const load = useCallback(async () => {
    // Sem `:id` não há o que carregar — mas o loading precisa terminar, senão a página fica
    // presa no skeleton para sempre.
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      // A lista inteira vem junto porque é o dicionário dos wiki-links: resolve `[[Título]]` e
      // alimenta o autocomplete de `[[`. Uma consulta a mais aqui evita uma por ocorrência.
      const [found, noteList, projectList] = await Promise.all([
        fetchNote(id),
        fetchNotes(),
        fetchProjects(),
      ]);
      setNote(found);
      setNotes(noteList);
      setProjects(projectList);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível carregar a nota."),
      });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Cria a nota que um wiki-link quebrado aponta e abre ela — o "criar nota faltante" do Obsidian.
   * O markdown de quem apontou não é reescrito: o link passa a resolver porque agora existe uma
   * nota com aquele título (ver Decisões da 056).
   */
  async function handleCreateLinkedNote(title: string) {
    try {
      const created = await createNote({ title, content: "", project_id: null });
      navigate(`/notes/${created.id}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível criar a nota."),
      });
    }
  }

  async function handleDelete() {
    if (!note) return;
    try {
      await deleteNote(note.id);
      toast({ title: "Nota excluída", duration: 2000 });
      navigate("/notes");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível excluir a nota."),
      });
    }
  }

  return (
    <PageShell
      eyebrow="Produtividade"
      title={note?.title || "Nota"}
      actions={
        <>
          <Button variant="outline" onClick={() => navigate("/notes")}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Todas as notas
          </Button>
          {note && (
            <ConfirmDeleteDialog
              title="Excluir esta nota?"
              description="O conteúdo dela será perdido."
              onConfirm={handleDelete}
            >
              <Button variant="outline" className="text-destructive">
                <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Excluir
              </Button>
            </ConfirmDeleteDialog>
          )}
        </>
      }
    >
      {loading ? (
        <TableLoadingSkeleton rows={4} />
      ) : !note ? (
        <EmptyState
          icon={NotebookPen}
          title="Nota não encontrada"
          description="Ela pode ter sido excluída."
          action={<Button onClick={() => navigate("/notes")}>Voltar para as notas</Button>}
        />
      ) : note.kind === "canvas" ? (
        <CanvasEditor
          note={note}
          projects={projects}
          onSaved={(saved) => setNote((prev) => (prev ? { ...prev, ...saved } : prev))}
        />
      ) : (
        <NoteEditor
          note={note}
          projects={projects}
          notes={notes}
          onCreateNote={handleCreateLinkedNote}
          // Só reflete no header; recarregar do banco a cada autosave desperdiçaria consulta.
          onSaved={(saved) => setNote((prev) => (prev ? { ...prev, ...saved } : prev))}
        />
      )}
    </PageShell>
  );
}
