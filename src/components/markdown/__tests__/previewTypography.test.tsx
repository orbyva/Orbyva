import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  MARKDOWN_PREVIEW_CLASS,
  MarkdownPreview,
} from "@/components/MarkdownPreview";
import {
  MARKDOWN_PREVIEW_CLASS as FROM_MODULE,
  MARKDOWN_TABLE_WRAPPER_CLASS,
} from "@/components/markdown/previewTypography";

/**
 * A tipografia mudou de arquivo (feature 067). Dois riscos precisam ficar afirmados: (1) o nome
 * `MARKDOWN_PREVIEW_CLASS` continua saindo de `MarkdownPreview.tsx`, senão quebra consumidor; (2) a
 * tabela larga passa a rolar dentro do próprio container, em vez de esticar a página.
 */
describe("previewTypography", () => {
  it("`MARKDOWN_PREVIEW_CLASS` continua exportado do `MarkdownPreview` e é o mesmo valor", () => {
    expect(MARKDOWN_PREVIEW_CLASS).toBe(FROM_MODULE);
    expect(MARKDOWN_PREVIEW_CLASS).toContain("text-sm");
  });

  it.each([
    ["blockquote", "[&_blockquote]:border-l-2"],
    ["hr", "[&_hr]:border-t"],
    ["h3", "[&_h3]:font-semibold"],
    ["h4", "[&_h4]:uppercase"],
    ["h5", "[&_h5]:text-muted-foreground"],
    ["h6", "[&_h6]:text-muted-foreground"],
    ["pre", "[&_pre]:overflow-x-auto"],
    ["lista aninhada", "[&_ul_ul]:list-[circle]"],
    ["nota de rodapé", "[&_.footnotes]:border-t"],
  ])("cobre o que não tinha estilo nenhum: %s", (_label, rule) => {
    expect(MARKDOWN_PREVIEW_CLASS).toContain(rule);
  });

  it("a tabela sai dentro de um wrapper rolável, e não solta no fluxo", () => {
    const { container } = render(
      <MarkdownPreview
        content={"| a | b |\n| - | - |\n| 1 | 2 |"}
      />
    );

    const table = screen.getByRole("table");
    const wrapper = table.parentElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveClass(...MARKDOWN_TABLE_WRAPPER_CLASS.split(" "));
    // A rolagem tem que ficar no wrapper: é ele, e não o `<table>`, que segura a largura.
    expect(MARKDOWN_TABLE_WRAPPER_CLASS).toContain("overflow-x-auto");
    expect(container.querySelectorAll("table")).toHaveLength(1);
  });

  it("o conteúdo da tabela continua intacto dentro do wrapper", () => {
    render(<MarkdownPreview content={"| a | b |\n| - | - |\n| 1 | 2 |"} />);

    expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "a",
      "b",
    ]);
    expect(screen.getAllByRole("cell").map((c) => c.textContent)).toEqual(["1", "2"]);
  });

  it("nota de rodapé do GFM renderiza referência e seção", () => {
    const { container } = render(
      <MarkdownPreview content={"texto[^1]\n\n[^1]: a explicação"} />
    );

    expect(container.querySelector("[data-footnote-ref]")).not.toBeNull();
    expect(container.querySelector(".footnotes")).not.toBeNull();
    expect(container.textContent).toContain("a explicação");
  });

  it("citação e régua continuam sendo os elementos certos", () => {
    const { container } = render(
      <MarkdownPreview content={"> citação\n\n---\n\ntexto"} />
    );

    expect(container.querySelector("blockquote")).toHaveTextContent("citação");
    expect(container.querySelector("hr")).not.toBeNull();
  });
});
