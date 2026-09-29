import { assetClipboardKind, type AssetCopyResult } from "@/domain/notes/assetClipboard";

/**
 * Põe um asset da biblioteca no clipboard **no formato que o `paste` do Excalidraw entende**
 * (feature 133) — a ponte entre o painel "Orbyva Assets" e o desenho.
 *
 * Nada de `@excalidraw/*` encosta aqui: a lib tem 2,7 MB e só `ExcalidrawCanvas.tsx` a importa.
 * A ponte é o clipboard, por decisão do desenho, e não a API do editor.
 *
 * As dependências entram por parâmetro porque **é assim que os quatro caminhos e os modos de falha
 * ficam testáveis sem navegador** — `next` e o `CLAUDE.md` proíbem verificação por Chrome, e
 * clipboard de imagem não existe em jsdom. Em produção nada é passado e tudo cai nos globais.
 */
export interface AssetClipboardDeps {
  fetchFn?: typeof fetch;
  /** `navigator.clipboard`. Ausente = contexto inseguro (`http://`) ou navegador sem a API. */
  clipboard?: Pick<Clipboard, "write" | "writeText"> | null;
  /** O construtor. Ausente = sem clipboard de imagem; o asset vai como link. */
  clipboardItem?: typeof ClipboardItem | null;
  /** JPEG/WebP → PNG. Injetável porque o padrão usa `Image` + `<canvas>`, que jsdom não desenha. */
  toPngBlob?: (url: string) => Promise<Blob>;
}

/** Sem clipboard não há nem fallback: é o único caso em que o erro sobe para a tela. */
const NO_CLIPBOARD = "Clipboard indisponível neste navegador.";

function resolveClipboard(deps: AssetClipboardDeps): Pick<Clipboard, "write" | "writeText"> {
  const clipboard =
    deps.clipboard ?? (typeof navigator === "undefined" ? null : navigator.clipboard);
  if (!clipboard) throw new Error(NO_CLIPBOARD);
  return clipboard;
}

function resolveClipboardItem(deps: AssetClipboardDeps): typeof ClipboardItem | null {
  if (deps.clipboardItem !== undefined) return deps.clipboardItem;
  return typeof ClipboardItem === "undefined" ? null : ClipboardItem;
}

/**
 * Transcodifica JPEG/WebP para PNG num `<canvas>`.
 *
 * **Não é otimização, é obrigação**: `clipboard.write` só aceita `image/png`. Mandar o blob "como
 * veio" falha com `NotAllowedError: Type image/jpeg not supported on write` — em metade da
 * biblioteca, e em silêncio, já que o `write` rejeita sem tela nenhuma mudar.
 *
 * `crossOrigin = "anonymous"` antes do `src`: o bucket `task-icons` é público e responde com CORS
 * liberado, e sem isso o canvas fica "tainted" e `toBlob` lança `SecurityError`.
 */
export function transcodeToPngBlob(url: string): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx || !canvas.width || !canvas.height) {
        reject(new Error("Não foi possível preparar a imagem para o clipboard."));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Não foi possível converter a imagem para PNG."));
      }, "image/png");
    };
    img.onerror = () => reject(new Error("Não foi possível carregar a imagem do asset."));
    img.src = url;
  });
}

/** O blob do arquivo como ele está no bucket — usado só no caminho `.png`, que já é o tipo certo. */
function fetchBlob(fetchFn: typeof fetch, url: string): Promise<Blob> {
  return fetchFn(url).then((response) => {
    if (!response.ok) throw new Error(`Falha ao buscar o asset (HTTP ${response.status}).`);
    return response.blob();
  });
}

/**
 * Copia o asset e diz **o que de fato foi copiado**: `"image"`, `"svg-text"` ou `"link"`.
 *
 * O resultado é o contrato com o toast. Quem chama não escolhe a frase antes de saber o que
 * aconteceu — é o que impede o defeito clássico desta tela, o toast dizer "asset copiado" depois de
 * um `write` rejeitado.
 *
 * Três caminhos e um fallback único:
 * - `.svg` → markup buscado e escrito como texto (o Excalidraw cola SVG assim, sem plugin);
 * - `.png` → `ClipboardItem({ "image/png": blob })`;
 * - `.jpg`/`.jpeg`/`.webp` → transcodificados para PNG antes, pelo mesmo caminho;
 * - qualquer falha, ou extensão desconhecida → `writeText` da URL pública e `"link"`.
 *
 * **O `ClipboardItem` é construído com a `Promise<Blob>`, sem `await` antes.** Safari invalida a
 * escrita quando a chamada sai do gesto do usuário; passar a promessa para dentro do
 * `ClipboardItem` (a especificação aceita) é o que mantém o gesto vivo enquanto o `fetch` e a
 * transcodificação acontecem. Pôr um `await` aqui quebra só no Safari — e só em produção.
 */
export async function copyAssetToClipboard(
  asset: { name: string; url: string },
  deps: AssetClipboardDeps = {}
): Promise<AssetCopyResult> {
  const clipboard = resolveClipboard(deps);
  const kind = assetClipboardKind(asset.url);

  if (kind !== "unknown") {
    try {
      if (kind === "svg") {
        const fetchFn = deps.fetchFn ?? fetch;
        const response = await fetchFn(asset.url);
        if (!response.ok) throw new Error(`Falha ao buscar o SVG (HTTP ${response.status}).`);
        const markup = await response.text();
        if (!markup.trim()) throw new Error("SVG vazio.");
        await clipboard.writeText(markup);
        return "svg-text";
      }

      const clipboardItem = resolveClipboardItem(deps);
      // Antes de montar a promessa do blob, de propósito: sem construtor não há quem a consuma, e
      // uma promessa órfã viraria rejeição sem dono.
      if (!clipboardItem) throw new Error("Clipboard de imagem indisponível.");

      const png =
        kind === "png"
          ? fetchBlob(deps.fetchFn ?? fetch, asset.url)
          : (deps.toPngBlob ?? transcodeToPngBlob)(asset.url);
      // Sem `await` entre a linha acima e esta. Ver o bloco do Safari no cabeçalho.
      await clipboard.write([new clipboardItem({ "image/png": png })]);
      return "image";
    } catch {
      // Toda falha de imagem/SVG tem o mesmo destino: o link. Engolir o erro aqui é a decisão —
      // o usuário fica com algo colável, e o toast de `"link"` conta o que aconteceu.
    }
  }

  // Fallback único. Se **isto** falhar, o erro sobe: não há mais nada a oferecer, e é o único caso
  // em que a tela mostra toast destrutivo.
  await clipboard.writeText(asset.url);
  return "link";
}
