import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NotebookPen, PenTool, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { createNote, deleteNote, fetchNotes } from "@/api/notes/notes";
import { fetchProjects } from "@/api/tasks/projects";
import { filterNotes } from "@/domain/notes/filters";
import { noteExcerpt } from "@/domain/notes/noteDraft";
import { canvasElementCount } from "@/domain/notes/canvasScene";
import { useToast } from "@/hooks/use-toast";
import { formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { Note, NoteKind } from "@/types/notes";
import type { Project } from "@/types/tasks";

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const [noteList, projectList] = await Promise.all([
        fetchNotes(),
        fetchProjects(),
      ]);
      setNotes(noteList);
      setProjects(projectList);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível carregar as notas."),
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const projectNameById = useMemo(
    () =>
      Object.fromEntries(projects.map((p) => [p.id, p.name])) as Record<
        string,
        string | undefined
      >,
    [projects]
  );

  /** O filtro é local: a lista inteira já está na memória e digitar não pode ir ao banco por tecla. */
  const visibleNotes = useMemo(() => filterNotes(notes, query), [notes, query]);

  /**
   * Cria e já abre. `kind` é o que decide qual editor a rota `/notes/:id` monta — nota e canvas
   * moram na mesma tabela e na mesma lista (feature 058).
   */
  async function handleCreate(kind: NoteKind = "markdown") {
    setCreating(true);
    try {
      const note = await createNote({
        title: "",
        content: "",
        project_id: null,
        kind,
        // Canvas nasce com a cena vazia, não com `null`: o editor abre numa tela em branco de
        // verdade, e o `check` do banco já garante o par kind/canvas_data.
        canvas_data: kind === "canvas" ? { elements: [] } : null,
      });
      navigate(`/notes/${note.id}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description:
          kind === "canvas"
            ? getErrorMessage(error, "Não foi possível criar o canvas.")
            : getErrorMessage(error, "Não foi possível criar a nota."),
      });
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteNote(id);
      toast({ title: "Nota excluída", duration: 2000 });
      setNotes((prev) => prev.filter((note) => note.id !== id));
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
      title="Notas"
      description="Markdown na veia — anotações soltas ou vinculadas a um projeto."
      actions={
        // Dois botões lado a lado em vez de um menu: são só duas opções, e escondê-las atrás de um
        // clique a mais tornaria o canvas invisível para quem não sabe que ele existe.
        <>
          <Button
            variant="outline"
            onClick={() => handleCreate("canvas")}
            disabled={creating}
          >
            <PenTool className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Novo canvas
          </Button>
          <Button onClick={() => handleCreate("markdown")} disabled={creating}>
            Nova nota
          </Button>
        </>
      }
    >
      {notes.length > 0 && (
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filtrar notas"
          placeholder="Filtrar por título ou conteúdo…"
          className="sm:max-w-sm"
        />
      )}

      {loading ? (
        <TableLoadingSkeleton rows={4} />
      ) : notes.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="Nenhuma nota ainda"
          description="Crie uma nota para guardar o que não cabe numa tarefa — pauta de reunião, rascunho, decisão de projeto."
          action={
            // `() =>` obrigatório: passar `handleCreate` direto entregaria o MouseEvent como `kind`.
            <Button onClick={() => handleCreate("markdown")} disabled={creating}>
              Nova nota
            </Button>
          }
        />
      ) : visibleNotes.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="Nenhuma nota encontrada"
          description={`Nada com "${query}" no título nem no conteúdo.`}
        />
      ) : (
        <ul className="space-y-2">
          {visibleNotes.map((note) => {
            const isCanvas = note.kind === "canvas";
            const excerpt = noteExcerpt(note.content);
            // Canvas não tem texto para resumir: o que informa é o tamanho do desenho.
            const elementCount = isCanvas ? canvasElementCount(note.canvas_data) : 0;
            const projectName = projectNameById[note.project_id ?? ""];
            return (
              <li key={note.id}>
                <article className="flex items-start justify-between gap-2 rounded-xl border bg-card p-3.5 shadow-sm transition-colors hover:border-primary/40 sm:p-5">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => navigate(`/notes/${note.id}`)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {isCanvas ? (
                        <PenTool
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-label="Canvas"
                        />
                      ) : (
                        <NotebookPen
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-label="Nota"
                        />
                      )}
                      <h2 className="truncate font-semibold">{note.title}</h2>
                      {projectName && (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {projectName}
                        </Badge>
                      )}
                    </div>
                    {isCanvas ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {elementCount === 0
                          ? "Canvas vazio"
                          : `Canvas · ${elementCount} ${
                              elementCount === 1 ? "elemento" : "elementos"
                            }`}
                      </p>
                    ) : excerpt ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {excerpt}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        Nota vazia
                      </p>
                    )}
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Editada em {formatDateBR(note.updated_at)}
                    </p>
                  </button>
                  <ConfirmDeleteDialog
                    title="Excluir esta nota?"
                    description="O conteúdo dela será perdido."
                    onConfirm={() => handleDelete(note.id)}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive"
                      aria-label={`Excluir nota ${note.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </ConfirmDeleteDialog>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
