import { describe, expect, it } from "vitest";
import {
  extractContentLinkDomain,
  isValidContentLinkUrl,
  normalizeContentLinkUrl,
  suggestContentLinkType,
} from "@/domain/contentLinks/links";

describe("normalizeContentLinkUrl", () => {
  it("mantém URL já com esquema", () => {
    expect(normalizeContentLinkUrl("https://youtube.com/watch?v=1")).toBe(
      "https://youtube.com/watch?v=1"
    );
  });

  it("acrescenta https:// quando falta esquema", () => {
    expect(normalizeContentLinkUrl("youtube.com/watch?v=1")).toBe(
      "https://youtube.com/watch?v=1"
    );
  });

  it("aceita http:// sem trocar por https://", () => {
    expect(normalizeContentLinkUrl("http://example.com")).toBe("http://example.com");
  });

  it("remove espaços nas pontas", () => {
    expect(normalizeContentLinkUrl("  example.com  ")).toBe("https://example.com");
  });
});

describe("isValidContentLinkUrl", () => {
  it("aceita URL válida sem esquema", () => {
    expect(isValidContentLinkUrl("example.com/artigo")).toBe(true);
  });

  it("rejeita string vazia", () => {
    expect(isValidContentLinkUrl("")).toBe(false);
  });

  it("rejeita texto sem domínio (sem ponto)", () => {
    expect(isValidContentLinkUrl("nao-e-url")).toBe(false);
  });
});

describe("extractContentLinkDomain", () => {
  it("extrai o domínio sem www.", () => {
    expect(extractContentLinkDomain("https://www.substack.com/p/artigo")).toBe("substack.com");
  });

  it("extrai o domínio sem www. quando já não tem www.", () => {
    expect(extractContentLinkDomain("https://youtube.com/watch?v=1")).toBe("youtube.com");
  });

  it("retorna null pra URL inválida", () => {
    expect(extractContentLinkDomain("nao-e-url")).toBeNull();
  });
});

describe("suggestContentLinkType", () => {
  it("sugere vídeo pro youtube.com", () => {
    expect(suggestContentLinkType("https://youtube.com/watch?v=1")).toBe("video");
  });

  it("sugere vídeo pro youtu.be", () => {
    expect(suggestContentLinkType("https://youtu.be/abc123")).toBe("video");
  });

  it("sugere vídeo pro vimeo.com", () => {
    expect(suggestContentLinkType("https://vimeo.com/12345")).toBe("video");
  });

  it("não sugere nada pra domínio desconhecido — fica manual", () => {
    expect(suggestContentLinkType("https://substack.com/p/artigo")).toBeNull();
  });

  it("não sugere nada pra URL inválida", () => {
    expect(suggestContentLinkType("nao-e-url")).toBeNull();
  });
});
