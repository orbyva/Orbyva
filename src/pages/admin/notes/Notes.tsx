import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GripVertical, NotebookPen, PenTool, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmptyState } from "@/components/EmptyState";
import { ModuleGuide, ModuleGuideButton } from "@/components/ModuleGuide";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { createNote, deleteNote, fetchNotes, updateNote } from "@/api/notes/notes";
import { deleteNoteFolder, fetchNoteFolders, updateNoteFolder } from "@/api/notes/folders";
import { fetchProjects } from "@/api/tasks/projects";
import { createTag, fetchTags } from "@/api/tasks/tags";
import { filterNotes } from "@/domain/notes/filters";
import { noteExcerpt } from "@/domain/notes/noteDraft";
import { canvasElementCount } from "@/domain/notes/canvasScene";
import {
  INBOX_FOLDER,
  NOTE_FOLDER_MAX_DEPTH,
  canMoveFolder,
  flattenFolderTree,
  folderIdFromDropZone,
  notesDetailHref,
  notesInFolder,
  parseFolderParam,
  type FolderNav,
} from "@/domain/notes/folders";
import { useToast } from "@/hooks/use-toast";
import { useTouchDrag } from "@/hooks/useTouchDrag";
import { formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { Note, NoteFolder, NoteKind } from "@/types/notes";
import type { Project, Tag } from "@/types/tasks";
import { NoteFolderDialog } from "./NoteFolderDialog";
import { NoteFolderTree } from "./NoteFolderTree";

const ALL_FOLDERS = "__all__";

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<NoteFolder | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);
  const [dragNoteId, setDragNoteId] = useState<string | null>(null);
  const [dragFolderId, setDragFolderId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragNoteIdRef = useRef<string | null>(null);
  const dragFolderIdRef = useRef<string | null>(null);
  const skipOpenAfterDrag = useRef(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const folderNav = parseFolderParam(searchParams.get("folder"));

  function setFolderNav(next: FolderNav) {
    const params = new URLSearchParams(searchParams);
    if (next == null) params.delete("folder");
    else params.set("folder", next);
    setSearchParams(params, { replace: true });
  }

  const load = useCallback(async () => {
    try {
      const [noteList, folderList, projectList, tagList] = await Promise.all([
        fetchNotes(),
        fetchNoteFolders(),
        fetchProjects(),
        fetchTags(),
      ]);
      setNotes(noteList);
      setFolders(folderList);
      setProjects(projectList);
      setTags(tagList);
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
  const folderNameById = useMemo(
    () =>
      Object.fromEntries(folders.map((f) => [f.id, f.name])) as Record<
        string,
        string | undefined
      >,
    [folders]
  );

  const notesInView = useMemo(
    () => notesInFolder(notes, folderNav),
    [notes, folderNav]
  );
  /** O filtro de texto é local e aplica depois do recorte por pasta. */
  const visibleNotes = useMemo(
    () => filterNotes(notesInView, query),
    [notesInView, query]
  );

  const openFolder = useMemo(
    () =>
      typeof folderNav === "string" && folderNav !== INBOX_FOLDER
        ? (folders.find((f) => f.id === folderNav) ?? null)
        : null,
    [folderNav, folders]
  );

  /**
   * Cria e já abre. Com a pasta aberta, a nota nasce nela (e com o projeto da pasta, se houver)
   * — atalho de formulário, não vínculo contínuo.
   */
  async function handleCreate(kind: NoteKind = "markdown") {
    setCreating(true);
    try {
      const note = await createNote({
        title: "",
        content: "",
        project_id: openFolder?.project_id ?? null,
        folder_id: openFolder?.id ?? null,
        kind,
        canvas_data: kind === "canvas" ? { elements: [] } : null,
      });
      navigate(notesDetailHref(note.id, folderNav));
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

  async function handleDeleteFolder(folder: NoteFolder) {
    try {
      await deleteNoteFolder(folder.id);
      setNotes((prev) =>
        prev.map((note) =>
          note.folder_id === folder.id ? { ...note, folder_id: null } : note
        )
      );
      setFolders((prev) => {
        const parentId = folder.parent_id;
        return prev
          .filter((item) => item.id !== folder.id)
          .map((item) =>
            item.parent_id === folder.id ? { ...item, parent_id: parentId } : item
          );
      });
      if (folderNav === folder.id) setFolderNav(null);
      toast({ title: "Pasta excluída", duration: 2000 });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível excluir a pasta."),
      });
    }
  }

  function endDrag() {
    dragNoteIdRef.current = null;
    dragFolderIdRef.current = null;
    setDragNoteId(null);
    setDragFolderId(null);
    setDropTarget(null);
  }

  /** Mover só troca `folder_id`. Projeto da nota fica como está. */
  async function handleMoveNote(noteId: string, folderId: string | null) {
    const note = notes.find((item) => item.id === noteId);
    if (!note || note.folder_id === folderId) {
      endDrag();
      return;
    }
    const previous = note.folder_id;
    setNotes((prev) =>
      prev.map((item) =>
        item.id === noteId ? { ...item, folder_id: folderId } : item
      )
    );
    endDrag();
    try {
      await updateNote({ id: noteId, folder_id: folderId });
    } catch (error) {
      setNotes((prev) =>
        prev.map((item) =>
          item.id === noteId ? { ...item, folder_id: previous } : item
        )
      );
      toast({
        variant: "destructive",
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível mover a nota."),
      });
    }
  }

  /** Aninhar pasta: só `parent_id`. Notas de dentro não mudam de lugar. */
  async function handleMoveFolder(folderId: string, nextParentId: string) {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder || folder.id === nextParentId || folder.parent_id === nextParentId) {
      endDrag();
      return;
    }
    if (!canMoveFolder(folders, folderId, nextParentId)) {
      endDrag();
      toast({
        variant: "destructive",
        title: "Não dá para mover",
        description: `A pasta não pode ter mais de ${NOTE_FOLDER_MAX_DEPTH} níveis, nem ir para dentro de si mesma.`,
      });
      return;
    }
    const previous = folder.parent_id;
    setFolders((prev) =>
      prev.map((item) =>
        item.id === folderId ? { ...item, parent_id: nextParentId } : item
      )
    );
    endDrag();
    try {
      await updateNoteFolder({ id: folderId, parent_id: nextParentId });
    } catch (error) {
      setFolders((prev) =>
        prev.map((item) =>
          item.id === folderId ? { ...item, parent_id: previous } : item
        )
      );
      toast({
        variant: "destructive",
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível mover a pasta."),
      });
    }
  }

  const { handleProps: dragHandleProps, dragOverlay } = useTouchDrag({
    onStart: (noteId) => {
      dragNoteIdRef.current = noteId;
      setDragNoteId(noteId);
      skipOpenAfterDrag.current = true;
    },
    onZoneChange: (zone) => {
      const folderId = folderIdFromDropZone(zone);
      if (folderId === undefined) {
        setDropTarget(null);
        return;
      }
      setDropTarget(folderId === null ? INBOX_FOLDER : folderId);
    },
    onDrop: (noteId, zone) => {
      const folderId = folderIdFromDropZone(zone);
      if (folderId === undefined) {
        endDrag();
        return;
      }
      void handleMoveNote(noteId, folderId);
    },
    onCancel: endDrag,
  });

  function openCreateFolder(parentId: string | null) {
    setEditingFolder(null);
    setDefaultParentId(parentId);
    setFolderDialogOpen(true);
  }

  async function handleCreateTag(name: string, color: string): Promise<Tag> {
    const tag = await createTag({ name, color });
    setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
    return tag;
  }

  const listEmpty =
    !loading &&
    (notes.length === 0 ? (
      <EmptyState
        icon={NotebookPen}
        title="Nenhuma nota ainda"
        description="Crie uma nota para guardar o que não cabe numa tarefa — pauta de reunião, rascunho, decisão de projeto."
        action={
          <Button onClick={() => handleCreate("markdown")} disabled={creating}>
            Nova nota
          </Button>
        }
      />
    ) : visibleNotes.length === 0 && query.trim() ? (
      <EmptyState
        icon={NotebookPen}
        title="Nenhuma nota encontrada"
        description={`Nada com "${query}" no título nem no conteúdo.`}
      />
    ) : visibleNotes.length === 0 ? (
      <EmptyState
        icon={NotebookPen}
        title="Esta pasta está vazia"
        description="Crie uma nota ou um canvas aqui — eles nascem nesta pasta."
        action={
          <Button onClick={() => handleCreate("markdown")} disabled={creating}>
            Nova nota
          </Button>
        }
      />
    ) : null);

  return (
    <PageShell
      eyebrow="Produtividade"
      title="Notas"
      description="Markdown na veia — anotações soltas ou vinculadas a um projeto."
      actions={
        <>
          <ModuleGuideButton moduleId="notes" />
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
      <ModuleGuide moduleId="notes" />
      {dragOverlay}
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
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <aside className="hidden sm:block sm:w-64 sm:shrink-0">
            <NoteFolderTree
              folders={folders}
              notes={notes}
              projects={projects}
              tags={tags}
              selected={folderNav}
              dropTarget={dropTarget}
              draggingNote={dragNoteId != null}
              draggingFolderId={dragFolderId}
              onSelect={setFolderNav}
              onCreate={openCreateFolder}
              onEdit={(folder) => {
                setEditingFolder(folder);
                setFolderDialogOpen(true);
              }}
              onDelete={(folder) => void handleDeleteFolder(folder)}
              onDragOverTarget={setDropTarget}
              onDropNote={(folderId) => {
                if (dragFolderIdRef.current) return;
                const noteId = dragNoteIdRef.current;
                if (!noteId) return;
                void handleMoveNote(noteId, folderId);
              }}
              onDragFolderStart={(folderId) => {
                dragFolderIdRef.current = folderId;
                setDragFolderId(folderId);
              }}
              onDragFolderEnd={endDrag}
              onDropFolder={(parentId) => {
                const folderId = dragFolderIdRef.current;
                if (!folderId) return;
                void handleMoveFolder(folderId, parentId);
              }}
            />
          </aside>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="sm:hidden">
              <Select
                value={folderNav ?? ALL_FOLDERS}
                onValueChange={(value) => {
                  if (value === ALL_FOLDERS) setFolderNav(null);
                  else if (value === INBOX_FOLDER) setFolderNav(INBOX_FOLDER);
                  else setFolderNav(value);
                }}
              >
                <SelectTrigger aria-label="Pasta">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FOLDERS}>Todas</SelectItem>
                  <SelectItem value={INBOX_FOLDER}>Sem pasta</SelectItem>
                  {flattenFolderTree(folders).map(({ folder, depth }) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      <span style={{ paddingLeft: `${(depth - 1) * 12}px` }}>
                        {folder.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(notes.length > 0 || query) && (
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Filtrar notas"
                placeholder="Filtrar por título ou conteúdo…"
                className="sm:max-w-sm"
              />
            )}

            {listEmpty ?? (
              <ul className="space-y-2">
                {visibleNotes.map((note) => {
                  const isCanvas = note.kind === "canvas";
                  const excerpt = noteExcerpt(note.content);
                  const elementCount = isCanvas
                    ? canvasElementCount(note.canvas_data)
                    : 0;
                  const projectName = projectNameById[note.project_id ?? ""];
                  const folderName =
                    folderNav == null
                      ? folderNameById[note.folder_id ?? ""]
                      : undefined;
                  return (
                    <li key={note.id}>
                      <article
                        draggable
                        onDragStart={(event) => {
                          if (
                            (event.target as HTMLElement).closest(
                              "[data-no-note-drag]"
                            )
                          ) {
                            event.preventDefault();
                            return;
                          }
                          event.dataTransfer?.setData("text/plain", note.id);
                          if (event.dataTransfer) {
                            event.dataTransfer.effectAllowed = "move";
                          }
                          dragNoteIdRef.current = note.id;
                          setDragNoteId(note.id);
                          skipOpenAfterDrag.current = true;
                        }}
                        onDragEnd={endDrag}
                        className={cn(
                          "flex items-start justify-between gap-2 rounded-xl border bg-card p-3.5 shadow-sm transition-colors hover:border-primary/40 sm:p-5",
                          dragNoteId === note.id && "opacity-60"
                        )}
                      >
                        <span
                          {...dragHandleProps(note.id, note.title || "Nota")}
                          className="-ml-1 hidden shrink-0 cursor-grab p-1 text-muted-foreground active:cursor-grabbing sm:inline-flex"
                          aria-label={`Mover ${note.title || "nota"} para uma pasta`}
                        >
                          <GripVertical className="h-3.5 w-3.5" />
                        </span>
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => {
                            if (skipOpenAfterDrag.current) {
                              skipOpenAfterDrag.current = false;
                              return;
                            }
                            navigate(notesDetailHref(note.id, folderNav));
                          }}
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
                            {folderName && (
                              <Badge
                                variant="outline"
                                className="shrink-0 text-[10px]"
                              >
                                {folderName}
                              </Badge>
                            )}
                            {projectName && (
                              <Badge
                                variant="secondary"
                                className="shrink-0 text-[10px]"
                              >
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
                        <div data-no-note-drag>
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
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
