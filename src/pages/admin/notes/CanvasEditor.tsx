import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FormLabel } from "@/components/FormLabel";
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
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
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
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <FormLabel htmlFor="canvas-title">Título</FormLabel>
          <SaveIndicator state={saveState} />
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
        </div>
      </div>

      <div className="space-y-1.5">
        <FormLabel>Desenho</FormLabel>
        {/* O Excalidraw se posiciona em absoluto dentro do pai — sem altura explícita ele colapsa. */}
        <div className="h-[70vh] min-h-[420px] overflow-hidden rounded-md border">
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
  );
}
