import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CanvasBlock } from "@/components/markdown/CanvasBlock";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { fetchNote } from "@/api/notes/notes";
import type { Note } from "@/types/notes";

/**
 * Bloco ` ```orbyva-canvas ` (feature 058): um desenho embutido numa nota markdown, por referência.
 *
 * O `exportToSvg` do Excalidraw é trocado por um duplo — a lib tem 2,7 MB e desenha medindo a tela.
 * O que este arquivo prova é o contrato do bloco: o id do fence vira busca da nota, o SVG devolvido
 * entra na página **como nó, já limpo**, e cada jeito de a referência estar errada vira uma caixa
 * legível em vez de derrubar a nota.
 */

const { excalidrawMock } = vi.hoisted(() => ({
  excalidrawMock: { exportToSvg: vi.fn() },
}));
vi.mock("@excalidraw/excalidraw", () => excalidrawMock);

vi.mock("@/api/notes/notes", () => ({ fetchNote: vi.fn() }));

function svgWith(inner: string): SVGSVGElement {
  const host = document.createElement("div");
  host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  return host.firstElementChild as SVGSVGElement;
}

function canvasNote(over: Partial<Note> = {}): Note {
  return {
    id: "c1",
    title: "Arquitetura",
    content: "",
    project_id: null,
    kind: "canvas",
    canvas_data: { elements: [{ id: "r1", type: "rectangle" }] },
    ...over,
  };
}

function renderBlock(code: string) {
  return render(
    <MemoryRouter>
      <CanvasBlock code={code} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  excalidrawMock.exportToSvg.mockResolvedValue(
    svgWith('<rect width="10" height="10" />')
  );
  vi.mocked(fetchNote).mockResolvedValue(canvasNote());
});

describe("CanvasBlock", () => {
  it("busca a nota pelo id do fence e põe o desenho na página", async () => {
    renderBlock("c1\n");

    expect(
      screen.getByRole("status", { name: "Carregando o canvas" })
    ).toBeInTheDocument();

    const host = await screen.findByTestId("canvas-drawing");
    expect(fetchNote).toHaveBeenCalledWith("c1");
    expect(host.querySelector("svg")).not.toBeNull();
    // O que foi desenhado é a cena da nota, não o fence.
    expect(excalidrawMock.exportToSvg).toHaveBeenCalledWith(
      expect.objectContaining({ elements: [{ id: "r1", type: "rectangle" }] })
    );
  });

  it("o SVG entra como nó, não como HTML cru — e já sem script nem handler", async () => {
    excalidrawMock.exportToSvg.mockResolvedValue(
      svgWith(
        '<rect onclick="alert(1)" /><script>alert(2)</script>' +
          '<foreignObject><b>html</b></foreignObject><a href="javascript:alert(3)">x</a>'
      )
    );
    renderBlock("c1");

    const host = await screen.findByTestId("canvas-drawing");
    const svg = host.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.querySelector("script")).toBeNull();
    expect(svg?.querySelector("foreignObject")).toBeNull();
    expect(svg?.querySelector("rect")?.getAttribute("onclick")).toBeNull();
    expect(svg?.querySelector("a")?.getAttribute("href")).toBeNull();
    // O desenho em si sobreviveu à limpeza.
    expect(svg?.querySelector("rect")).not.toBeNull();
  });

  it("leva para a página do canvas", async () => {
    renderBlock("c1");
    const link = await screen.findByRole("link", { name: /Abrir canvas: Arquitetura/ });
    expect(link).toHaveAttribute("href", "/notes/c1");
  });

  it("canvas em branco não chama o Excalidraw à toa", async () => {
    vi.mocked(fetchNote).mockResolvedValue(
      canvasNote({ canvas_data: { elements: [] } })
    );
    renderBlock("c1");

    expect(
      await screen.findByText("Este canvas ainda está em branco.")
    ).toBeInTheDocument();
    expect(excalidrawMock.exportToSvg).not.toHaveBeenCalled();
    // O link continua lá: é por ele que se abre o canvas para desenhar.
    expect(screen.getByRole("link")).toHaveAttribute("href", "/notes/c1");
  });

  it("id que não existe (ou é de outra conta, escondido pela RLS) vira caixa de erro", async () => {
    vi.mocked(fetchNote).mockResolvedValue(null);
    renderBlock("sumiu");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Canvas não encontrado");
    expect(excalidrawMock.exportToSvg).not.toHaveBeenCalled();
  });

  it("apontar para uma nota de texto avisa em vez de desenhar", async () => {
    vi.mocked(fetchNote).mockResolvedValue(
      canvasNote({ kind: "markdown", title: "Pauta", canvas_data: null })
    );
    renderBlock("c1");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "“Pauta” é uma nota de texto, não um canvas."
    );
  });

  it("bloco vazio nem vai ao banco", async () => {
    renderBlock("   \n  ");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Bloco de canvas sem id"
    );
    expect(fetchNote).not.toHaveBeenCalled();
  });

  it("falha ao desenhar não derruba o resto da nota", async () => {
    excalidrawMock.exportToSvg.mockRejectedValue(new Error("cena corrompida"));
    render(
      <MemoryRouter>
        <MarkdownPreview content={"# Pauta\n\n```orbyva-canvas\nc1\n```\n\ntexto depois"} />
      </MemoryRouter>
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("cena corrompida");
    expect(screen.getByRole("heading", { name: "Pauta" })).toBeInTheDocument();
    expect(screen.getByText("texto depois")).toBeInTheDocument();
  });

  it("o fence de uma nota chega ao renderer pelo registry, com o id do bloco", async () => {
    render(
      <MemoryRouter>
        <MarkdownPreview content={"```orbyva-canvas\nc1\n```"} />
      </MemoryRouter>
    );

    await waitFor(() => expect(fetchNote).toHaveBeenCalledWith("c1"));
    expect(await screen.findByTestId("canvas-drawing")).toBeInTheDocument();
    // Bloco com renderer sai fora do `<pre>` (desembrulhado pelo MarkdownPreview, feature 057).
    expect(document.querySelector("pre")).toBeNull();
  });
});
