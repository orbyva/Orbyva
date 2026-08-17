import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MermaidBlock } from "@/components/markdown/MermaidBlock";
import { MarkdownPreview } from "@/components/MarkdownPreview";

/**
 * O mermaid é trocado por um duplo: ele desenha medindo texto no navegador (`getBBox`,
 * `getComputedTextLength`), coisa que o jsdom não implementa. O que este arquivo prova é o
 * contrato do bloco — import dinâmico, configuração de segurança, tema, estados de carregando/erro
 * e a limpeza do SVG —, não o desenho do mermaid, que é responsabilidade da biblioteca.
 */
const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));

beforeEach(() => {
  mermaidMock.initialize.mockReset();
  mermaidMock.parse.mockReset().mockResolvedValue(true);
  mermaidMock.render
    .mockReset()
    .mockImplementation(async (id: string) => ({
      svg: `<svg id="${id}"><g class="node"><text>A</text></g></svg>`,
    }));
});

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

describe("MermaidBlock", () => {
  it("mostra o esqueleto antes do diagrama ficar pronto", async () => {
    let resolveRender: (value: { svg: string }) => void = () => {};
    mermaidMock.render.mockImplementation(
      () => new Promise((resolve) => (resolveRender = resolve))
    );

    render(<MermaidBlock code="graph TD; A-->B;" />);
    expect(screen.getByRole("status", { name: "Desenhando diagrama" })).toBeInTheDocument();

    // O import dinâmico do mermaid é assíncrono: o esqueleto cobre a espera inteira, do download
    // do chunk até o desenho voltar.
    await waitFor(() => expect(mermaidMock.render).toHaveBeenCalled());
    expect(screen.getByRole("status", { name: "Desenhando diagrama" })).toBeInTheDocument();

    await act(async () => {
      resolveRender({ svg: "<svg><text>A</text></svg>" });
    });
    const diagram = await screen.findByTestId("mermaid-diagram");
    expect(diagram.querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("status", { name: "Desenhando diagrama" })).toBeNull();
  });

  it("desenha o SVG do código do bloco", async () => {
    render(<MermaidBlock code="graph TD; A-->B;" />);

    const diagram = await screen.findByTestId("mermaid-diagram");
    expect(diagram.querySelector("svg")).not.toBeNull();
    expect(diagram).toHaveTextContent("A");
    expect(mermaidMock.parse).toHaveBeenCalledWith("graph TD; A-->B;");
    expect(mermaidMock.render).toHaveBeenCalledWith(
      expect.stringContaining("orbyva-mermaid-"),
      "graph TD; A-->B;"
    );
  });

  it("inicializa com securityLevel strict (a barreira de XSS da 057)", async () => {
    render(<MermaidBlock code="graph TD; A-->B;" />);
    await screen.findByTestId("mermaid-diagram");

    expect(mermaidMock.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: "strict", startOnLoad: false })
    );
  });

  it("sintaxe inválida vira caixa de erro legível, não tela quebrada", async () => {
    mermaidMock.parse.mockRejectedValue(
      new Error("Parse error on line 1: expecting 'SPACE'")
    );

    render(<MermaidBlock code="grafo TD; A-->B;" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Diagrama inválido");
    expect(alert).toHaveTextContent("Parse error on line 1");
    // Sintaxe inválida nem chega a desenhar: `parse` é o portão.
    expect(mermaidMock.render).not.toHaveBeenCalled();
  });

  it("o SVG entra na página já limpo de script e de handler", async () => {
    mermaidMock.render.mockResolvedValue({
      svg: '<svg><script>window.__xss = 1</script><rect onload="alert(1)"></rect><text>ok</text></svg>',
    });

    render(<MermaidBlock code="graph TD; A-->B;" />);

    const diagram = await screen.findByTestId("mermaid-diagram");
    expect(diagram.querySelector("script")).toBeNull();
    expect(diagram.querySelector("rect")?.getAttribute("onload")).toBeNull();
    expect(diagram).toHaveTextContent("ok");
  });

  it("usa o tema claro ou escuro conforme a classe do <html>, e redesenha ao alternar", async () => {
    render(<MermaidBlock code="graph TD; A-->B;" />);
    await screen.findByTestId("mermaid-diagram");
    expect(mermaidMock.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: "default" })
    );

    await act(async () => {
      document.documentElement.classList.add("dark");
    });

    await waitFor(() =>
      expect(mermaidMock.initialize).toHaveBeenLastCalledWith(
        expect.objectContaining({ theme: "dark" })
      )
    );
    expect(mermaidMock.render).toHaveBeenCalledTimes(2);
  });
});

describe("MarkdownPreview + ```mermaid", () => {
  it("o fence mermaid de uma nota vira diagrama, e o resto da nota continua renderizando", async () => {
    render(
      <MarkdownPreview
        content={"# Fluxo\n\n```mermaid\ngraph TD;\n  A-->B;\n```\n\nfim"}
      />
    );

    await screen.findByTestId("mermaid-diagram");
    expect(mermaidMock.render).toHaveBeenCalledWith(
      expect.any(String),
      "graph TD;\n  A-->B;"
    );
    expect(screen.getByRole("heading", { name: "Fluxo" })).toBeInTheDocument();
    expect(screen.getByText("fim")).toBeInTheDocument();
  });

  it("diagrama quebrado não derruba o resto da nota", async () => {
    mermaidMock.parse.mockRejectedValue(new Error("Parse error"));

    render(
      <MarkdownPreview content={"# Fluxo\n\n```mermaid\nnada disso\n```\n\nfim"} />
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Diagrama inválido");
    expect(screen.getByRole("heading", { name: "Fluxo" })).toBeInTheDocument();
    expect(screen.getByText("fim")).toBeInTheDocument();
  });
});
