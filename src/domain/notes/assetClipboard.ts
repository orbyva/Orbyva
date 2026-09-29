/**
 * Regra pura de "o que acontece quando alguém clica num asset da biblioteca dentro da tela do
 * canvas" (feature 133): qual caminho de clipboard aquela URL pede, e o que o toast diz depois.
 *
 * Mora em `domain/notes` e não em `domain/tasks` porque o que ela modela é **o que o canvas cola**,
 * não o que a biblioteca de ícones guarda — é vizinha de `canvasScene.ts`, não de `svgIcon.ts`.
 *
 * Aqui não há I/O nenhum: nada de `fetch`, `navigator.clipboard`, `document` ou `Image`. A execução
 * (e os quatro modos de falha dela) mora em `src/lib/assetClipboard.ts`. A separação é o que
 * permite testar a decisão de formato sem navegador — e clipboard de imagem não existe em jsdom.
 */

/**
 * O que de fato foi parar no clipboard. **Não** é o que se pretendia copiar: quem escreve o toast
 * lê este valor, e é por isso que ele existe — o defeito clássico desta tela é o toast dizer
 * "imagem copiada" quando o `clipboard.write` foi rejeitado e só o link foi escrito.
 */
export type AssetCopyResult = "image" | "svg-text" | "link";

/**
 * O caminho que a URL pede:
 *
 * - `svg` — markup buscado e escrito como **texto**; é assim que o `paste` do Excalidraw entende
 *   SVG sem plugin.
 * - `png` — o blob vai direto para um `ClipboardItem`, porque `image/png` é o único tipo de imagem
 *   que os navegadores aceitam num `clipboard.write`.
 * - `raster` — JPEG e WebP: **precisam ser transcodificados para PNG** antes. Chromium e WebKit
 *   recusam o blob "como veio" com `NotAllowedError: Type image/jpeg not supported on write`.
 * - `unknown` — sem extensão reconhecível; vai pelo fallback de link, que é o caminho que funciona
 *   sem saber o que o arquivo é.
 */
export type AssetClipboardKind = "svg" | "png" | "raster" | "unknown";

/** Extensão → caminho. `jpg`, `jpeg` e `webp` caem juntos em `raster` porque o que os une é
 * precisarem de transcodificação, não o formato em si. */
const KIND_BY_EXTENSION: Record<string, AssetClipboardKind> = {
  svg: "svg",
  png: "png",
  jpg: "raster",
  jpeg: "raster",
  webp: "raster",
};

/**
 * A extensão do último segmento do caminho, em minúsculas, sem query string nem fragmento.
 *
 * A URL pública do bucket vem como `.../library/{uuid}.png`, mas nada impede que um dia ela chegue
 * assinada (`?token=…`): cortar em `?` e `#` antes de procurar o ponto é o que evita `png?token`
 * virar extensão desconhecida e mandar a biblioteca inteira para o fallback.
 */
function extensionOf(url: string): string {
  const path = url.split("#")[0].split("?")[0];
  const lastSegment = path.slice(path.lastIndexOf("/") + 1);
  const dot = lastSegment.lastIndexOf(".");
  if (dot <= 0) return "";
  return lastSegment.slice(dot + 1).toLowerCase();
}

/**
 * Por qual caminho de clipboard o asset desta URL vai. Decidido pela **extensão**, e não pelo mime,
 * porque `icon_asset` guarda só `name` e `url` (`src/types/tasks.ts`) — não há mime para consultar
 * sem uma requisição a mais.
 */
export function assetClipboardKind(url: string): AssetClipboardKind {
  return KIND_BY_EXTENSION[extensionOf(url)] ?? "unknown";
}

/**
 * As frases de cada resultado. A do link **diz que a imagem não foi copiada** — é a decisão do
 * desenho: cair para o link é aceitável, mentir sobre o que está no clipboard não. Quem cola
 * depois de um toast de link recebe a URL, e precisa saber disso antes de colar.
 */
export const ASSET_COPY_MESSAGE = {
  image: {
    title: "Asset copiado",
    description: "Cole no desenho (Ctrl/Cmd+V).",
  },
  svgText: {
    title: "SVG copiado",
    description: "Cole no desenho (Ctrl/Cmd+V).",
  },
  link: {
    title: "Link copiado",
    description:
      "Não foi possível copiar a imagem — copiamos o link no lugar. Cole no desenho (Ctrl/Cmd+V) e a imagem vem pela URL.",
  },
} as const;

/** Ponte única entre o resultado real da escrita e o texto que a pessoa lê. Existe para que o
 * painel não possa escolher a frase por conta própria — é o que mantém toast e clipboard juntos. */
export function assetCopyMessage(
  result: AssetCopyResult
): (typeof ASSET_COPY_MESSAGE)[keyof typeof ASSET_COPY_MESSAGE] {
  if (result === "image") return ASSET_COPY_MESSAGE.image;
  if (result === "svg-text") return ASSET_COPY_MESSAGE.svgText;
  return ASSET_COPY_MESSAGE.link;
}
