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
 * A tipografia mudou de arquivo (feature 067) e depois ganhou a folha `.markdown-body` (069).
 * Dois contratos precisam ficar afirmados: (1) `MARKDOWN_PREVIEW_CLASS` continua saindo de
 * `MarkdownPreview.tsx` e carrega a classe da folha; (2) as regras Tailwind do módulo legado
 * continuam aplicadas no DOM (e exportadas pelo módulo), senão blockquote/hr/h3… perdem estilo
 * onde a folha CSS ainda não cobre.
 */
describe("previewTypography", () => {
  it("`MARKDOWN_PREVIEW_CLASS` continua exportado do `MarkdownPreview` e carrega a folha", () => {
    expect(MARKDOWN_PREVIEW_CLASS).toBe("markdown-body");
    expect(MARKDOWN_PREVIEW_CLASS).toContain("markdown-body");
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
    // As regras moram no módulo `previewTypography` e são aplicadas no DOM pelo preview.
    expect(FROM_MODULE).toContain(rule);
    const { container } = render(<MarkdownPreview content="oi" />);
    const root = container.querySelector(`.${MARKDOWN_PREVIEW_CLASS}`);
    expect(root?.className).toContain(rule);
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
