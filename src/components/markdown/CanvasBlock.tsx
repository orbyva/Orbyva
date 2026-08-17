import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { sanitizeSvgElement } from "@/components/markdown/sanitizeSvg";
import { fetchNote } from "@/api/notes/notes";
import {
  parseCanvasReference,
  readCanvasScene,
} from "@/domain/notes/canvasScene";
import { getErrorMessage } from "@/lib/errors";

/**
 * Renderer do bloco ` ```orbyva-canvas ` — um desenho da feature 058 embutido numa nota markdown,
 * **por referência**: o conteúdo do fence é só o id da nota-canvas, e o desenho continua morando
 * lá. Copiar o JSON para dentro do markdown criaria duas cópias do mesmo desenho sem fonte da
 * verdade (ver Decisões).
 *
 * **O SVG entra como nó, nunca como HTML cru.** `exportToSvg` devolve um `SVGSVGElement` já
 * construído; ele é limpo por `sanitizeSvgElement` **antes** de ser anexado (enquanto ainda está
 * fora do documento e não tem efeito nenhum) e então vai para a tela por `ref`. Usar
 * `dangerouslySetInnerHTML` aqui reabriria o vetor que as três features anteriores fecharam — o
 * conteúdo do desenho, inclusive o texto livre dentro dele, é dado do usuário.
 *
 * O `await import()` é obrigatório pelo mesmo motivo do `CanvasEditor`: 2,7 MB não podem entrar no
 * chunk da rota de notas.
 */
export function CanvasBlock({ code }: { code: string }) {
  const noteId = parseCanvasReference(code);
  const [state, setState] = useState<CanvasBlockState>({ status: "loading" });
  const [title, setTitle] = useState<string>("");
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!noteId) {
      setState({
        status: "error",
        message:
          "Bloco de canvas sem id. Use a ação “Copiar referência” na página do canvas.",
      });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    void (async () => {
      try {
        // A RLS já garante que só vem nota do próprio usuário: id de outra conta volta `null`.
        const note = await fetchNote(noteId);
        if (cancelled) return;
        if (!note) {
          setState({
            status: "error",
            message: "Canvas não encontrado — ele pode ter sido excluído.",
          });
          return;
        }
        if (note.kind !== "canvas") {
          setState({
            status: "error",
            message: `“${note.title}” é uma nota de texto, não um canvas.`,
          });
          return;
        }
        setTitle(note.title);

        const scene = readCanvasScene(note.canvas_data);
        if (scene.elements.length === 0) {
          setState({ status: "empty" });
          return;
        }

        const { exportToSvg } = await import("@excalidraw/excalidraw");
        const svg = await exportToSvg({
          elements: scene.elements as never,
          appState: { ...scene.appState, exportBackground: false } as never,
          files: (scene.files ?? null) as never,
        });
        if (cancelled) return;
        setState({ status: "ready", svg: sanitizeSvgElement(svg) });
      } catch (error) {
        if (cancelled) return;
        setState({
          status: "error",
          message: getErrorMessage(error, "Não foi possível desenhar este canvas."),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [noteId]);

  /**
   * O SVG é anexado por efeito, e não por JSX, porque ele é um **nó** e não um elemento de React —
   * é justamente isso que dispensa `dangerouslySetInnerHTML`.
   */
  useEffect(() => {
    const host = hostRef.current;
    if (!host || state.status !== "ready") return;
    host.replaceChildren(state.svg);
    return () => host.replaceChildren();
  }, [state]);

  if (state.status === "error") {
    return (
      <div
        role="alert"
        className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2"
      >
        <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
          Canvas indisponível
        </p>
        <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
          {state.message}
        </p>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <Skeleton
        role="status"
        aria-label="Carregando o canvas"
        className="h-32 w-full"
      />
    );
  }

  return (
    <div className="space-y-1.5 rounded-md border p-2">
      {state.status === "empty" ? (
        <p className="px-1 py-6 text-center text-xs text-muted-foreground">
          Este canvas ainda está em branco.
        </p>
      ) : (
        <div
          ref={hostRef}
          data-testid="canvas-drawing"
          className="overflow-x-auto [&_svg]:h-auto [&_svg]:max-w-full"
        />
      )}
      <Link
        to={`/notes/${noteId}`}
        className="inline-flex items-center gap-1.5 px-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
        {title ? `Abrir canvas: ${title}` : "Abrir canvas"}
      </Link>
    </div>
  );
}

type CanvasBlockState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; svg: SVGSVGElement }
  | { status: "error"; message: string };
