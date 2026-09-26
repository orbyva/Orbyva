import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, NotebookPen, PenTool, Plus } from "lucide-react";
import { ActionTooltip } from "@/components/ActionTooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createNote, fetchNotes } from "@/api/notes/notes";
import { addNoteLink, fetchNotesLinkedTo } from "@/api/notes/noteLinks";
import { filterNotes } from "@/domain/notes/filters";
import { buildTaskNoteDraft, buildTaskNoteLinkDraft } from "@/domain/tasks/taskNoteDraft";
import { useToast } from "@/hooks/use-toast";
import { formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { Note, NoteKind } from "@/types/notes";
import type { Task } from "@/types/tasks";

/**
 * Atalho "desta tarefa, criar ou vincular uma nota / um canvas" (feature 084 + levantamento
 * 01-09-26): o clique abre o popover com as já vinculadas, a busca das existentes e o item de
 * criar. Criar direto no primeiro clique escondia as notas que o usuário já tinha.
 */

const KIND_UI: Record<
  NoteKind,
  {
    icon: typeof NotebookPen;
    createLabel: string;
    listLabel: string;
    createNewLabel: string;
    createAnotherLabel: string;
    searchLabel: string;
    searchPlaceholder: string;
    emptyCatalog: string;
  }
> = {
  markdown: {
    icon: NotebookPen,
    createLabel: "Criar nota desta tarefa",
    listLabel: "Notas desta tarefa",
    createNewLabel: "Criar nova nota",
    createAnotherLabel: "Criar outra nota",
    searchLabel: "Vincular nota existente",
    searchPlaceholder: "Buscar notas…",
    emptyCatalog: "Nenhuma nota para vincular",
  },
  canvas: {
    icon: PenTool,
    createLabel: "Criar canvas desta tarefa",
    listLabel: "Canvas desta tarefa",
    createNewLabel: "Criar novo canvas",
    createAnotherLabel: "Criar outro canvas",
    searchLabel: "Vincular canvas existente",
    searchPlaceholder: "Buscar canvas…",
    emptyCatalog: "Nenhum canvas para vincular",
  },
};

export const TASK_NOTE_UNSAVED_HINT = "Salve a tarefa antes";

function splitByKind(notes: readonly Note[]): Record<NoteKind, Note[]> {
  return {
    canvas: notes.filter((note) => note.kind === "canvas"),
    markdown: notes.filter((note) => note.kind !== "canvas"),
  };
}

export interface TaskNoteButtonsProps {
  task: Task | null;
}

export function TaskNoteButtons({ task }: TaskNoteButtonsProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [pendingKind, setPendingKind] = useState<NoteKind | null>(null);
  const [openKind, setOpenKind] = useState<NoteKind | null>(null);
  const [linked, setLinked] = useState<Note[] | null>(null);
  const [catalog, setCatalog] = useState<Note[] | null>(null);
  const linkedPromise = useRef<Promise<Note[]> | null>(null);
  const taskId = task?.id ?? null;

  useEffect(() => {
    if (!taskId) {
      linkedPromise.current = null;
      setLinked(null);
      return;
    }
    let alive = true;
    const pending = fetchNotesLinkedTo("task", taskId).catch(() => [] as Note[]);
    linkedPromise.current = pending;
    setLinked(null);
    pending.then((notes) => {
      if (alive) setLinked(notes);
    });
    return () => {
      alive = false;
    };
  }, [taskId]);

  useEffect(() => {
    if (!openKind || !taskId) return;
    let alive = true;
    fetchNotes()
      .then((notes) => {
        if (alive) setCatalog(notes);
      })
      .catch(() => {
        if (alive) setCatalog([]);
      });
    return () => {
      alive = false;
    };
  }, [openKind, taskId]);

  const byKind = useMemo(() => splitByKind(linked ?? []), [linked]);
  const catalogByKind = useMemo(() => splitByKind(catalog ?? []), [catalog]);

  async function handleClick(kind: NoteKind) {
    if (!task || pendingKind) return;
    setPendingKind(kind);
    await (linkedPromise.current ?? Promise.resolve<Note[]>([]));
    setPendingKind(null);
    setOpenKind(kind);
  }

  async function createAnother(kind: NoteKind) {
    if (!task || pendingKind) return;
    setPendingKind(kind);
    await createAndOpen(kind);
  }

  async function linkExisting(kind: NoteKind, note: Note) {
    if (!task || pendingKind) return;
    setPendingKind(kind);
    try {
      await addNoteLink(buildTaskNoteLinkDraft(note.id, task));
      setLinked((prev) => [note, ...(prev ?? []).filter((item) => item.id !== note.id)]);
      toast({ title: kind === "canvas" ? "Canvas vinculado" : "Nota vinculada", duration: 2000 });
      setOpenKind(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Não foi possível vincular",
        description: getErrorMessage(error),
      });
    } finally {
      setPendingKind(null);
    }
  }

  async function createAndOpen(kind: NoteKind) {
    if (!task) return;
    let note: Note;
    try {
      note = await createNote(buildTaskNoteDraft(task, kind));
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: getErrorMessage(
          error,
          kind === "canvas"
            ? "Não foi possível criar o canvas."
            : "Não foi possível criar a nota."
        ),
      });
      setPendingKind(null);
      return;
    }

    try {
      await addNoteLink(buildTaskNoteLinkDraft(note.id, task));
      setLinked((prev) => [note, ...(prev ?? [])]);
    } catch {
      toast({
        variant: "destructive",
        title: "Vínculo não gravado",
        description:
          kind === "canvas"
            ? "O canvas foi criado, mas não ficou vinculado à tarefa. Refaça o vínculo no painel de vínculos."
            : "A nota foi criada, mas não ficou vinculada à tarefa. Refaça o vínculo no painel de vínculos.",
      });
    }

    setPendingKind(null);
    setOpenKind(null);
    navigate(`/notes/${note.id}`);
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <TaskNoteButton
            kind="markdown"
            task={task}
            notes={byKind.markdown}
            catalog={catalogByKind.markdown}
            open={openKind === "markdown"}
            pending={pendingKind === "markdown"}
            busy={pendingKind !== null}
            onClick={() => handleClick("markdown")}
            onOpenChange={(next) => setOpenKind(next ? "markdown" : null)}
            onCreateAnother={() => createAnother("markdown")}
            onLinkExisting={(note) => void linkExisting("markdown", note)}
          />
          <TaskNoteButton
            kind="canvas"
            task={task}
            notes={byKind.canvas}
            catalog={catalogByKind.canvas}
            open={openKind === "canvas"}
            pending={pendingKind === "canvas"}
            busy={pendingKind !== null}
            onClick={() => handleClick("canvas")}
            onOpenChange={(next) => setOpenKind(next ? "canvas" : null)}
            onCreateAnother={() => createAnother("canvas")}
            onLinkExisting={(note) => void linkExisting("canvas", note)}
          />
        </div>
        {!task && (
          <p className="text-[10px] text-muted-foreground">{TASK_NOTE_UNSAVED_HINT}</p>
        )}
      </div>
    </TooltipProvider>
  );
}

function TaskNoteButton({
  kind,
  task,
  notes,
  catalog,
  open,
  pending,
  busy,
  onClick,
  onOpenChange,
  onCreateAnother,
  onLinkExisting,
}: {
  kind: NoteKind;
  task: Task | null;
  notes: readonly Note[];
  catalog: readonly Note[];
  open: boolean;
  pending: boolean;
  busy: boolean;
  onClick: () => void;
  onOpenChange: (open: boolean) => void;
  onCreateAnother: () => void;
  onLinkExisting: (note: Note) => void;
}) {
  const {
    icon: Icon,
    createLabel,
    listLabel,
    createNewLabel,
    createAnotherLabel,
    searchLabel,
    searchPlaceholder,
    emptyCatalog,
  } = KIND_UI[kind];
  const [query, setQuery] = useState("");
  const hasNotes = notes.length > 0;
  const label = hasNotes ? `${listLabel} — ${notes.length}` : createLabel;
  const linkedIds = new Set(notes.map((note) => note.id));
  const available = filterNotes(
    catalog.filter((note) => !linkedIds.has(note.id)),
    query
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery("");
        onOpenChange(next);
      }}
    >
      <ActionTooltip label={label}>
        <PopoverAnchor asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={!task || busy}
            aria-label={label}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={onClick}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </Button>
        </PopoverAnchor>
      </ActionTooltip>
      <PopoverContent className="w-72 space-y-2 p-2" align="start" aria-label={listLabel}>
        <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {listLabel}
        </p>
        {hasNotes ? (
          <ul className="space-y-0.5">
            {notes.map((note) => (
              <li key={note.id}>
                <Link
                  to={`/notes/${note.id}`}
                  onClick={() => onOpenChange(false)}
                  className="block rounded-sm px-1 py-1 hover:bg-muted"
                >
                  <span className="block truncate text-xs">{note.title}</span>
                  {note.updated_at && (
                    <span className="block text-[10px] text-muted-foreground">
                      Editada em {formatDateBR(note.updated_at)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="space-y-1 border-t pt-2">
          <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {searchLabel}
          </p>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
            className="h-8 text-xs"
          />
          {available.length > 0 ? (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto">
              {available.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => onLinkExisting(note)}
                    className="block w-full truncate rounded-sm px-1 py-1 text-left text-xs hover:bg-muted"
                  >
                    {note.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-1 text-[11px] text-muted-foreground">{emptyCatalog}</p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-full justify-start gap-1.5 text-xs"
          onClick={onCreateAnother}
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          {hasNotes ? createAnotherLabel : createNewLabel}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
