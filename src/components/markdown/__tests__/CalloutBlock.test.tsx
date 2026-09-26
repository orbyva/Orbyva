import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import {
  CALLOUT_LABEL,
  CALLOUT_TYPES,
} from "@/components/markdown/remarkCallout";

/**
 * A ponte parser → tela: `remarkCallout.test.ts` prova que a árvore foi marcada, este prova que a
 * marca vira caixa. A skill `next` proíbe conferir isso no navegador, então é aqui que "o callout
 * aparece" fica afirmado.
 */
describe("CalloutBlock no MarkdownPreview", () => {
  it.each(CALLOUT_TYPES)("desenha a caixa do tipo %s com rótulo e corpo", (type) => {
    render(
      <MarkdownPreview content={`> [!${type.toUpperCase()}]\n> corpo do aviso`} />
    );

    const box = screen.getByRole("note");
    expect(box).toHaveAttribute("data-callout", type);
    expect(box).toHaveTextContent(CALLOUT_LABEL[type]);
    expect(box).toHaveTextContent("corpo do aviso");
    // Callout não é citação: o blockquote some do DOM, senão herdaria a borda cinza da tipografia.
    expect(box.closest("blockquote")).toBeNull();
  });

  it("o título escrito pelo usuário substitui o rótulo padrão", () => {
    render(
      <MarkdownPreview
        content={"> [!WARNING] Prazo do cartório\n> A escritura vence dia 30."}
      />
    );

    const box = screen.getByRole("note", { name: "Prazo do cartório" });
    expect(box).toHaveTextContent("Prazo do cartório");
    expect(box).not.toHaveTextContent("Atenção");
    expect(box).toHaveTextContent("A escritura vence dia 30.");
  });

  it("citação comum continua sendo `<blockquote>`, sem virar caixa", () => {
    const { container } = render(<MarkdownPreview content="> só uma citação" />);

    expect(screen.queryByRole("note")).toBeNull();
    expect(container.querySelector("blockquote")).toHaveTextContent("só uma citação");
  });

  it("tipo desconhecido continua citação, com o texto literal na tela", () => {
    const { container } = render(<MarkdownPreview content={"> [!FOO]\n> texto"} />);

    expect(screen.queryByRole("note")).toBeNull();
    expect(container.querySelector("blockquote")).toHaveTextContent("[!FOO]");
  });

  it("Markdown de dentro do callout continua sendo Markdown", () => {
    render(
      <MarkdownPreview
        content={
          "> [!IMPORTANT]\n> Antes de assinar:\n>\n> - conferir a **matrícula**\n> - conferir o IPTU"
        }
      />
    );

    const box = screen.getByRole("note");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("matrícula").tagName).toBe("STRONG");
    expect(box).toContainElement(screen.getByRole("list"));
  });

  it("callout só de título não deixa parágrafo vazio na caixa", () => {
    render(<MarkdownPreview content="> [!TIP] Atalho útil" />);

    const box = screen.getByRole("note");
    // O único `<p>` é o do título; se o parágrafo do gatilho sobrasse, haveria um vazio junto.
    expect(box.querySelectorAll("p")).toHaveLength(1);
    expect(box.textContent?.trim()).toBe("Atalho útil");
  });

  it("o título é texto, nunca markup — HTML no título não vira elemento", () => {
    render(<MarkdownPreview content={"> [!NOTE] <img src=x onerror=alert(1)>\n> corpo"} />);

    const box = screen.getByRole("note");
    expect(box.querySelector("img")).toBeNull();
    expect(box).toHaveTextContent("<img src=x onerror=alert(1)>");
  });
});
