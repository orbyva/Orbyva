import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  HEADING_ANCHOR_LABEL,
  MarkdownPreview,
} from "@/components/MarkdownPreview";

/**
 * Título com `id` (`rehype-slug`) e âncora de hover (feature 067). O `id` é o que torna possível
 * linkar um trecho de nota e é a base do sumário da 068 — por isso o teste afirma o slug em si, e
 * não só "renderizou um h2".
 */
describe("MarkdownPreview — títulos com id (rehype-slug)", () => {
  it("dá id de slug a todo nível de título", () => {
    const { container } = render(
      <MarkdownPreview content={"# Etapas da obra\n\n## Orçamento\n\n### Detalhe"} />
    );

    expect(container.querySelector("h1")).toHaveAttribute("id", "etapas-da-obra");
    expect(container.querySelector("h2")).toHaveAttribute("id", "orçamento");
    expect(container.querySelector("h3")).toHaveAttribute("id", "detalhe");
  });

  it("dois títulos iguais geram ids distintos", () => {
    const { container } = render(
      <MarkdownPreview content={"## Etapas\n\ntexto\n\n## Etapas\n\noutro"} />
    );

    const ids = [...container.querySelectorAll("h2")].map((h) => h.id);
    expect(ids).toEqual(["etapas", "etapas-1"]);
  });

  it("cada título ganha uma âncora apontando para o próprio id", () => {
    render(<MarkdownPreview content={"## Orçamento\n\n### Materiais"} />);

    const anchors = screen.getAllByRole("link", { name: HEADING_ANCHOR_LABEL });
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual([
      "#orçamento",
      "#materiais",
    ]);
    // A âncora nasce dentro do próprio título, senão o `group-hover` não a alcançaria.
    expect(anchors[0].closest("h2")).toHaveAttribute("id", "orçamento");
  });

  it("a âncora fica invisível até o hover, mas continua no DOM (teclado e leitor de tela)", () => {
    render(<MarkdownPreview content="# Título" />);

    const anchor = screen.getByRole("link", { name: HEADING_ANCHOR_LABEL });
    expect(anchor).toHaveClass("opacity-0");
    expect(anchor).toHaveClass("group-hover:opacity-100");
    expect(anchor.closest("h1")).toHaveClass("group");
  });

  it("o texto do título continua sendo o texto do título, com a formatação de dentro", () => {
    render(<MarkdownPreview content="## Etapas **críticas**" />);

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("Etapas críticas#");
    expect(screen.getByText("críticas").tagName).toBe("STRONG");
  });

  it("quem passa `components` continua conseguindo sobrescrever o título", () => {
    render(
      <MarkdownPreview
        content="# Meu"
        components={{ h1: ({ children }) => <h1 data-testid="custom">{children}</h1> }}
      />
    );

    expect(screen.getByTestId("custom")).toHaveTextContent("Meu");
    expect(screen.queryByRole("link", { name: HEADING_ANCHOR_LABEL })).toBeNull();
  });
});
