import type { NoteCanvasData } from "@/types/notes";

/**
 * Regras puras do canvas (feature 058): o que de fato vai para o `jsonb` de `note.canvas_data`, o
 * que volta dele e como uma nota-canvas é referenciada dentro de uma nota markdown.
 *
 * Mora em `domain/` porque é a parte testável sem DOM e sem o Excalidraw carregado — o componente
 * só liga os fios. Nada aqui importa `@excalidraw/excalidraw`: o pacote tem 2,7 MB e não pode
 * encostar no caminho crítico nem no bundle de teste.
 */

/**
 * Chaves do `appState` que sobrevivem ao save.
 *
 * O `appState` que o `onChange` entrega tem estado **volátil** junto — seleção atual, ponteiro do
 * mouse, `collaborators` (um `Map`, que `JSON.stringify` transformaria em `{}`), zoom do momento.
 * Gravar isso tudo faria o desenho carregar com a seleção de outra sessão e engordaria o jsonb a
 * cada movimento. A lista abaixo é o que descreve o *documento*, não a sessão.
 *
 * `theme` de propósito **não** entra: o tema do canvas segue o tema do app (ver `CanvasEditor`), e
 * gravá-lo faria um desenho salvo no escuro abrir escuro num app claro.
 */
export const PERSISTED_APP_STATE_KEYS = [
  "viewBackgroundColor",
  "gridSize",
  "gridModeEnabled",
  "currentItemStrokeColor",
  "currentItemBackgroundColor",
  "currentItemFillStyle",
  "currentItemStrokeWidth",
  "currentItemStrokeStyle",
  "currentItemRoughness",
  "currentItemOpacity",
  "currentItemFontFamily",
  "currentItemFontSize",
  "currentItemTextAlign",
  "currentItemStartArrowhead",
  "currentItemEndArrowhead",
  "currentItemRoundness",
] as const;

/** Elemento apagado que o Excalidraw ainda carrega para o undo funcionar — não é conteúdo. */
function isLiveElement(element: unknown): boolean {
  return !(
    typeof element === "object" &&
    element !== null &&
    (element as { isDeleted?: boolean }).isDeleted === true
  );
}

/**
 * Cena do Excalidraw → o que grava no `jsonb`. Descarta elemento apagado (lixo de undo) e reduz o
 * `appState` às chaves de documento.
 */
export function toCanvasData(
  elements: readonly unknown[],
  appState: Record<string, unknown> | null | undefined,
  files?: Record<string, unknown> | null
): NoteCanvasData {
  const persisted: Record<string, unknown> = {};
  for (const key of PERSISTED_APP_STATE_KEYS) {
    const value = appState?.[key];
    if (value !== undefined) persisted[key] = value;
  }
  return {
    elements: elements.filter(isLiveElement),
    appState: persisted,
    // Sem imagem colada, `files` fica nulo em vez de `{}` — jsonb menor e nada a restaurar.
    files: files && Object.keys(files).length > 0 ? files : null,
  };
}

/**
 * O que veio do banco → cena para o `initialData`. O `jsonb` é dado de fora do TypeScript (podia
 * ter sido gravado por outra versão, ou à mão no SQL editor), então nada aqui confia no formato:
 * o que não for reconhecível vira cena vazia, que é um canvas em branco e não uma tela de erro.
 */
export function readCanvasScene(data: unknown): {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown> | null;
} {
  const scene = typeof data === "object" && data !== null ? (data as NoteCanvasData) : null;
  return {
    elements: Array.isArray(scene?.elements) ? scene.elements.filter(isLiveElement) : [],
    appState:
      typeof scene?.appState === "object" && scene.appState !== null
        ? (scene.appState as Record<string, unknown>)
        : {},
    files:
      typeof scene?.files === "object" && scene.files !== null
        ? (scene.files as Record<string, unknown>)
        : null,
  };
}

/**
 * Assinatura do desenho, para decidir se há o que gravar.
 *
 * O Excalidraw dispara `onChange` **na montagem**, antes de o usuário tocar em nada, e depois a
 * cada movimento do ponteiro — inclusive movimentos que não mudam o documento. Sem esta
 * comparação, abrir um canvas já gravaria por cima dele e carimbaria `updated_at`, reordenando a
 * lista de notas sem que ninguém tenha editado nada.
 *
 * Os dois lados passam por `toCanvasData`, então a ordem das chaves é a mesma e `JSON.stringify`
 * basta — não é preciso um deep-equal genérico.
 */
export function canvasSceneSignature(data: NoteCanvasData): string {
  return JSON.stringify(data);
}

/** Quantos traços o desenho tem — é o que o card da lista mostra no lugar do excerpt de texto. */
export function canvasElementCount(data: unknown): number {
  return readCanvasScene(data).elements.length;
}

/** Linguagem do fence que embute um canvas numa nota markdown (registrada no `blockRegistry`). */
export const CANVAS_BLOCK_LANGUAGE = "orbyva-canvas";

/**
 * O bloco que a ação "Copiar referência" põe na área de transferência. Referência por **id**, não
 * cópia do desenho: a nota-canvas continua sendo a fonte da verdade (ver Decisões da 058).
 */
export function canvasReferenceBlock(noteId: string): string {
  return `\`\`\`${CANVAS_BLOCK_LANGUAGE}\n${noteId}\n\`\`\`\n`;
}

/**
 * Id da nota-canvas dentro do bloco. Aceita espaço e linha em branco em volta (o usuário cola o
 * bloco no meio do texto e o editor pode reindentar); devolve `null` quando o bloco está vazio,
 * que é o que faz o renderer mostrar "referência inválida" em vez de buscar `""` no banco.
 */
export function parseCanvasReference(code: string): string | null {
  const id = code.trim();
  if (!id) return null;
  // Uma linha só: bloco com mais de um id é ambíguo, e melhor recusar do que escolher sozinho.
  if (/\s/.test(id)) return null;
  return id;
}
