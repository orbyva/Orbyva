import { describe, expect, it } from "vitest";
import {
  ASSET_COPY_MESSAGE,
  assetClipboardKind,
  assetCopyMessage,
} from "@/domain/notes/assetClipboard";

/**
 * Feature 133 — a decisão de formato, sozinha. O que este arquivo trava é a tabela de extensões:
 * errar aqui manda metade da biblioteca para o caminho errado do clipboard, e o sintoma no
 * navegador seria `NotAllowedError: Type image/jpeg not supported on write` (ou um toast de
 * sucesso com clipboard vazio), que nenhum `tsc` pega.
 */
describe("assetClipboardKind", () => {
  it("PNG vai direto como imagem", () => {
    expect(assetClipboardKind("https://cdn.example.com/library/livro.png")).toBe("png");
  });

  it("ignora a caixa da extensão — arquivo enviado como .PNG é o mesmo caminho", () => {
    expect(assetClipboardKind("https://cdn.example.com/library/LIVRO.PNG")).toBe("png");
    expect(assetClipboardKind("https://cdn.example.com/library/Foguete.SVG")).toBe("svg");
  });

  it("SVG tem caminho próprio: vai como texto, não como imagem", () => {
    expect(assetClipboardKind("https://cdn.example.com/library/foguete.svg")).toBe("svg");
  });

  it("JPEG e WebP viram 'raster': precisam de transcodificação antes do clipboard", () => {
    expect(assetClipboardKind("https://cdn.example.com/library/foto.jpg")).toBe("raster");
    expect(assetClipboardKind("https://cdn.example.com/library/foto.jpeg")).toBe("raster");
    expect(assetClipboardKind("https://cdn.example.com/library/foto.webp")).toBe("raster");
  });

  it("query string não entra na extensão — URL assinada continua sendo PNG", () => {
    expect(assetClipboardKind("https://cdn.example.com/library/livro.png?token=abc123")).toBe(
      "png"
    );
    expect(assetClipboardKind("https://cdn.example.com/library/foto.WEBP?v=2&x=1")).toBe("raster");
    expect(assetClipboardKind("https://cdn.example.com/library/foguete.svg#fragmento")).toBe("svg");
  });

  it("URL sem extensão é 'unknown' — o caminho que cai no fallback de link", () => {
    expect(assetClipboardKind("https://cdn.example.com/library/foguete")).toBe("unknown");
    expect(assetClipboardKind("https://cdn.example.com/library/foguete?download=1")).toBe(
      "unknown"
    );
    expect(assetClipboardKind("")).toBe("unknown");
  });

  it("extensão que o acervo não tem também é 'unknown' — nada de tentar escrever image/gif", () => {
    expect(assetClipboardKind("https://cdn.example.com/library/anim.gif")).toBe("unknown");
    expect(assetClipboardKind("https://cdn.example.com/library/doc.pdf")).toBe("unknown");
  });

  it("um ponto só no começo do nome não é extensão", () => {
    expect(assetClipboardKind("https://cdn.example.com/library/.png")).toBe("unknown");
  });
});

describe("assetCopyMessage", () => {
  it("cada resultado real da escrita tem a sua frase, sem cruzar", () => {
    expect(assetCopyMessage("image")).toBe(ASSET_COPY_MESSAGE.image);
    expect(assetCopyMessage("svg-text")).toBe(ASSET_COPY_MESSAGE.svgText);
    expect(assetCopyMessage("link")).toBe(ASSET_COPY_MESSAGE.link);
  });

  it("a frase do link diz que a imagem não foi copiada e que o link ficou no lugar", () => {
    const { title, description } = ASSET_COPY_MESSAGE.link;
    expect(title).toContain("Link");
    expect(description).toMatch(/não foi possível copiar a imagem/i);
    expect(description).toMatch(/link/i);
  });

  it("as frases de imagem e de SVG não prometem link, nem a de link promete imagem copiada", () => {
    expect(ASSET_COPY_MESSAGE.image.title).not.toMatch(/link/i);
    expect(ASSET_COPY_MESSAGE.svgText.title).not.toMatch(/link/i);
    expect(ASSET_COPY_MESSAGE.link.title).not.toMatch(/asset copiado/i);
  });
});
