import { describe, expect, it } from "vitest";
import {
  MERMAID_SNIPPET,
  appendMermaidSnippet,
} from "@/domain/notes/mermaidSnippet";
import { parseBlockLanguage } from "@/domain/notes/blockLanguage";

describe("appendMermaidSnippet", () => {
  it("nota vazia recebe só o esqueleto", () => {
    expect(appendMermaidSnippet("")).toBe(`${MERMAID_SNIPPET}\n`);
    expect(appendMermaidSnippet("   \n\n")).toBe(`${MERMAID_SNIPPET}\n`);
  });

  it("separa do texto anterior por uma linha em branco", () => {
    expect(appendMermaidSnippet("# Fluxo")).toBe(
      `# Fluxo\n\n${MERMAID_SNIPPET}\n`
    );
  });

  it("não empilha linhas em branco quando o texto já termina em branco", () => {
    expect(appendMermaidSnippet("# Fluxo\n\n\n")).toBe(
      `# Fluxo\n\n${MERMAID_SNIPPET}\n`
    );
  });

  it("inserir duas vezes deixa dois blocos, cada um fechado", () => {
    const twice = appendMermaidSnippet(appendMermaidSnippet(""));

    expect(twice.match(/```mermaid/g)).toHaveLength(2);
    expect(twice.match(/```/g)).toHaveLength(4);
  });

  it("o esqueleto é um fence que o registry reconhece como mermaid", () => {
    const [fence] = MERMAID_SNIPPET.split("\n");
    // É a mesma leitura que o `MarkdownPreview` faz da className `language-<lang>`.
    expect(parseBlockLanguage(`language-${fence.replace("```", "")}`)).toBe(
      "mermaid"
    );
  });

  it("o esqueleto traz um grafo desenhável, não uma cerca vazia", () => {
    expect(MERMAID_SNIPPET).toContain("graph TD");
    expect(MERMAID_SNIPPET).toContain("-->");
  });
});
