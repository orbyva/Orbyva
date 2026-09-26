import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UIEvent } from "react";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EditorView } from "@codemirror/view";
import type { Command } from "@codemirror/view";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormLabel } from "@/components/FormLabel";
import { MarkdownCodeEditor } from "@/components/MarkdownCodeEditor";
import { wikiLinkAutocomplete } from "@/components/codemirror/wikiLinkCompletion";
import { wikiLinkNavigation } from "@/components/codemirror/wikiLinkNavigation";
import {
  openInsertMenu,
  slashMenuAutocomplete,
} from "@/components/codemirror/slashMenu";
import { NoteEditorToolbar } from "@/pages/admin/notes/NoteEditorToolbar";
import { NoteOutline } from "@/pages/admin/notes/NoteOutline";
import { NoteMarkdownPreview } from "@/pages/admin/notes/NoteMarkdownPreview";
import { NoteLinksPanel } from "@/pages/admin/notes/NoteLinksPanel";
import { BacklinksPanel } from "@/pages/admin/notes/BacklinksPanel";
import { ProjectPicker } from "@/pages/admin/tasks/ProjectPicker";
import { NoteFolderPicker } from "@/pages/admin/notes/NoteFolderPicker";
import { updateNote } from "@/api/notes/notes";
import { NOTE_TITLE_MAX } from "@/domain/notes/noteDraft";
import { appendMermaidSnippet } from "@/domain/notes/mermaidSnippet";
import { extractHeadings } from "@/domain/notes/outline";
import type { NoteHeading } from "@/domain/notes/outline";
import { indexNotesByTitle, normalizeWikiTitle } from "@/domain/notes/wikiLinks";
import { toggleTaskListItem } from "@/domain/notes/markdownCommands";
import { proportionalScrollTop } from "@/domain/notes/scrollSync";
import { countWords } from "@/domain/notes/wordCount";
import { VIEW_PARAM, parseViewMode } from "@/domain/notes/viewMode";
import type { ViewMode } from "@/domain/notes/viewMode";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { Note, NoteFolder } from "@/types/notes";
import type { Project } from "@/types/tasks";

/** Janela do autosave. Curta o bastante para não perder nada, longa para não gravar por tecla. */
export const NOTE_AUTOSAVE_DEBOUNCE_MS = 800;


type SaveState = "idle" | "saving" | "saved" | "error";

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "",
  saving: "Salvando…",
  saved: "Salvo",
  error: "Falha ao salvar",
};

/** `HH:mm` local. O segundo não interessa: a pergunta é "gravou agora ou faz tempo?". */
function formatSavedAt(at: Date) {
  return at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * O que o autosave está fazendo, no cabeçalho do editor.
 *
 * O horário no "Salvo às HH:mm" é a diferença entre "ele diz que salvou" e "eu sei quando" — num
 * editor sem botão Salvar, é o que substitui o clique como prova. E o erro **não** é só um texto
 * vermelho: sem uma ação ali, a única saída do usuário seria digitar de novo para reagendar o
 * debounce, torcendo para funcionar. O `toast` some; esta linha fica.
 */
function SaveIndicator({
  state,
  savedAt,
  onRetry,
}: {
  state: SaveState;
  savedAt: Date | null;
  onRetry: () => void;
}) {
  if (state === "idle") return null;
  const Icon =
    state === "saving" ? Loader2 : state === "saved" ? Check : CircleAlert;
  const label =
    state === "saved" && savedAt
      ? `Salvo às ${formatSavedAt(savedAt)}`
      : SAVE_LABEL[state];
  return (
    <div
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
      {label}
      {state === "error" ? (
        <button
          type="button"
          onClick={onRetry}
          className="underline underline-offset-2 hover:no-underline"
        >
          Tentar novamente
        </button>
      ) : null}
    </div>
  );
}

/**
 * Rodapé do editor: quanto já foi escrito e quanto dá de leitura.
 *
 * Mede o **texto**, não a marcação (ver `countWords`). Nota vazia não mostra nada: "0 palavras ·
 * 0 caracteres" em folha em branco é ruído, não informação.
 */
function NoteCountFooter({ content }: { content: string }) {
  const { words, characters, minutes } = useMemo(() => countWords(content), [content]);
  if (words === 0) return null;
  return (
    <p
      /**
       * `aria-live="off"` de propósito: o número muda a cada tecla, e um leitor de tela
       * anunciando "134 palavras…" abafaria o "Salvo" do `SaveIndicator`.
       */
      aria-live="off"
      className="px-1 text-right text-[11px] text-muted-foreground"
    >
      {words === 1 ? "1 palavra" : `${words} palavras`} ·{" "}
      {characters === 1 ? "1 caractere" : `${characters} caracteres`} · {minutes} min de
      leitura
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
  folders = [],
  notes = [],
  onSaved,
  onCreateNote,
  debounceMs = NOTE_AUTOSAVE_DEBOUNCE_MS,
}: {
  note: Note;
  projects: Project[];
  folders?: NoteFolder[];
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
  const onCreateNoteRef = useRef(onCreateNote);
  onCreateNoteRef.current = onCreateNote;
  const navigate = useNavigate();
  /**
   * Linha do cursor (1-based). É o que o sumário usa para saber em que seção o usuário está —
   * na aba "Escrever" não existe HTML nem `id` para observar, existe texto e cursor.
   */
  const [cursorLine, setCursorLine] = useState(1);
  const editorExtensions = useMemo(
    () => [
      wikiLinkAutocomplete(() =>
        notesRef.current
          .filter((candidate) => candidate.id !== note.id)
          .map((candidate) => candidate.title)
      ),
      // Catálogo rico da 068 (`insertItems`): Título 1, callouts tipados, linguagens de código…
      slashMenuAutocomplete(),
      wikiLinkNavigation({
        resolveHref: (title) => {
          const id = indexNotesByTitle(notesRef.current).get(normalizeWikiTitle(title));
          return id ? `/notes/${id}` : null;
        },
        onOpen: (title, href) => {
          if (href) navigate(href);
          else onCreateNoteRef.current?.(title);
        },
      }),
      EditorView.updateListener.of((update) => {
        if (!update.selectionSet && !update.docChanged) return;
        const line = update.state.doc.lineAt(update.state.selection.main.head).number;
        setCursorLine(line);
      }),
    ],
    [note.id, navigate]
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
  const [folderId, setFolderId] = useState<string | null>(note.folder_id);
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
  /**
   * `lg` do Tailwind. O modo "Dividir" só existe daqui para cima — e `useMediaQuery` não quebra
   * quando `matchMedia` não existe (jsdom cru).
   */
  const isWideScreen = useMediaQuery("(min-width: 1024px)");
  const requestedMode = parseViewMode(searchParams.get(VIEW_PARAM));
  /**
   * Duas colunas em telefone é ilegível: abaixo de `lg`, "Dividir" cai para "Escrever" — mas a URL
   * continua dizendo `?view=dividir`, então girar o aparelho (ou abrir o mesmo link no computador)
   * traz o modo de volta.
   */
  const mode: ViewMode =
    !isWideScreen && requestedMode === "dividir" ? "escrever" : requestedMode;
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
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
    setFolderId(note.folder_id);
    setSaveState("idle");
    setSavedAt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  /**
   * O que gravar fica num ref, não nas dependências do efeito de debounce: só alteração do usuário
   * pode reagendar a gravação, nunca a identidade nova de `note`/`onSaved` vinda do re-render.
   */
  /**
   * Clicar num `- [ ]` do preview reescreve o Markdown e cai no mesmo autosave. O `pendingToggle`
   * reverte a caixa se a gravação falhar — senão o usuário fecha a nota achando que anotou.
   */
  const pendingToggle = useRef<{ before: string; after: string } | null>(null);

  const handleToggleTask = useCallback((index: number) => {
    setContent((current) => {
      const next = toggleTaskListItem(current, index);
      pendingToggle.current = next === current ? null : { before: current, after: next };
      return next;
    });
  }, []);

  /** Timer do debounce em voo, para `flushSave` poder cancelá-lo e gravar na hora. */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<() => Promise<void>>(async () => {});
  saveRef.current = async () => {
    setSaveState("saving");
    try {
      await updateNote({
        id: note.id,
        title,
        content,
        project_id: projectId,
        folder_id: folderId,
      });
      pendingToggle.current = null;
      setSaveState("saved");
      setSavedAt(new Date());
      onSaved?.({
        ...note,
        title,
        content,
        project_id: projectId,
        folder_id: folderId,
      });
    } catch (error) {
      setSaveState("error");
      const toggle = pendingToggle.current;
      pendingToggle.current = null;
      if (toggle && toggle.after === content) {
        skipNextSave.current = true;
        setContent(toggle.before);
      }
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
    debounceRef.current = timer;
    return () => clearTimeout(timer);
  }, [title, content, projectId, folderId, debounceMs]);

  /**
   * Gravar **agora**, sem esperar o debounce: é o que `Ctrl/Cmd+S` e o "Tentar novamente" fazem.
   * Cancelar o timer pendente antes é o que impede a gravação dupla — sem isso, o timer que já
   * estava agendado dispararia um segundo `updateNote` logo depois deste.
   */
  const flushSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void saveRef.current();
  }, []);

  /**
   * `Ctrl/Cmd+S`. O atalho do navegador ("salvar página") não serve para nada aqui e assusta:
   * `preventDefault` sempre. Fica no `window`, não no editor, porque o usuário pode estar com o
   * foco no título ou no seletor de projeto — os três campos caem no mesmo autosave.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      flushSave();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flushSave]);

  /**
   * A seção onde o cursor está: o último título **antes** dele. Sem título nenhum acima, nenhuma
   * seção fica marcada.
   */
  const activeSlug = useMemo(() => {
    let slug: string | null = null;
    for (const heading of extractHeadings(content)) {
      if (heading.line > cursorLine) break;
      slug = heading.slug;
    }
    return slug;
  }, [content, cursorLine]);

  /**
   * Clicar num título do sumário. Dois caminhos, porque em cada modo o título mora num lugar
   * diferente: no editor ele é uma **linha** (não existe âncora nenhuma no DOM), e no preview é um
   * elemento com `id` — o mesmo `slug` que `rehypeHeadingIds` escreveu (069).
   */
  const goToHeading = useCallback(
    (heading: NoteHeading) => {
      if (mode === "visualizar") {
        document.getElementById(heading.slug)?.scrollIntoView({ block: "start" });
        return;
      }
      const view = viewRef.current;
      if (!view) return;
      const line = view.state.doc.line(
        Math.min(heading.line, view.state.doc.lines)
      );
      view.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: "start" }),
      });
      view.focus();
    },
    [mode]
  );

  /**
   * Editor e preview saem em variáveis porque aparecem em **dois** modos cada um (o editor em
   * "Escrever" e em "Dividir"; o preview em "Dividir" e em "Visualizar"). Duplicar o JSX seria a
   * forma clássica de os dois caminhos divergirem com o tempo.
   */
  const editorNode = (
    <div className="space-y-1">
      <MarkdownCodeEditor
        label="Conteúdo"
        value={content}
        onChange={setContent}
        onCreateEditor={handleCreateEditor}
        className="min-h-[45vh] [&_.cm-editor]:min-h-[45vh]"
        placeholder="Markdown na veia — # títulos, listas, **negrito**, [[links]] entre notas…"
        extensions={editorExtensions}
      />
      <NoteCountFooter content={content} />
    </div>
  );

  const previewNode = content.trim() ? (
    <NoteMarkdownPreview
      content={content}
      notes={notes}
      onCreateNote={onCreateNote}
      /* Metade do uso de nota é checklist: marcar a caixa no preview escreve no markdown e cai no
         mesmo autosave de sempre. Preview de leitura (fora do editor) não recebe isto. */
      onToggleTask={handleToggleTask}
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
          <SaveIndicator state={saveState} savedAt={savedAt} onRetry={flushSave} />
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
        <div className="flex gap-3">
          <Tabs
            className="min-w-0 flex-1"
            value={mode}
            onValueChange={(v) => setMode(parseViewMode(v))}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TabsList className="h-8">
                <TabsTrigger value="escrever" className="text-xs">
                  Escrever
                </TabsTrigger>
                {/* Duas colunas não cabem abaixo de `lg` — a opção nem aparece lá. */}
                {isWideScreen ? (
                  <TabsTrigger value="dividir" className="text-xs">
                    Dividir
                  </TabsTrigger>
                ) : null}
                <TabsTrigger value="visualizar" className="text-xs">
                  Visualizar
                </TabsTrigger>
              </TabsList>
              {/* A barra some no modo "Visualizar": ali não há editor para formatar. */}
              {mode === "visualizar" ? null : (
                <NoteEditorToolbar
                  run={runCommand}
                  onInsert={() => {
                    const view = viewRef.current;
                    if (view) openInsertMenu(view);
                  }}
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
          <NoteOutline
            content={content}
            activeSlug={activeSlug}
            onSelect={goToHeading}
            className="mt-9"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <FormLabel>Projeto</FormLabel>
        <ProjectPicker
          projects={projects}
          value={projectId}
          onChange={setProjectId}
        />
      </div>

      <div className="space-y-1.5">
        <FormLabel>Pasta</FormLabel>
        <NoteFolderPicker
          folders={folders}
          value={folderId}
          onChange={setFolderId}
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
