import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EditorView } from "@codemirror/view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownCodeEditor } from "@/components/MarkdownCodeEditor";
import { wikiLinkAutocomplete } from "@/components/codemirror/wikiLinkCompletion";
import { wikiLinkNavigation } from "@/components/codemirror/wikiLinkNavigation";
import {
  openInsertMenu,
  slashMenuAutocomplete,
} from "@/components/codemirror/slashMenu";
import { useTaskRefExtensions } from "@/hooks/useTaskRefExtensions";
import { NoteEditorToolbar } from "@/pages/admin/notes/NoteEditorToolbar";
import { NoteMarkdownPreview } from "@/pages/admin/notes/NoteMarkdownPreview";
import { createNote, fetchNotes } from "@/api/notes/notes";
import { indexNotesByTitle, normalizeWikiTitle } from "@/domain/notes/wikiLinks";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { Note } from "@/types/notes";

/**
 * Descrição da tarefa (e da subtarefa — o form é o mesmo) com o editor de Markdown das notas:
 * barra de formatação, menu `/`, wiki-links `[[Título]]` resolvidos contra as notas do usuário e o
 * `TASK->` da 104 (vincular ou criar tarefa na hora).
 */
export function TaskDescriptionField({
  value,
  onChange,
  projectId = null,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Projeto do contexto: a tarefa criada por `TASK->` herda o projeto da tarefa em edição. */
  projectId?: string | null;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [notes, setNotes] = useState<Note[]>([]);
  const viewRef = useRef<EditorView | null>(null);
  const notesRef = useRef<Note[]>([]);
  notesRef.current = notes;
  const { toast } = useToast();
  const navigate = useNavigate();

  const openWikiLink = useRef<(title: string, href: string | null) => void>(() => {});

  useEffect(() => {
    let alive = true;
    fetchNotes()
      .then((list) => {
        if (alive) setNotes(list);
      })
      .catch(() => {
        if (alive) setNotes([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleCreateLinkedNote = useCallback(
    async (title: string): Promise<Note | null> => {
      try {
        const created = await createNote({ title, content: "", project_id: null });
        setNotes((prev) => [created, ...prev]);
        return created;
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: getErrorMessage(error, "Não foi possível criar a nota."),
        });
        return null;
      }
    },
    [toast]
  );

  openWikiLink.current = (title, href) => {
    if (href) {
      navigate(href);
      return;
    }
    void handleCreateLinkedNote(title).then((created) => {
      if (created) navigate(`/notes/${created.id}`);
    });
  };

  const taskRefExtensions = useTaskRefExtensions(projectId);

  const editorExtensions = useMemo(
    () => [
      wikiLinkAutocomplete(() => notesRef.current.map((note) => note.title)),
      slashMenuAutocomplete(),
      wikiLinkNavigation({
        resolveHref: (title) => {
          const id = indexNotesByTitle(notesRef.current).get(normalizeWikiTitle(title));
          return id ? `/notes/${id}` : null;
        },
        onOpen: (title, href) => openWikiLink.current(title, href),
      }),
      // O `TASK->` (104): popup de vincular/criar tarefa + a marca clicável. A identidade do array
      // vinda do hook é estável, então isto continua sendo um `useMemo` de dependência única.
      ...taskRefExtensions,
    ],
    [taskRefExtensions]
  );

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v === "preview" ? "preview" : "write")}>
      <TabsList className="h-8">
        <TabsTrigger value="write" className="text-xs">
          Escrever
        </TabsTrigger>
        <TabsTrigger value="preview" className="text-xs">
          Visualizar
        </TabsTrigger>
      </TabsList>
      <TabsContent value="write" className="mt-1.5 space-y-1.5">
        <NoteEditorToolbar
          getView={() => viewRef.current}
          onInsert={() => {
            const view = viewRef.current;
            if (view) openInsertMenu(view);
          }}
        />
        <MarkdownCodeEditor
          label="Descrição"
          value={value}
          onChange={onChange}
          onViewReady={(view) => {
            viewRef.current = view;
          }}
          className="min-h-[10rem] [&_.cm-editor]:min-h-[10rem]"
          placeholder="Markdown — digite / para inserir, [[ para vincular uma nota, TASK-> para vincular uma tarefa…"
          extensions={editorExtensions}
        />
      </TabsContent>
      <TabsContent value="preview" className="mt-1.5 rounded-md border px-3 py-2">
        {value.trim() ? (
          <NoteMarkdownPreview
            content={value}
            notes={notes}
            onCreateNote={(title) => {
              void handleCreateLinkedNote(title).then((created) => {
                if (created) navigate(`/notes/${created.id}`);
              });
            }}
          />
        ) : (
          <p className="text-xs text-muted-foreground">Nada para visualizar ainda.</p>
        )}
      </TabsContent>
    </Tabs>
  );
}
