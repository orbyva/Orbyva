import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { createNote, fetchNotes } from "@/api/notes/notes";
import { noteExcerpt } from "@/domain/notes/noteDraft";
import { useToast } from "@/hooks/use-toast";
import { formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { Note } from "@/types/notes";

/**
 * "Notas do projeto" dentro da página do projeto (feature 055) — o vínculo no sentido
 * projeto → nota. Lista as notas com `project_id` daquele projeto e cria uma nova já vinculada.
 *
 * Fica **fora** das abas Kanban/Lista/Gantt pelo mesmo motivo de `ProjectShoppingSection`: as abas
 * alternam entre visões das *tarefas* do projeto, e nota não é uma quarta visão de tarefa — é outra
 * entidade ligada ao projeto, que deve continuar visível qualquer que seja a aba escolhida.
 *
 * É deliberadamente somente-leitura: escrever é no editor, para onde cada item leva.
 */
export function ProjectNotesSection({ projectId }: { projectId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setNotes(await fetchNotes({ projectId }));
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar as notas do projeto",
        description: getErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    setCreating(true);
    try {
      const note = await createNote({
        title: "",
        content: "",
        project_id: projectId,
      });
      navigate(`/notes/${note.id}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível criar a nota."),
      });
      setCreating(false);
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="project-notes-heading">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="project-notes-heading"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <NotebookPen className="h-4 w-4" aria-hidden="true" />
          Notas do projeto
        </h2>
        <Button variant="outline" size="sm" onClick={handleCreate} disabled={creating}>
          Nova nota
        </Button>
      </div>

      {loading ? (
        <TableLoadingSkeleton rows={2} />
      ) : notes.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="Nenhuma nota neste projeto"
          description="Crie uma nota já vinculada a este projeto — pauta de reunião, decisão tomada, rascunho."
          action={
            <Button onClick={handleCreate} disabled={creating}>
              Nova nota
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => {
            const excerpt = noteExcerpt(note.content, 100);
            return (
              <li key={note.id}>
                <Link
                  to={`/notes/${note.id}`}
                  className="block rounded-lg border bg-card p-3 transition-colors hover:border-primary/40"
                >
                  <h3 className="truncate text-sm font-medium">{note.title}</h3>
                  {excerpt && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {excerpt}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Editada em {formatDateBR(note.updated_at)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
