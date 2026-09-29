import { useId, useRef, useState } from "react";
import type { ClipboardEvent } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssetLibrary } from "@/components/assets/AssetLibrary";
import { pastedSvgFromEvent } from "@/components/assets/pastedSvg";
import { assetCopyMessage } from "@/domain/notes/assetClipboard";
import { useToast } from "@/hooks/use-toast";
import { copyAssetToClipboard } from "@/lib/assetClipboard";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { IconAsset } from "@/types/tasks";

/** Nome que o usuário deu ao acesso rápido. É o rótulo do cabeçalho do painel. */
export const ASSETS_PANEL_TITLE = "Orbyva Assets";
export const ASSET_COPY_FAILED_TITLE = "Não foi possível copiar";

/**
 * Painel que nasce aberto: `sm` do Tailwind. Abaixo dele o painel come a altura do desenho, então
 * ali ele nasce fechado — só o cabeçalho com o botão de abrir.
 */
const WIDE_SCREEN_QUERY = "(min-width: 640px)";

/**
 * Lido **uma vez**, na montagem, e não assinado: o estado aberto/fechado não é persistido nem
 * reimposto: depois do primeiro clique quem manda é a pessoa, não a largura da janela. Ambiente sem
 * `matchMedia` (jsdom sem stub) cai no caminho seguro, que é o de tela estreita.
 */
function widescreenOnMount(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(WIDE_SCREEN_QUERY).matches
  );
}

/**
 * "Orbyva Assets" — o acesso rápido à biblioteca de assets (131) dentro da tela do canvas
 * (feature 132). Clicar num asset põe o **asset** no clipboard no formato que o `paste` do
 * Excalidraw entende (feature 133: imagem, markup de SVG, ou a URL como último recurso); o que faz
 * a ponte com o desenho é o clipboard, nunca a API do Excalidraw.
 *
 * **Nada de `@excalidraw/*` entra aqui, nem tipo.** `src/pages/admin/notes/ExcalidrawCanvas.tsx` é
 * o único ponto do app que importa a lib (2,7 MB, `React.lazy`): um import daqui a arrastaria para
 * o chunk de rota de `/notes`, e `npm run check:bundle` é o teste dessa regra. Pelo mesmo motivo a
 * biblioteca importa `@/api/tasks/iconAssets` direto, nunca o barril `@/api/tasks`.
 *
 * O painel **nunca desmonta** o irmão: recolher só esconde o corpo (`hidden`), mantendo o número e
 * a ordem dos filhos da linha do desenho. Remover/acrescentar um irmão reordenaria o array de
 * filhos e o React remontaria o `ExcalidrawCanvas`, que recarrega `initialData` e joga fora a cena
 * que o debounce de 1,5 s ainda não gravou.
 */
export function CanvasAssetsPanel({ className }: { className?: string }) {
  const [open, setOpen] = useState(widescreenOnMount);
  /** Campo de colar aberto + o markup que ele edita — controlados aqui, e não dentro da
   * biblioteca, porque o `onPaste` do painel precisa preenchê-lo sem foco no textarea. */
  const [pasting, setPasting] = useState(false);
  const [markup, setMarkup] = useState("");
  /** Qual asset está com uma cópia em voo — só para o rótulo. O **guarda** é o ref abaixo. */
  const [copyingId, setCopyingId] = useState<string | null>(null);
  /**
   * Dois cliques no mesmo tick leem o mesmo `copyingId` (o estado só chega no render seguinte) e
   * disparariam duas escritas — a segunda cancelando a primeira no meio, que no Safari é
   * exatamente o jeito de acabar com o clipboard vazio. O ref é lido e escrito na hora.
   */
  const copyingRef = useRef(false);
  const bodyId = useId();
  const { toast } = useToast();

  /**
   * O clique copia o **asset**, não o endereço dele (feature 133): imagem para PNG/JPEG/WebP,
   * markup para SVG, e o link só quando nada disso foi possível.
   *
   * O toast sai do resultado que a função devolveu, nunca da intenção — é o contrato
   * `"image" | "svg-text" | "link"` que impede a tela de dizer "asset copiado" depois de um
   * `clipboard.write` rejeitado.
   */
  async function copyAsset(asset: IconAsset) {
    if (copyingRef.current) return;
    copyingRef.current = true;
    setCopyingId(asset.id);
    try {
      const result = await copyAssetToClipboard(asset);
      const { title, description } = assetCopyMessage(result);
      toast({ title, description, duration: 3000 });
    } catch (error) {
      // Só chega aqui quem nem o link conseguiu escrever: sem clipboard, ou documento sem foco.
      toast({
        variant: "destructive",
        title: ASSET_COPY_FAILED_TITLE,
        description: getErrorMessage(error, asset.url),
      });
    } finally {
      copyingRef.current = false;
      setCopyingId(null);
    }
  }

  /**
   * `Ctrl+V` com o painel aberto e nenhum campo focado não chega a lugar nenhum — daí o atalho:
   * se o que foi colado **parece** SVG, o campo de colar abre já preenchido. Mesmo molde do
   * popover de ícone de tarefa (`TaskIconPicker`).
   */
  function handlePaste(e: ClipboardEvent) {
    if (!open || pasting) return;
    const pastedSvg = pastedSvgFromEvent(e);
    if (pastedSvg === null) return;
    e.preventDefault();
    setMarkup(pastedSvg);
    setPasting(true);
  }

  return (
    <aside
      onPaste={handlePaste}
      className={cn(
        "flex flex-col overflow-hidden rounded-md border",
        // Fechado o painel encolhe para a tira do botão: o desenho fica com o resto da largura.
        open ? "sm:w-56 sm:shrink-0" : "sm:w-auto sm:shrink-0",
        className
      )}
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        {open && (
          <span className="flex-1 truncate text-xs font-medium">
            {ASSETS_PANEL_TITLE}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={
            open ? `Recolher ${ASSETS_PANEL_TITLE}` : `Abrir ${ASSETS_PANEL_TITLE}`
          }
          onClick={() => setOpen((prev) => !prev)}
        >
          {open ? (
            <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </Button>
      </div>

      {/* `hidden`, nunca desmontado: a lista já carregada sobrevive ao recolher, e o irmão do
          desenho não muda de posição na árvore. */}
      <div
        id={bodyId}
        hidden={!open}
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-2 pb-2 max-sm:max-h-64"
      >
        <AssetLibrary
          enabled={open}
          onSelect={(asset) => void copyAsset(asset)}
          selectLabel={(asset) =>
            copyingId === asset.id ? `Copiando ${asset.name}` : `Copiar ${asset.name}`
          }
          pasting={pasting}
          onPastingChange={setPasting}
          markup={markup}
          onMarkupChange={setMarkup}
        />
      </div>
    </aside>
  );
}
