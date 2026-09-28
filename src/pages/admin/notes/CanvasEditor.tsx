import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, CircleAlert, Copy, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FormLabel } from "@/components/FormLabel";
import { CanvasAssetsPanel } from "@/pages/admin/notes/CanvasAssetsPanel";
import { NoteLinksPanel } from "@/pages/admin/notes/NoteLinksPanel";
import { BacklinksPanel } from "@/pages/admin/notes/BacklinksPanel";
import { ProjectPicker } from "@/pages/admin/tasks/ProjectPicker";
import { NoteFolderPicker } from "@/pages/admin/notes/NoteFolderPicker";
import { updateNote } from "@/api/notes/notes";
import { NOTE_TITLE_MAX } from "@/domain/notes/noteDraft";
import {
  canvasReferenceBlock,
  canvasSceneSignature,
  readCanvasScene,
  toCanvasData,
} from "@/domain/notes/canvasScene";
import { excalidrawHandlesEscape } from "@/domain/notes/canvasEscape";
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { Note, NoteCanvasData, NoteFolder } from "@/types/notes";
import type { Project } from "@/types/tasks";

/**
 * `React.lazy` **obrigatório**, não otimização: `@excalidraw/excalidraw` tem 2,7 MB minificados,
 * ordens de grandeza acima do teto de 160 KB gzip por rota de `scripts/check-bundle-budget.mjs`.
 * Import estático aqui derruba o `npm run check:bundle`, que é justamente o teste dessa regra.
 */
const ExcalidrawCanvas = lazy(
  () => import("@/pages/admin/notes/ExcalidrawCanvas")
);

/**
 * Janela do autosave do canvas — bem maior que a do editor markdown (800 ms).
 *
 * O Excalidraw dispara `onChange` a cada movimento do ponteiro: com a janela do markdown, arrastar
 * um retângulo por dois segundos viraria uma dezena de `update` no banco. 1,5 s é o intervalo em
 * que o traço já terminou.
 */
export const CANVAS_AUTOSAVE_DEBOUNCE_MS = 1500;

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
 * Editor de uma nota-canvas: título, o Excalidraw e o vínculo com um projeto — o mesmo desenho da
 * `NoteEditor`, trocando o corpo em Markdown pelo desenho livre (feature 058).
 *
 * Como canvas **é uma nota**, e não entidade nova, os painéis de vínculo e backlink da 056 valem
 * aqui sem adaptação nenhuma.
 */
export function CanvasEditor({
  note,
  projects,
  folders = [],
  onSaved,
  debounceMs = CANVAS_AUTOSAVE_DEBOUNCE_MS,
}: {
  note: Note;
  projects: Project[];
  folders?: NoteFolder[];
  onSaved?: (note: Note) => void;
  debounceMs?: number;
}) {
  const [title, setTitle] = useState(note.title);
  const [projectId, setProjectId] = useState<string | null>(note.project_id);
  const [folderId, setFolderId] = useState<string | null>(note.folder_id);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [copied, setCopied] = useState(false);
  /**
   * Modo tela cheia (feature 171). Nasce `false` a cada montagem e **não** é persistido: preferência
   * de visualização guardada sem controle visível confundiria num modo que toma a tela inteira.
   */
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isDark = useIsDarkTheme();
  const { toast } = useToast();

  /**
   * A cena é lida **uma vez por nota**: o Excalidraw é não-controlado depois de montado (guarda a
   * cena por dentro), então realimentá-lo a cada save desfaria o traço em andamento.
   */
  const initialScene = useMemo(
    () => readCanvasScene(note.canvas_data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [note.id]
  );

  /** Último desenho recebido do `onChange`. Ref, não estado: re-render por traço travaria o canvas. */
  const sceneRef = useRef<NoteCanvasData | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Assinatura do que já está gravado. Começa valendo a cena carregada do banco, e é isso que faz
   * o `onChange` de montagem do Excalidraw ser ignorado em vez de virar um save inútil.
   */
  const savedSignatureRef = useRef<string>(
    canvasSceneSignature(
      toCanvasData(
        initialScene.elements,
        initialScene.appState,
        initialScene.files
      )
    )
  );

  const saveRef = useRef<() => Promise<void>>(async () => {});
  saveRef.current = async () => {
    setSaveState("saving");
    try {
      await updateNote({
        id: note.id,
        title,
        project_id: projectId,
        folder_id: folderId,
        // Só manda o desenho quando o usuário mexeu nele: renomear a nota não pode reescrever a
        // cena com o que o `onChange` ainda não entregou.
        ...(sceneRef.current ? { canvas_data: sceneRef.current } : {}),
      });
      setSaveState("saved");
      onSaved?.({
        ...note,
        title,
        project_id: projectId,
        folder_id: folderId,
        canvas_data: sceneRef.current ?? note.canvas_data,
      });
    } catch (error) {
      setSaveState("error");
      toast({
        variant: "destructive",
        title: "Não foi possível salvar o canvas",
        description: getErrorMessage(error),
      });
    }
  };

  function scheduleSave() {
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void saveRef.current(), debounceMs);
  }

  // Trocar de nota recarrega os campos sem disparar save — abrir um canvas não pode gravar por
  // cima dele. Mesmo cuidado do `NoteEditor` (055).
  const skipNextSave = useRef(true);
  useEffect(() => {
    skipNextSave.current = true;
    sceneRef.current = null;
    savedSignatureRef.current = canvasSceneSignature(
      toCanvasData(
        initialScene.elements,
        initialScene.appState,
        initialScene.files
      )
    );
    setTitle(note.title);
    setProjectId(note.project_id);
    setFolderId(note.folder_id);
    setSaveState("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  // Título e projeto usam o mesmo debounce do desenho — um só agendamento, uma só gravação.
  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    scheduleSave();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, projectId, folderId, debounceMs]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  /** Os dois botões que trocam de modo — o foco vai de um para o outro ao entrar e ao sair. */
  const enterFullscreenRef = useRef<HTMLButtonElement>(null);
  const exitFullscreenRef = useRef<HTMLButtonElement>(null);
  /** Primeira renderização não mexe no foco: abrir um canvas não pode roubar o cursor da página. */
  const fullscreenDidMount = useRef(false);
  useEffect(() => {
    if (!fullscreenDidMount.current) {
      fullscreenDidMount.current = true;
      return;
    }
    // Ao entrar, o botão de origem some com o bloco de título (`hidden`) e o foco ficaria no
    // `body`; ao sair, ele volta para onde a pessoa estava.
    const target = isFullscreen
      ? exitFullscreenRef.current
      : enterFullscreenRef.current;
    target?.focus();
  }, [isFullscreen]);

  /**
   * Trava a rolagem da página atrás do overlay. O cleanup devolve o valor anterior — inclusive no
   * unmount, senão navegar para outra nota ainda em tela cheia deixaria a página travada.
   */
  useEffect(() => {
    if (!isFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isFullscreen]);

  /**
   * Saída única do modo cheio (feature 172): o botão da barra e o `Esc` chamam **esta** função. Um
   * segundo caminho de saída significaria dois lugares para esquecer de devolver o foco — e, pior,
   * a tentação de desmontar algo em um deles e remontar o Excalidraw.
   */
  const exitFullscreen = useCallback(() => setIsFullscreen(false), []);

  /**
   * A API imperativa do Excalidraw, guardada em **ref** e sem `setState`: ela chega na montagem do
   * chunk lazy e só é lida no `keydown`. Em estado, essa chegada viraria mais um render do editor.
   */
  const excalidrawApiRef = useRef<{
    getAppState: () => Record<string, unknown>;
  } | null>(null);
  /**
   * Callback **estável**: a identidade desta prop atravessa o `ExcalidrawCanvas` até o atributo
   * `excalidrawAPI`. Recriá-la a cada render (inclusive o render de entrar em tela cheia) faria a
   * lib reentregar a API sem motivo.
   */
  const handleApiReady = useCallback(
    (api: { getAppState: () => Record<string, unknown> }) => {
      excalidrawApiRef.current = api;
    },
    []
  );

  /**
   * `Esc` sai da tela cheia — **só quando a tecla está sobrando**.
   *
   * O Excalidraw usa `Esc` para o estado interno dele (seleção, seletor de cor, biblioteca, edição
   * de texto, editor de linha, corte). Por isso a saída consulta o `appState` vivo antes de agir:
   * com painel aberto ou seleção ativa, a tecla é dele e nada acontece aqui — é o que produz a
   * saída em duas etapas (um `Esc` limpa a seleção, o seguinte sai do modo).
   *
   * O listener só existe enquanto o modo está ligado: em modo normal `Esc` em cima do canvas
   * continua sendo assunto exclusivo do Excalidraw. Fase de bolha em `window`, depois do handler do
   * próprio Excalidraw (que é em `document`) — o `appState` que lemos ainda é o de **antes** da
   * tecla, porque o React só aplica o `setState` dele depois deste turno.
   */
  useEffect(() => {
    if (!isFullscreen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Alguém mais perto do alvo já resolveu essa tecla (um diálogo do Radix, por exemplo).
      if (event.defaultPrevented) return;
      if (excalidrawHandlesEscape(excalidrawApiRef.current?.getAppState())) {
        return;
      }
      exitFullscreen();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, exitFullscreen]);

  /**
   * "Copiar referência" é o que torna o embed descobrível: ninguém adivinha que existe um bloco
   * ` ```orbyva-canvas ` nem decora o uuid da nota.
   */
  async function handleCopyReference() {
    const block = canvasReferenceBlock(note.id);
    try {
      await navigator.clipboard.writeText(block);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Referência copiada",
        description: "Cole numa nota para embutir este desenho.",
        duration: 3000,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Não foi possível copiar",
        description: getErrorMessage(error, block),
      });
    }
  }

  return (
    <div className="space-y-4">
      {/*
        Em tela cheia tudo que não é o desenho some com o atributo `hidden` — **nunca** desmontado.
        Remover um irmão reordena o array de filhos e o React remonta o `ExcalidrawCanvas`, que
        recarrega `initialData` e joga fora a cena que o debounce de 1,5 s ainda não gravou.
      */}
      <div className="space-y-1.5" hidden={isFullscreen}>
        <div className="flex items-center justify-between gap-2">
          <FormLabel htmlFor="canvas-title">Título</FormLabel>
          {/* Um `SaveIndicator` de cada vez. O da barra de tela cheia é o mesmo componente; dois
              `role="status"` com o mesmo texto no DOM anunciariam a gravação em dobro. */}
          {isFullscreen ? null : <SaveIndicator state={saveState} />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="canvas-title"
            value={title}
            maxLength={NOTE_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título do canvas"
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs"
            onClick={handleCopyReference}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            {copied ? "Copiado" : "Copiar referência"}
          </Button>
          <Button
            ref={enterFullscreenRef}
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs"
            onClick={() => setIsFullscreen(true)}
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            Tela cheia
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <FormLabel className={cn(isFullscreen && "hidden")}>Desenho</FormLabel>
        {/*
          Contêiner do desenho. Trocar de modo é trocar `className` deste nó — nada entra nem sai da
          árvore abaixo dele. Overlay CSS, e não `requestFullscreen()`: o Radix portalza popover e
          diálogo para o `document.body` e o `<Toaster />` mora no `AdminLayout`; num elemento
          fullscreen nativo o toast de erro de gravação ficaria invisível. `z-50` cobre todo o chrome
          (vai até `z-40`) e continua abaixo do viewport de toast (`z-[100]`).
        */}
        <div
          role={isFullscreen ? "region" : undefined}
          aria-label={isFullscreen ? "Canvas em tela cheia" : undefined}
          className={cn(
            "flex flex-col",
            isFullscreen &&
              "fixed inset-0 z-50 overflow-hidden border-0 bg-background"
          )}
        >
          {/*
            Barra fina: primeira linha do flex column, não um flutuante por cima do desenho — o
            Excalidraw ocupa as quatro bordas com controles próprios em algum breakpoint.
            Sempre montada; fora do modo cheio sai com `hidden` (sem classe de `display` no nó, senão
            a utilitária venceria o `[hidden]{display:none}` do preflight).
          */}
          <div
            hidden={!isFullscreen}
            className={cn(
              "h-10 shrink-0 items-center gap-2 border-b px-2",
              isFullscreen && "flex"
            )}
          >
            {/* Texto, não `Input`: editar o título continua no modo normal — um segundo campo para
                o mesmo estado seria dois controles, e mover o de cima remontaria o campo. */}
            <p className="hidden min-w-0 flex-1 truncate text-sm font-medium sm:block">
              {title}
            </p>
            <div className="ml-auto flex items-center gap-2">
              {isFullscreen ? <SaveIndicator state={saveState} /> : null}
              <Button
                ref={exitFullscreenRef}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 gap-1.5 text-xs"
                onClick={exitFullscreen}
              >
                <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                Sair da tela cheia
              </Button>
            </div>
          </div>

          {/*
            Linha: "Orbyva Assets" (132) à esquerda e o desenho à direita. Abaixo de `sm` vira coluna,
            com o painel — que nasce fechado ali — acima do desenho.

            Os dois filhos são **sempre os mesmos, nesta ordem**: recolher o painel esconde o corpo
            dele e não mexe na árvore. Remover/acrescentar um irmão reordenaria o array de filhos, e o
            React remontaria o `ExcalidrawCanvas`.
          */}
          <div
            className={cn(
              "flex flex-col gap-2 sm:flex-row",
              isFullscreen
                ? "min-h-0 flex-1"
                : "sm:h-[70vh] sm:min-h-[420px]"
            )}
          >
            <CanvasAssetsPanel />
            {/* O Excalidraw se posiciona em absoluto dentro do pai — sem altura explícita ele colapsa.
                Em tela larga quem dá a altura é a linha (o `flex-1` estica); abaixo de `sm` a altura
                fica aqui, para o painel aberto não espremer o desenho. Em tela cheia a altura vem do
                `flex-1` da linha, e a borda/raio saem: o desenho encosta nas bordas da janela. */}
            <div
              className={cn(
                "overflow-hidden",
                isFullscreen
                  ? "min-h-0 flex-1"
                  : "h-[70vh] min-h-[420px] rounded-md border sm:h-auto sm:min-h-0 sm:flex-1"
              )}
            >
              <Suspense
                fallback={
                  <Skeleton
                    role="status"
                    aria-label="Carregando o canvas"
                    className="h-full w-full rounded-none"
                  />
                }
              >
                <ExcalidrawCanvas
                  initialScene={initialScene}
                  theme={isDark ? "dark" : "light"}
                  onApiReady={handleApiReady}
                  onSceneChange={(data) => {
                    // Movimento de ponteiro que não mudou o documento (e o `onChange` de montagem)
                    // não pode virar gravação — ver `canvasSceneSignature`.
                    const signature = canvasSceneSignature(data);
                    if (signature === savedSignatureRef.current) return;
                    savedSignatureRef.current = signature;
                    sceneRef.current = data;
                    scheduleSave();
                  }}
                />
              </Suspense>
            </div>
          </div>
        </div>
      </div>

      {/* Metadados e vínculos não fazem parte do desenho: somem em tela cheia, sem desmontar. */}
      <div className="space-y-4" hidden={isFullscreen}>
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

        <NoteLinksPanel noteId={note.id} projects={projects} />
        <BacklinksPanel note={note} />
      </div>
    </div>
  );
}
