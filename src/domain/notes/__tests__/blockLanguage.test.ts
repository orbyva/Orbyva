import { describe, expect, it } from "vitest";
import { parseBlockLanguage } from "@/domain/notes/blockLanguage";

describe("parseBlockLanguage", () => {
  it("extrai a linguagem de `language-<lang>`", () => {
    expect(parseBlockLanguage("language-mermaid")).toBe("mermaid");
  });

  it("normaliza para minúsculas", () => {
    expect(parseBlockLanguage("language-Mermaid")).toBe("mermaid");
    expect(parseBlockLanguage("language-TS")).toBe("ts");
  });

  it("devolve null sem className", () => {
    expect(parseBlockLanguage(undefined)).toBeNull();
    expect(parseBlockLanguage(null)).toBeNull();
    expect(parseBlockLanguage("")).toBeNull();
  });

  it("devolve null quando não há classe de linguagem", () => {
    // Código inline chega sem `language-*`: é o caso que mantém o fallback de bloco normal.
    expect(parseBlockLanguage("inline-code")).toBeNull();
    expect(parseBlockLanguage("hljs some-other-class")).toBeNull();
  });

  it("acha a linguagem no meio de classes extras", () => {
    expect(parseBlockLanguage("hljs language-mermaid extra")).toBe("mermaid");
    expect(parseBlockLanguage("  language-sql  ")).toBe("sql");
  });

  it("devolve null quando o prefixo vem sem linguagem", () => {
    expect(parseBlockLanguage("language-")).toBeNull();
  });
});
