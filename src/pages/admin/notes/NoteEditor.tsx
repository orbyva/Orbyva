import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UIEvent } from "react";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import type { Command, EditorView } from "@codemirror/view";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormLabel } from "@/components/FormLabel";
import { MarkdownCodeEditor } from "@/components/MarkdownCodeEditor";
import { wikiLinkAutocomplete } from "@/components/codemirror/wikiLinkCompletion";
import { slashCommandAutocomplete } from "@/components/codemirror/slashCommands";
import { NoteEditorToolbar } from "@/pages/admin/notes/NoteEditorToolbar";
import { NoteMarkdownPreview } from "@/pages/admin/notes/NoteMarkdownPreview";
import { NoteLinksPanel } from "@/pages/admin/notes/NoteLinksPanel";
import { BacklinksPanel } from "@/pages/admin/notes/BacklinksPanel";
import { ProjectPicker } from "@/pages/admin/tasks/ProjectPicker";
import { updateNote } from "@/api/notes/notes";
import { NOTE_TITLE_MAX } from "@/domain/notes/noteDraft";
import { appendMermaidSnippet } from "@/domain/notes/mermaidSnippet";
import { proportionalScrollTop } from "@/domain/notes/scrollSync";
import { VIEW_PARAM, parseViewMode } from "@/domain/notes/viewMode";
import type { ViewMode } from "@/domain/notes/viewMode";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { Note } from "@/types/notes";
import type { Project } from "@/types/tasks";

/** Janela do autosave. Curta o bastante para não perder nada, longa para não gravar por tecla. */
export const NOTE_AUTOSAVE_DEBOUNCE_MS = 800;


type SaveState = "idle" | "saving" | "saved" | "error";

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "",
  saving: "Salvando…",
  saved: "Salvo",
  error: "Não salvo",
};

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const Icon =
    state === "saving" ? Loader2 : state === "saved" ? Check : CircleAlert;
  return (
    <p
      role="status"
      aria-live="polite"
      className={
        state === "error"
          ? "flex items-center gap-1.5 text-xs text-destructive"
          : "flex items-center gap-1.5 text-xs text-muted-foreground"
      }
    >
      <Icon
        aria-hidden="true"
        className={state === "saving" ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
      />
      {SAVE_LABEL[state]}
    </p>
  );
}

/**
 * Editor de uma nota: título, corpo em Markdown cru (abas Escrever/Visualizar) e o vínculo com um
 * projeto.
 *
 * **Autosave com debounce, sem botão Salvar.** Nota é texto longo — depender de um clique é como se
 * perde conteúdo. Cada alteração reagenda a gravação em `debounceMs`; só o último estado vai para o
 * banco. O `useToast` aparece só no erro: um toast por tecla seria ruído (ver Decisões da 055).
 */
export function NoteEditor({
  note,
  projects,
  notes = [],
  onSaved,
  onCreateNote,
  debounceMs = NOTE_AUTOSAVE_DEBOUNCE_MS,
}: {
  note: Note;
  projects: Project[];
  /** Todas as notas do usuário — é o dicionário que resolve `[[Título]]` para `/notes/<id>`. */
  notes?: readonly Note[];
  /** Avisa a página de cima do estado recém-gravado (para o título do header acompanhar). */
  onSaved?: (note: Note) => void;
  /** Cria a nota que um wiki-link quebrado aponta e navega para ela. */
  onCreateNote?: (title: string) => void;
  debounceMs?: number;
}) {
  /**
   * O autocomplete de `[[` lê os títulos por função, e a extensão é criada uma vez só: recriar o
   * array de extensões a cada render forçaria o CodeMirror a se reconfigurar por tecla digitada.
   * O ref é o que mantém a lista fresca sem entrar nas dependências.
   */
  const notesRef = useRef<readonly Note[]>(notes);
  notesRef.current = notes;
  const editorExtensions = useMemo(
    () => [
      wikiLinkAutocomplete(() =>
        notesRef.current
          // Linkar a própria nota não leva a lugar nenhum.
          .filter((candidate) => candidate.id !== note.id)
          .map((candidate) => candidate.title)
      ),
      // Segunda fonte do mesmo `autocompletion` (feature 070): `/` no começo da linha.
      slashCommandAutocomplete(),
    ],
    [note.id]
  );

  /**
   * O `EditorView` real, entregue pelo `MarkdownCodeEditor` quando ele monta. É o que permite à
   * barra de ferramentas rodar os **mesmos** comandos dos atalhos na seleção onde o usuário está —
   * sem ele, um botão só saberia mexer no documento inteiro.
   */
  const viewRef = useRef<EditorView | null>(null);
  const handleCreateEditor = useCallback((view: EditorView) => {
    viewRef.current = view;
  }, []);
  const runCommand = useCallback((command: Command) => {
    const view = viewRef.current;
    if (!view) return;
    command(view);
    view.focus();
  }, []);

  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [projectId, setProjectId] = useState<string | null>(note.project_id);
  /**
   * Rolagem do preview acompanhando a do editor, no modo "Dividir". `requestAnimationFrame` para o
   * ajuste acontecer **uma vez por quadro**: o evento `scroll` dispara dezenas de vezes por
   * segundo, e escrever `scrollTop` a cada um deles é jank garantido.
   */
  const previewPaneRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const syncPreviewScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const source = event.currentTarget;
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const target = previewPaneRef.current;
      if (!target) return;
      target.scrollTop = proportionalScrollTop(source, target);
    });
  }, []);
  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    },
    []
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const requestedMode = parseViewMode(searchParams.get(VIEW_PARAM));
  /**
   * Duas colunas em telefone é ilegível: abaixo de `md`, "Dividir" cai para "Escrever" — mas a URL
   * continua dizendo `?view=dividir`, então girar o aparelho (ou abrir o mesmo link no computador)
   * traz o modo de volta.
   */
  const mode: ViewMode =
    isMobile && requestedMode === "dividir" ? "escrever" : requestedMode;
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const { toast } = useToast();

  /**
   * O modo mora na **URL** (`?view=dividir`), como a aba de `Recurring.tsx`: sobrevive ao refresh,
   * é linkável e não inaugura `localStorage` no módulo. `replace` para não empilhar uma entrada de
   * histórico por clique de aba, e o padrão ("escrever") omite o parâmetro, deixando a URL limpa.
   */
  function setMode(next: ViewMode) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === "escrever") params.delete(VIEW_PARAM);
        else params.set(VIEW_PARAM, next);
        return params;
      },
      { replace: true }
    );
  }

  /**
   * Trocar de nota recarrega os campos — e não pode disparar autosave, senão abrir uma nota já
   * gravaria por cima dela. O `skipNextSave` cobre tanto a montagem quanto essa troca.
   *
   * A dependência é só `note.id`, de propósito: a página de cima reflete cada gravação no objeto
   * `note`, então depender do conteúdo faria a nota salva sobrescrever o que o usuário digitou
   * durante a gravação — e, junto do efeito de autosave abaixo, viraria um laço infinito.
   */
  const skipNextSave = useRef(true);
  useEffect(() => {
    skipNextSave.current = true;
    setTitle(note.title);
    setContent(note.content);
    setProjectId(note.project_id);
    setSaveState("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  /**
   * O que gravar fica num ref, não nas dependências do efeito de debounce: só alteração do usuário
   * pode reagendar a gravação, nunca a identidade nova de `note`/`onSaved` vinda do re-render.
   */
  const saveRef = useRef<() => Promise<void>>(async () => {});
  saveRef.current = async () => {
    setSaveState("saving");
    try {
      await updateNote({ id: note.id, title, content, project_id: projectId });
      setSaveState("saved");
      onSaved?.({ ...note, title, content, project_id: projectId });
    } catch (error) {
      setSaveState("error");
      toast({
        variant: "destructive",
        title: "Não foi possível salvar a nota",
        description: getErrorMessage(error),
      });
    }
  };

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    // "Salvando…" já na tecla: o usuário vê que a alteração foi registrada antes do debounce virar.
    setSaveState("saving");
    const timer = setTimeout(() => void saveRef.current(), debounceMs);
    return () => clearTimeout(timer);
  }, [title, content, projectId, debounceMs]);

  /**
   * Editor e preview saem em variáveis porque aparecem em **dois** modos cada um (o editor em
   * "Escrever" e em "Dividir"; o preview em "Dividir" e em "Visualizar"). Duplicar o JSX seria a
   * forma clássica de os dois caminhos divergirem com o tempo.
   */
  const editorNode = (
    <MarkdownCodeEditor
      label="Conteúdo"
      value={content}
      onChange={setContent}
      onCreateEditor={handleCreateEditor}
      className="min-h-[45vh] [&_.cm-editor]:min-h-[45vh]"
      placeholder="Markdown na veia — # títulos, listas, **negrito**, [[links]] entre notas…"
      extensions={editorExtensions}
    />
  );

  const previewNode = content.trim() ? (
    <NoteMarkdownPreview
      content={content}
      notes={notes}
      onCreateNote={onCreateNote}
      className="min-h-[45vh]"
    />
  ) : (
    <p className="text-xs text-muted-foreground">Nada para visualizar ainda.</p>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <FormLabel htmlFor="note-title">Título</FormLabel>
          <SaveIndicator state={saveState} />
        </div>
        <Input
          id="note-title"
          value={title}
          maxLength={NOTE_TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título da nota"
        />
      </div>

      <div className="space-y-1.5">
        <FormLabel>Conteúdo</FormLabel>
        <Tabs value={mode} onValueChange={(v) => setMode(parseViewMode(v))}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList className="h-8">
              <TabsTrigger value="escrever" className="text-xs">
                Escrever
              </TabsTrigger>
              {/* Duas colunas não cabem em telefone — a opção nem aparece lá. */}
              {isMobile ? null : (
                <TabsTrigger value="dividir" className="text-xs">
                  Dividir
                </TabsTrigger>
              )}
              <TabsTrigger value="visualizar" className="text-xs">
                Visualizar
              </TabsTrigger>
            </TabsList>
            {/* A barra some no modo "Visualizar": ali não há editor para formatar. */}
            {mode === "visualizar" ? null : (
              <NoteEditorToolbar
                run={runCommand}
                /* O botão de diagrama leva de volta para a aba de escrever, senão o esqueleto
                   inserido some atrás do preview (comportamento herdado da 057). */
                onInsertDiagram={() => {
                  if (mode !== "dividir") setMode("escrever");
                  setContent((current) => appendMermaidSnippet(current));
                }}
              />
            )}
          </div>
          <TabsContent value="escrever" className="mt-1.5">
            {editorNode}
          </TabsContent>
          {/* Escrever vendo o resultado: o editor à esquerda, o markdown renderizado à direita. */}
          <TabsContent value="dividir" className="mt-1.5">
            {/* Altura fixa nas duas colunas: é o que dá o que rolar e o que faz a proporção
                significar alguma coisa. Fora do modo "Dividir" quem rola é a página. */}
            <div className="grid gap-3 md:grid-cols-2">
              <div
                data-testid="note-editor-pane"
                className="max-h-[70vh] overflow-y-auto"
                onScroll={syncPreviewScroll}
              >
                {editorNode}
              </div>
              <div
                ref={previewPaneRef}
                data-testid="note-preview-pane"
                className="max-h-[70vh] overflow-y-auto rounded-md border px-3 py-2"
              >
                {previewNode}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="visualizar" className="mt-1.5 rounded-md border px-3 py-2">
            {previewNode}
          </TabsContent>
        </Tabs>
      </div>

      <div className="space-y-1.5">
        <FormLabel>Projeto</FormLabel>
        <ProjectPicker
          projects={projects}
          value={projectId}
          onChange={setProjectId}
        />
      </div>

      {/* Vínculo primário (acima) é o projeto; estes são os secundários, com qualquer entidade. */}
      <NoteLinksPanel noteId={note.id} projects={projects} />

      {/* O título usado aqui é o gravado, não o que está sendo digitado: backlink de nota
          renomeada só muda depois que o autosave grava o nome novo. */}
      <BacklinksPanel note={note} />
    </div>
  );
}
