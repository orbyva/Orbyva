/**
 * De quem é o `Esc` dentro do canvas (feature 172).
 *
 * O modo tela cheia (171) sai pelo botão da barra e pela tecla `Esc`. Só que o Excalidraw usa a
 * **mesma tecla** para desfazer estado interno dele: limpar a seleção, fechar o seletor de cor,
 * fechar a biblioteca, sair da edição de um texto, cancelar o editor de linha, cancelar o corte de
 * imagem. Um `Esc` cego arrancaria a pessoa do desenho quando ela só queria fechar um painel — por
 * isso a saída por teclado passa por aqui antes.
 *
 * Mora em `domain/` pelo mesmo motivo de `canvasScene.ts:6-9`: nada aqui importa
 * `@excalidraw/excalidraw`. O pacote tem 2,7 MB e `src/pages/admin/notes/ExcalidrawCanvas.tsx` é o
 * único ponto do app autorizado a importá-lo (teto de `npm run check:bundle`). O `appState` chega
 * como `Record<string, unknown>` — estrutural, não `AppState` —, o que também é o que torna a regra
 * testável em Vitest sem carregar a lib.
 */

/**
 * Chaves do `appState` em que o `Esc` pertence ao Excalidraw, com a linha de
 * `node_modules/@excalidraw/excalidraw/dist/types/excalidraw/types.d.ts` de cada uma.
 *
 * `activeTool` fica **de fora de propósito**: o Excalidraw também usa `Esc` para voltar à
 * ferramenta de seleção, mas com a ferramenta travada (*keep tool active*) esse estado não se
 * desfaz sozinho — incluí-la criaria um modo do qual `Esc` nunca sai.
 */
const ESCAPE_OWNING_KEYS = [
  "editingGroupId", // :308 — grupo aberto por duplo clique
  "editingTextElement", // :213 — texto sendo escrito
  "selectedLinearElement", // :331 — editor de linha/seta
  "croppingElementId", // :344 — corte de imagem em andamento
  "openMenu", // :253 — menu do canvas/forma
  "openPopup", // :254 — seletor de cor, fonte
  "openSidebar", // :255 — biblioteca
  "openDialog", // :259 — exportar, ajuda
  "contextMenu", // :166 — menu de contexto aberto
] as const;

/** Estado "ligado": o Excalidraw zera esses campos com `null`, nunca removendo a chave. */
function isActive(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false && value !== "";
}

/**
 * `selectedElementIds` (`:279`) é `{ [id]: true }` e vem **sempre presente**, como objeto vazio
 * quando nada está selecionado — tratar o objeto como verdadeiro faria a guarda bloquear o `Esc`
 * para sempre.
 */
function hasSelection(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value as Record<string, unknown>).some(Boolean);
}

/**
 * `true` quando aquele `Esc` é do Excalidraw (há seleção ativa ou um painel dele aberto) e a tela
 * cheia **não** deve sair; `false` quando a tecla está sobrando e a saída é nossa.
 *
 * `appState` nulo ou indefinido devolve `false` de propósito — é o caso de o chunk lazy da lib
 * ainda não ter entregue a API. Falha aberta: um `Esc` que não faz nada é pior que um que sai cedo
 * demais, e o botão "Sair da tela cheia" continua sendo a saída garantida.
 */
export function excalidrawHandlesEscape(
  appState: Record<string, unknown> | null | undefined
): boolean {
  if (!appState) return false;
  if (hasSelection(appState.selectedElementIds)) return true;
  return ESCAPE_OWNING_KEYS.some((key) => isActive(appState[key]));
}
