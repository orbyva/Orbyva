import { describe, expect, it } from "vitest";
import { MERMAID_SNIPPET } from "@/domain/notes/mermaidSnippet";
import { parseBlockLanguage } from "@/domain/notes/blockLanguage";

/**
 * O `appendMermaidSnippet` (anexava o esqueleto no **fim** do arquivo) saiu na 068: o diagrama
 * passou a ser um item do menu `/`, inserido na posição do cursor. O que sobrou aqui é o esqueleto
 * em si, que continua sendo o que o menu insere — ver `slashMenu.test.ts` para a inserção.
 */
describe("MERMAID_SNIPPET", () => {
  it("é um fence que o registry reconhece como mermaid", () => {
    const [fence] = MERMAID_SNIPPET.split("\n");
    // É a mesma leitura que o `MarkdownPreview` faz da className `language-<lang>`.
    expect(parseBlockLanguage(`language-${fence.replace("```", "")}`)).toBe(
      "mermaid"
    );
  });

  it("traz um grafo desenhável, não uma cerca vazia", () => {
    expect(MERMAID_SNIPPET).toContain("graph TD");
    expect(MERMAID_SNIPPET).toContain("-->");
  });

  it("abre e fecha a cerca", () => {
    expect(MERMAID_SNIPPET.match(/```/g)).toHaveLength(2);
  });
});
