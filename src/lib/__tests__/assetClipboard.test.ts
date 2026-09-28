import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyAssetToClipboard, transcodeToPngBlob } from "@/lib/assetClipboard";

/**
 * Feature 133 — a execução do "copiar asset", com as dependências falsas.
 *
 * Roda em ambiente **node** (`.test.ts`, ver `environmentMatchGlobs`): não há jsdom aqui, e é de
 * propósito — jsdom não tem `ClipboardItem`, não tem `clipboard.write` e não desenha canvas. O que
 * este arquivo prova é o contrato que o navegador executaria: **qual tipo MIME** vai para o
 * clipboard em cada extensão, que JPEG/WebP passam pelo transcodificador antes, e que **toda**
 * falha vira link em vez de sumir. Sem isso a única verificação seria abrir o Chrome, que a skill
 * `next` proíbe.
 */

const PNG = { name: "Livro", url: "https://cdn.example.com/library/livro.png" };
const SVG = { name: "Foguete", url: "https://cdn.example.com/library/foguete.svg" };
const JPEG = { name: "Foto", url: "https://cdn.example.com/library/foto.jpg" };
const WEBP = { name: "Capa", url: "https://cdn.example.com/library/capa.webp" };
const SEM_EXTENSAO = { name: "Solto", url: "https://cdn.example.com/library/solto" };

const MARKUP = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>';

/** O que um `ClipboardItem` carrega, do ponto de vista de quem escreve. O construtor real recebe
 * um mapa de MIME → blob (ou **promessa** de blob), e é exatamente isso que guardamos. */
class FakeClipboardItem {
  constructor(readonly items: Record<string, Blob | string | PromiseLike<Blob | string>>) {}
}

const clipboardItem = FakeClipboardItem as unknown as typeof ClipboardItem;

/** Cada entrada é uma escrita de imagem já resolvida: `[mime, blob]`. */
function imageClipboard() {
  const written: Array<[string, Blob | string]> = [];
  const write = vi.fn(async (items: ClipboardItem[]) => {
    for (const item of items as unknown as FakeClipboardItem[]) {
      for (const [mime, value] of Object.entries(item.items)) {
        written.push([mime, await value]);
      }
    }
  });
  const writeText = vi.fn(async () => {});
  return { clipboard: { write, writeText }, write, writeText, written };
}

function okResponse(body: Blob | string) {
  return {
    ok: true,
    status: 200,
    blob: async () => (body instanceof Blob ? body : new Blob([body])),
    text: async () => (body instanceof Blob ? await body.text() : body),
  } as unknown as Response;
}

describe("copyAssetToClipboard", () => {
  it("PNG vai como imagem: um ClipboardItem com a chave image/png e o blob buscado", async () => {
    const blob = new Blob(["png-bytes"], { type: "image/png" });
    const fetchFn = vi.fn(async () => okResponse(blob));
    const { clipboard, write, writeText, written } = imageClipboard();

    const result = await copyAssetToClipboard(PNG, { fetchFn, clipboard, clipboardItem });

    expect(result).toBe("image");
    expect(fetchFn).toHaveBeenCalledWith(PNG.url);
    expect(write).toHaveBeenCalledTimes(1);
    expect(written).toEqual([["image/png", blob]]);
    // A URL **não** foi escrita como texto: o que está no clipboard é a imagem.
    expect(writeText).not.toHaveBeenCalled();
  });

  it("monta o ClipboardItem sem esperar o blob — é o gesto do usuário que o Safari exige", async () => {
    // O `fetch` nunca resolve dentro deste teste: se houvesse um `await` antes de construir o
    // `ClipboardItem`, `write` ainda não teria sido chamado.
    const fetchFn = vi.fn(() => new Promise<Response>(() => {}));
    const { clipboard, write } = imageClipboard();

    void copyAssetToClipboard(PNG, { fetchFn, clipboard, clipboardItem });

    // Nenhum `await` entre a chamada e esta linha, de propósito.
    expect(write).toHaveBeenCalledTimes(1);
    const item = write.mock.calls[0][0][0] as unknown as FakeClipboardItem;
    expect(Object.keys(item.items)).toEqual(["image/png"]);
    expect(item.items["image/png"]).toBeInstanceOf(Promise);
  });

  it("SVG vai como texto: o markup buscado, e não a URL", async () => {
    const fetchFn = vi.fn(async () => okResponse(MARKUP));
    const { clipboard, write, writeText } = imageClipboard();

    const result = await copyAssetToClipboard(SVG, { fetchFn, clipboard, clipboardItem });

    expect(result).toBe("svg-text");
    expect(writeText).toHaveBeenCalledWith(MARKUP);
    expect(writeText).not.toHaveBeenCalledWith(SVG.url);
    expect(write).not.toHaveBeenCalled();
  });

  it("JPEG passa pelo transcodificador antes de virar image/png", async () => {
    const png = new Blob(["convertido"], { type: "image/png" });
    const toPngBlob = vi.fn(async () => png);
    const fetchFn = vi.fn(async () => okResponse(new Blob(["jpeg-bytes"])));
    const { clipboard, written } = imageClipboard();

    const result = await copyAssetToClipboard(JPEG, {
      fetchFn,
      clipboard,
      clipboardItem,
      toPngBlob,
    });

    expect(result).toBe("image");
    expect(toPngBlob).toHaveBeenCalledWith(JPEG.url);
    // O blob cru do JPEG nunca chega ao clipboard: seria `NotAllowedError` no navegador.
    expect(fetchFn).not.toHaveBeenCalled();
    expect(written).toEqual([["image/png", png]]);
  });

  it("WebP segue o mesmo caminho do JPEG", async () => {
    const png = new Blob(["convertido"], { type: "image/png" });
    const toPngBlob = vi.fn(async () => png);
    const { clipboard, written } = imageClipboard();

    const result = await copyAssetToClipboard(WEBP, { clipboard, clipboardItem, toPngBlob });

    expect(result).toBe("image");
    expect(toPngBlob).toHaveBeenCalledWith(WEBP.url);
    expect(written).toEqual([["image/png", png]]);
  });

  it("sem ClipboardItem no ambiente escreve a URL e devolve 'link'", async () => {
    const fetchFn = vi.fn(async () => okResponse(new Blob(["png"])));
    const { clipboard, write, writeText } = imageClipboard();

    const result = await copyAssetToClipboard(PNG, {
      fetchFn,
      clipboard,
      clipboardItem: null,
    });

    expect(result).toBe("link");
    expect(writeText).toHaveBeenCalledWith(PNG.url);
    expect(write).not.toHaveBeenCalled();
    // Nem chega a buscar o arquivo: não há para onde mandar o blob.
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("write rejeitado (permissão negada) escreve a URL e devolve 'link'", async () => {
    const fetchFn = vi.fn(async () => okResponse(new Blob(["png"])));
    const writeText = vi.fn(async () => {});
    const write = vi.fn(async () => {
      throw new Error("NotAllowedError: Write permission denied.");
    });

    const result = await copyAssetToClipboard(PNG, {
      fetchFn,
      clipboard: { write, writeText },
      clipboardItem,
    });

    expect(result).toBe("link");
    expect(writeText).toHaveBeenCalledWith(PNG.url);
  });

  it("fetch falhando (offline) devolve 'link' em vez de sumir", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { clipboard, writeText } = imageClipboard();

    const result = await copyAssetToClipboard(PNG, { fetchFn, clipboard, clipboardItem });

    expect(result).toBe("link");
    expect(writeText).toHaveBeenCalledWith(PNG.url);
  });

  it("arquivo apagado do bucket (404) também cai no link", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 404 }) as Response);
    const { clipboard, writeText } = imageClipboard();

    expect(await copyAssetToClipboard(PNG, { fetchFn, clipboard, clipboardItem })).toBe("link");
    expect(writeText).toHaveBeenCalledWith(PNG.url);
  });

  it("SVG que volta vazio cai no link em vez de esvaziar o clipboard", async () => {
    const fetchFn = vi.fn(async () => okResponse("   "));
    const { clipboard, writeText } = imageClipboard();

    expect(await copyAssetToClipboard(SVG, { fetchFn, clipboard, clipboardItem })).toBe("link");
    expect(writeText).toHaveBeenLastCalledWith(SVG.url);
  });

  it("URL sem extensão vai direto para o link, sem buscar nada", async () => {
    const fetchFn = vi.fn(async () => okResponse(new Blob(["x"])));
    const { clipboard, write, writeText } = imageClipboard();

    const result = await copyAssetToClipboard(SEM_EXTENSAO, { fetchFn, clipboard, clipboardItem });

    expect(result).toBe("link");
    expect(writeText).toHaveBeenCalledWith(SEM_EXTENSAO.url);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("se o próprio fallback falhar, o erro sobe para quem chamou", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("offline");
    });
    const writeText = vi.fn(async () => {
      throw new Error("Document is not focused");
    });
    const { clipboard } = imageClipboard();

    await expect(
      copyAssetToClipboard(PNG, {
        fetchFn,
        clipboard: { write: clipboard.write, writeText },
        clipboardItem,
      })
    ).rejects.toThrow("Document is not focused");
    expect(writeText).toHaveBeenCalledWith(PNG.url);
  });

  it("sem clipboard nenhum (contexto inseguro) o erro sobe, sem prometer cópia", async () => {
    await expect(copyAssetToClipboard(PNG, { clipboard: null })).rejects.toThrow(
      /Clipboard indisponível/
    );
  });
});

/**
 * O transcodificador, com `Image` e `<canvas>` falsos. É aqui que mora a regressão mais cara do
 * desenho: perder o `crossOrigin = "anonymous"` só aparece como `SecurityError` no navegador real,
 * porque o canvas fica "tainted" e `toBlob` lança.
 */
describe("transcodeToPngBlob", () => {
  const png = new Blob(["png"], { type: "image/png" });
  let created: FakeImg[] = [];
  let toBlob: ReturnType<typeof vi.fn>;
  let canvas: { width: number; height: number; getContext: () => unknown; toBlob: unknown };
  let drawn: unknown[][] = [];
  let failLoad = false;
  let blobFromCanvas: Blob | null = png;
  let context: unknown = null;

  class FakeImg {
    crossOrigin = "";
    naturalWidth = 24;
    naturalHeight = 16;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private value = "";
    constructor() {
      created.push(this);
    }
    get src() {
      return this.value;
    }
    set src(next: string) {
      this.value = next;
      queueMicrotask(() => (failLoad ? this.onerror?.() : this.onload?.()));
    }
  }

  beforeEach(() => {
    created = [];
    drawn = [];
    failLoad = false;
    blobFromCanvas = png;
    context = { drawImage: (...args: unknown[]) => drawn.push(args) };
    toBlob = vi.fn((cb: (blob: Blob | null) => void) => cb(blobFromCanvas));
    canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob: (cb: (blob: Blob | null) => void, type: string) => toBlob(cb, type),
    };
    vi.stubGlobal("Image", FakeImg);
    vi.stubGlobal("document", {
      createElement: (tag: string) => (tag === "canvas" ? canvas : {}),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pede a imagem com crossOrigin anônimo e devolve o PNG do canvas", async () => {
    const result = await transcodeToPngBlob(JPEG.url);

    expect(result).toBe(png);
    // Sem isto o canvas fica "tainted" e `toBlob` lança SecurityError no navegador real.
    expect(created[0].crossOrigin).toBe("anonymous");
    expect(created[0].src).toBe(JPEG.url);
    expect(canvas.width).toBe(24);
    expect(canvas.height).toBe(16);
    expect(drawn).toEqual([[created[0], 0, 0]]);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
  });

  it("imagem que não carrega rejeita, e quem chama cai no link", async () => {
    failLoad = true;
    await expect(transcodeToPngBlob(JPEG.url)).rejects.toThrow(/carregar a imagem/);
  });

  it("canvas sem contexto 2D rejeita em vez de escrever lixo", async () => {
    context = null;
    await expect(transcodeToPngBlob(JPEG.url)).rejects.toThrow(/preparar a imagem/);
  });

  it("toBlob sem resultado rejeita", async () => {
    blobFromCanvas = null;
    await expect(transcodeToPngBlob(JPEG.url)).rejects.toThrow(/converter a imagem para PNG/);
  });
});
