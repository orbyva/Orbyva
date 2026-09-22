import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, FileDown, NotebookPen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { createNote, deleteNote, fetchNote, fetchNotes } from "@/api/notes/notes";
import { deleteNoteFolder, fetchNoteFolders } from "@/api/notes/folders";
import { fetchProjects } from "@/api/tasks/projects";
import { createTag, fetchTags } from "@/api/tasks/tags";
import {
  notesListHref,
  parseFolderParam,
} from "@/domain/notes/folders";
import { useBreadcrumbTitle } from "@/hooks/useBreadcrumbTitle";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { Note, NoteFolder } from "@/types/notes";
import type { Project, Tag } from "@/types/tasks";
import { NoteEditor } from "./NoteEditor";
import { CanvasEditor } from "./CanvasEditor";
import { NoteFolderDialog } from "./NoteFolderDialog";
import { NoteFolderTree } from "./NoteFolderTree";
import { NoteMarkdownPreview } from "./NoteMarkdownPreview";
import { printNote } from "@/domain/notes/printNote";

/**
 * Página de uma nota (`/notes/:id`) — carrega e monta o editor que corresponde ao `kind`: markdown
 * vai para o `NoteEditor` (055), canvas para o `CanvasEditor` (058). Os dois cuidam do próprio
 * autosave. No desktop a coluna de pastas fica ao lado: clicar uma pasta **troca o filtro e
 * volta à lista** (`/notes?folder=…`). Não mexe no `folder_id` da nota (feature 099).
 */
export default function NoteDetail() {
  const { id } = useParams<{ id: string }>();
  const [note, setNote] = useState<Note | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<NoteFolder | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const folderNav = parseFolderParam(searchParams.get("folder"));
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
      const [found, noteList, folderList, projectList, tagList] = await Promise.all([
        fetchNote(id),
        fetchNotes(),
        fetchNoteFolders(),
        fetchProjects(),
        fetchTags(),
      ]);
      setNote(found);
      setNotes(noteList);
      setFolders(folderList);
      setProjects(projectList);
      setTags(tagList);
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
      const created = await createNote({
        title,
        content: "",
        project_id: null,
        folder_id: null,
      });
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
      navigate(notesListHref(folderNav));
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível excluir a nota."),
      });
    }
  }

  async function handleDeleteFolder(folder: NoteFolder) {
    try {
      await deleteNoteFolder(folder.id);
      setNotes((prev) =>
        prev.map((item) =>
          item.folder_id === folder.id ? { ...item, folder_id: null } : item
        )
      );
      setNote((prev) =>
        prev && prev.folder_id === folder.id ? { ...prev, folder_id: null } : prev
      );
      const parentId = folder.parent_id;
      setFolders((prev) =>
        prev
          .filter((item) => item.id !== folder.id)
          .map((item) =>
            item.parent_id === folder.id ? { ...item, parent_id: parentId } : item
          )
      );
      if (folderNav === folder.id) {
        navigate(notesListHref(null), { replace: true });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível excluir a pasta."),
      });
    }
  }

  async function handleCreateTag(name: string, color: string): Promise<Tag> {
    const tag = await createTag({ name, color });
    setTags((prev) => [...prev, tag]);
    return tag;
  }

  function openCreateFolder(parentId: string | null) {
    setEditingFolder(null);
    setDefaultParentId(parentId);
    setFolderDialogOpen(true);
  }

  const editor =
    !note ? null : note.kind === "canvas" ? (
      <CanvasEditor
        note={note}
        projects={projects}
        folders={folders}
        onSaved={(saved) => setNote((prev) => (prev ? { ...prev, ...saved } : prev))}
      />
    ) : (
      <>
        <div id="note-print-root" hidden>
          <h1 className="note-print-title">{note.title}</h1>
          <NoteMarkdownPreview content={note.content} notes={notes} />
        </div>
        <NoteEditor
          note={note}
          projects={projects}
          folders={folders}
          notes={notes}
          onCreateNote={handleCreateLinkedNote}
          onSaved={(saved) => setNote((prev) => (prev ? { ...prev, ...saved } : prev))}
        />
      </>
    );

  return (
    <PageShell
      eyebrow="Produtividade"
      title={note?.title || "Nota"}
      actions={
        <>
          <Button variant="outline" asChild>
            <Link to={notesListHref(folderNav)}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Todas as notas
            </Link>
          </Button>
          {note && note.kind !== "canvas" && (
            <Button
              variant="outline"
              onClick={() => {
                const root = document.getElementById("note-print-root");
                printNote(note.title, root?.innerHTML ?? "");
              }}
            >
              <FileDown className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Exportar PDF
            </Button>
          )}
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
      <NoteFolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        folder={editingFolder}
        folders={folders}
        projects={projects}
        tags={tags}
        defaultParentId={defaultParentId}
        onCreateTag={handleCreateTag}
        onSaved={() => void load()}
      />

      {loading ? (
        <TableLoadingSkeleton rows={4} />
      ) : !note ? (
        <EmptyState
          icon={NotebookPen}
          title="Nota não encontrada"
          description="Ela pode ter sido excluída."
          action={
            <Button asChild>
              <Link to={notesListHref(folderNav)}>Voltar para as notas</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <aside className="hidden sm:block sm:w-64 sm:shrink-0 sm:sticky sm:top-4">
            <NoteFolderTree
              folders={folders}
              notes={notes}
              projects={projects}
              tags={tags}
              selected={folderNav}
              onSelect={(next) => navigate(notesListHref(next))}
              onCreate={openCreateFolder}
              onEdit={(folder) => {
                setEditingFolder(folder);
                setFolderDialogOpen(true);
              }}
              onDelete={(folder) => void handleDeleteFolder(folder)}
            />
          </aside>
          <div className="min-w-0 flex-1">{editor}</div>
        </div>
      )}
    </PageShell>
  );
}
