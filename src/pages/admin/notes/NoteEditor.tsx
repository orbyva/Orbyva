import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import { EditorView } from "@codemirror/view";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormLabel } from "@/components/FormLabel";
import { MarkdownCodeEditor } from "@/components/MarkdownCodeEditor";
import { wikiLinkAutocomplete } from "@/components/codemirror/wikiLinkCompletion";
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
import { updateNote } from "@/api/notes/notes";
import { NOTE_TITLE_MAX } from "@/domain/notes/noteDraft";
import { toggleTaskListItem } from "@/domain/notes/taskList";
import { extractHeadings } from "@/domain/notes/outline";
import { countWords, formatWordCount } from "@/domain/notes/wordCount";
import type { NoteHeading } from "@/domain/notes/outline";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { Note } from "@/types/notes";
import type { Project } from "@/types/tasks";

/** Janela do autosave. Curta o bastante para não perder nada, longa para não gravar por tecla. */
export const NOTE_AUTOSAVE_DEBOUNCE_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

/** Escrever, visualizar, ou os dois lado a lado (068 — só a partir de `lg`). */
type NoteEditorTab = "write" | "preview" | "split";

/** O `Tabs` do Radix entrega `string`; aqui ele volta a ser um dos três modos conhecidos. */
function parseTab(value: string): NoteEditorTab {
  if (value === "preview" || value === "split") return value;
  return "write";
}

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
  /**
   * Linha do cursor (1-based). É o que o sumário usa para saber em que seção o usuário está — na
   * aba "Escrever" não existe HTML nem `id` para observar, existe texto e cursor.
   */
  const [cursorLine, setCursorLine] = useState(1);

  const editorExtensions = useMemo(
    () => [
      wikiLinkAutocomplete(() =>
        notesRef.current
          // Linkar a própria nota não leva a lugar nenhum.
          .filter((candidate) => candidate.id !== note.id)
          .map((candidate) => candidate.title)
      ),
      // O `/` da 068 — mesma máquina de autocomplete do `[[`, catálogo em `insertItems.ts`.
      slashMenuAutocomplete(),
      EditorView.updateListener.of((update) => {
        if (!update.selectionSet && !update.docChanged) return;
        const line = update.state.doc.lineAt(update.state.selection.main.head).number;
        // `setState` com o mesmo valor não re-renderiza: mover o cursor dentro da mesma seção
        // não custa render nenhum.
        setCursorLine(line);
      }),
    ],
    [note.id]
  );

  /**
   * A `EditorView` viva, quando existe. A aba "Visualizar" desmonta o CodeMirror, então isto é um
   * ref (não estado): a barra pergunta no clique, e o que interessa é a view do instante do clique.
   */
  const viewRef = useRef<EditorView | null>(null);

  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [projectId, setProjectId] = useState<string | null>(note.project_id);
  const [tab, setTab] = useState<NoteEditorTab>("write");
  /**
   * `lg` do Tailwind. O modo "Dividido" só existe daqui para cima — abaixo disso o split é pior
   * que as abas (ver Decisões da 068).
   */
  const isWideScreen = useMediaQuery("(min-width: 1024px)");
  /** Encolher a janela com o "Dividido" aberto cai de volta para "Escrever", sem tela vazia. */
  const activeTab = tab === "split" && !isWideScreen ? "write" : tab;
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const { toast } = useToast();

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
  /**
   * Clicar num `- [ ]` do preview reescreve o Markdown e cai no mesmo autosave de sempre (067).
   *
   * O `pendingToggle` existe para o caso de a gravação falhar: um checkbox que fica marcado na tela
   * depois de o salvamento falhar é uma mentira silenciosa — o usuário fecha a nota achando que
   * anotou. Guardando o "antes", o erro desmarca de volta. Só desmarca se o conteúdo ainda for
   * exatamente o que a alternância produziu; se o usuário digitou por cima, reverter apagaria o que
   * ele escreveu, e aí o toast sozinho é o comportamento certo.
   */
  const pendingToggle = useRef<{ before: string; after: string } | null>(null);

  // `useCallback` sem dependência: a identidade estável evita remontar os `components` do
  // `MarkdownPreview` (que dependem dela) a cada tecla digitada no título.
  const handleToggleTaskItem = useCallback((index: number) => {
    setContent((current) => {
      const next = toggleTaskListItem(current, index);
      pendingToggle.current = next === current ? null : { before: current, after: next };
      return next;
    });
  }, []);

  /**
   * A seção onde o cursor está: o último título **antes** dele. Sem título nenhum acima, nenhuma
   * seção fica marcada — que é o certo para o texto que vem antes do primeiro título.
   */
  const activeSlug = useMemo(() => {
    let current: string | null = null;
    for (const heading of extractHeadings(content)) {
      if (heading.line > cursorLine) break;
      current = heading.slug;
    }
    return current;
  }, [content, cursorLine]);

  /**
   * Clicar no sumário.
   *
   * Se a âncora da 067 está na tela (abas "Visualizar" e "Dividido"), rola até ela; senão, leva o
   * **cursor** até a linha do título no Markdown, que é a única navegação que existe na aba
   * "Escrever". Um sumário que só funcionasse no preview seria metade de um sumário.
   */
  const goToHeading = useCallback((heading: NoteHeading) => {
    const anchor = document.getElementById(heading.slug);
    if (anchor) {
      anchor.scrollIntoView({ block: "start" });
      return;
    }
    const view = viewRef.current;
    if (!view) return;
    const line = view.state.doc.line(
      Math.min(heading.line, view.state.doc.lines)
    );
    view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
    view.focus();
  }, []);

  /** Recalcular a cada tecla é barato (varredura linear do texto) e o número precisa ser vivo. */
  const wordCount = useMemo(() => countWords(content), [content]);

  const saveRef = useRef<() => Promise<void>>(async () => {});
  saveRef.current = async () => {
    setSaveState("saving");
    try {
      await updateNote({ id: note.id, title, content, project_id: projectId });
      pendingToggle.current = null;
      setSaveState("saved");
      onSaved?.({ ...note, title, content, project_id: projectId });
    } catch (error) {
      setSaveState("error");
      const toggle = pendingToggle.current;
      pendingToggle.current = null;
      if (toggle && toggle.after === content) {
        // Reverter não pode reagendar outra gravação: o que está no banco já é o "antes".
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
    return () => clearTimeout(timer);
  }, [title, content, projectId, debounceMs]);

  /**
   * As duas metades do modo "Dividido" são as mesmas do "Escrever" e do "Visualizar" — declaradas
   * uma vez e usadas nos dois painéis. Só um deles está montado por vez (o Radix desmonta o painel
   * inativo), então não há dois CodeMirror vivos disputando o `viewRef`.
   */
  const editorPane = (
    <>
      {/* Barra dentro do painel de escrita: no "Visualizar" não há o que formatar, e o Radix
          desmonta o painel inativo — a barra some junto, sem condicional própria. */}
      <NoteEditorToolbar
        getView={() => viewRef.current}
        onInsert={() => {
          const view = viewRef.current;
          if (view) openInsertMenu(view);
        }}
      />
      <MarkdownCodeEditor
        label="Conteúdo"
        value={content}
        onChange={setContent}
        onViewReady={(view) => {
          viewRef.current = view;
        }}
        className="min-h-[45vh] [&_.cm-editor]:min-h-[45vh]"
        placeholder="Markdown na veia — digite / para inserir título, tabela, código, fórmula…"
        extensions={editorExtensions}
      />
    </>
  );

  const previewPane = content.trim() ? (
    <NoteMarkdownPreview
      content={content}
      notes={notes}
      onCreateNote={onCreateNote}
      onToggleTaskItem={handleToggleTaskItem}
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
        <div className="flex gap-3">
        <Tabs
          className="min-w-0 flex-1"
          value={activeTab}
          onValueChange={(v) => setTab(parseTab(v))}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList className="h-8">
              <TabsTrigger value="write" className="text-xs">
                Escrever
              </TabsTrigger>
              <TabsTrigger value="preview" className="text-xs">
                Visualizar
              </TabsTrigger>
              {/* O gatilho **não existe** abaixo de `lg` (e não só some no CSS): uma aba escondida
                  continua alcançável por teclado, e duas colunas em 360px não são legíveis. */}
              {isWideScreen ? (
                <TabsTrigger value="split" className="text-xs">
                  Dividido
                </TabsTrigger>
              ) : null}
            </TabsList>
          </div>
          <TabsContent value="write" className="mt-1.5 space-y-1.5">
            {editorPane}
          </TabsContent>
          <TabsContent value="preview" className="mt-1.5 rounded-md border px-3 py-2">
            {previewPane}
          </TabsContent>
          <TabsContent value="split" className="mt-1.5">
            {/* Rolagem independente por coluna: escrever no fim de uma nota longa não pode
                arrastar o preview junto, e vice-versa. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="max-h-[70vh] space-y-1.5 overflow-y-auto">
                {editorPane}
              </div>
              <div className="max-h-[70vh] overflow-y-auto rounded-md border px-3 py-2">
                {previewPane}
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <NoteOutline
          content={content}
          activeSlug={activeSlug}
          onSelect={goToHeading}
          className="mt-9"
        />
        </div>
        {/*
          Rodapé da contagem. `aria-live="off"` de propósito: o número muda a cada tecla, e um
          leitor de tela anunciando "134 palavras… 135 palavras…" abafaria o "Salvo" do
          `SaveIndicator`, que é o aviso que realmente importa ouvir.
        */}
        {wordCount.words > 0 ? (
          <p aria-live="off" className="text-right text-xs text-muted-foreground">
            {formatWordCount(wordCount)}
          </p>
        ) : null}
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
