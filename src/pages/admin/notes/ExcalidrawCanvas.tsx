import { useCallback } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { toCanvasData } from "@/domain/notes/canvasScene";
import type { NoteCanvasData } from "@/types/notes";

/**
 * O Excalidraw de verdade, isolado num módulo só dele (feature 058).
 *
 * **Este arquivo existe para nunca ser importado estaticamente.** Ele é o único ponto do app com
 * `import` de `@excalidraw/excalidraw` — 2,7 MB minificados, a maior dependência do projeto — e do
 * CSS dele, que sozinho tem 144 KB. Quem o usa é o `React.lazy` do `CanvasEditor` e o
 * `await import()` do `CanvasBlock`; importar daqui de qualquer outro lugar joga tudo isso no chunk
 * da rota e estoura `npm run check:bundle` (teto de 160 KB gzip por rota). Foi por isso que o
 * componente ficou separado do `CanvasEditor`, que é quem tem o estado e o autosave.
 *
 * A fronteira de tipos também para aqui: quem chama fala em `NoteCanvasData` (contrato do banco),
 * não em `ExcalidrawElement`. Assim atualizar a lib não vaza para o resto do módulo.
 */
export interface ExcalidrawCanvasProps {
  /** Cena inicial, já lida do `jsonb` por `readCanvasScene`. Só é usada na montagem. */
  initialScene: {
    elements: readonly unknown[];
    appState: Record<string, unknown>;
    files: Record<string, unknown> | null;
  };
  theme: "light" | "dark";
  /** Toda alteração do desenho, já reduzida ao que se grava. O debounce é de quem chama. */
  onSceneChange?: (data: NoteCanvasData) => void;
  /** Canvas embutido numa nota é só leitura; a página do canvas é editável. */
  readOnly?: boolean;
  /**
   * A API imperativa do Excalidraw, entregue uma vez na montagem (feature 172) — é por ela que o
   * `CanvasEditor` lê o `appState` **vivo** na hora do `Esc`, sem reagir a cada movimento do
   * ponteiro como faria encaminhar o `appState` do `onChange`.
   *
   * O tipo é **estrutural de propósito**: `{ getAppState: () => Record<string, unknown> }`, e não
   * `ExcalidrawImperativeAPI`. Nomear o tipo da lib aqui o faria vazar para o arquivo que chama, e
   * este módulo é o único do app autorizado a encostar em `@excalidraw/excalidraw` (ver o cabeçalho
   * acima e `npm run check:bundle`). Quem recebe a API só pode fazer com ela o que este contrato
   * promete.
   */
  onApiReady?: (api: { getAppState: () => Record<string, unknown> }) => void;
}

export default function ExcalidrawCanvas({
  initialScene,
  theme,
  onSceneChange,
  readOnly = false,
  onApiReady,
}: ExcalidrawCanvasProps) {
  /**
   * Adaptador entre a API da lib e o contrato estrutural — o único lugar onde os dois se tocam.
   * `useCallback` porque a identidade desta prop é o que o Excalidraw observa para reentregar a
   * API; recriá-la a cada render repetiria a entrega sem necessidade.
   */
  const handleApiReady = useCallback(
    (api: { getAppState: () => unknown }) => {
      onApiReady?.({
        getAppState: () => api.getAppState() as Record<string, unknown>,
      });
    },
    [onApiReady]
  );

  return (
    <Excalidraw
      // `scrollToContent` enquadra o desenho salvo em vez de abrir no canto vazio da tela.
      initialData={{
        elements: initialScene.elements as never,
        appState: { ...initialScene.appState, theme },
        files: (initialScene.files ?? undefined) as never,
        scrollToContent: true,
      }}
      theme={theme}
      viewModeEnabled={readOnly}
      excalidrawAPI={onApiReady ? handleApiReady : undefined}
      onChange={
        onSceneChange
          ? (elements, appState, files) =>
              onSceneChange(
                toCanvasData(
                  elements as readonly unknown[],
                  appState as unknown as Record<string, unknown>,
                  files as unknown as Record<string, unknown>
                )
              )
          : undefined
      }
    />
  );
}
