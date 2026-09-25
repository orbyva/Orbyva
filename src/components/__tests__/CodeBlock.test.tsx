import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MarkdownPreview } from "@/components/MarkdownPreview";

/**
 * O `lowlight` é mockado: o que interessa provar é o **contrato** do `CodeBlock` — que linguagem
 * ele manda realçar, que a árvore hast devolvida vira árvore React de verdade (e não uma string de
 * HTML), e o que aparece quando não há cor nenhuma a aplicar. A qualidade da gramática de cada
 * linguagem é problema do `highlight.js`.
 *
 * O falso realce marca **a primeira palavra** como `hljs-keyword` e deixa o resto como texto — o
 * bastante para distinguir "veio árvore" de "veio texto puro".
 */
const LINGUAGENS_CONHECIDAS = new Set(["ts", "python"]);

const highlight = vi.fn((_language: string, value: string) => {
  const [primeira, ...resto] = value.split(" ");
  return {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "span",
        properties: { className: ["hljs-keyword"] },
        children: [{ type: "text", value: primeira }],
      },
      { type: "text", value: resto.length ? ` ${resto.join(" ")}` : "" },
    ],
  };
});

let lowlightIndisponivel = false;

vi.mock("lowlight", () => ({
  get createLowlight() {
    // Simula o `import()` do chunk que não chega (offline, deploy no ar).
    if (lowlightIndisponivel) throw new Error("Failed to fetch dynamic module");
    return () => ({
      registered: (name: string) => LINGUAGENS_CONHECIDAS.has(name),
      highlight,
    });
  },
  common: {},
}));

beforeEach(() => {
  lowlightIndisponivel = false;
  highlight.mockClear();
});

describe("CodeBlock — realce", () => {
  it("pinta o fence com a linguagem declarada, em árvore React (sem innerHTML)", async () => {
    const { container } = render(
      <MarkdownPreview content={"```ts\nconst a = 1;\n```"} />
    );

    await waitFor(() => {
      expect(container.querySelector(".hljs-keyword")).not.toBeNull();
    });

    expect(highlight).toHaveBeenCalledWith("ts", "const a = 1;");
    expect(container.querySelector(".hljs-keyword")).toHaveTextContent("const");
    // O código continua inteiro: realce colore, não reescreve.
    expect(container.querySelector("pre > code")).toHaveTextContent(
      "const a = 1;"
    );
  });

  it("continua entregando <pre><code class=\"language-…\">", async () => {
    const { container } = render(
      <MarkdownPreview content={"```ts\nconst a = 1;\n```"} />
    );

    await waitFor(() => expect(highlight).toHaveBeenCalled());
    expect(container.querySelector("pre > code")).toHaveClass("language-ts");
  });

  it("mostra a linguagem no cabeçalho", async () => {
    render(<MarkdownPreview content={"```python\nprint(1)\n```"} />);

    await waitFor(() => expect(highlight).toHaveBeenCalled());
    expect(screen.getByText("python")).toBeInTheDocument();
  });

  it("linguagem desconhecida: fica sem cor, com o nome no cabeçalho e o código inteiro", async () => {
    const { container } = render(
      <MarkdownPreview content={"```brainfuck\n+++.\n```"} />
    );

    await waitFor(() => {
      expect(screen.getByText("brainfuck")).toBeInTheDocument();
    });
    expect(highlight).not.toHaveBeenCalled();
    expect(container.querySelector(".hljs-keyword")).toBeNull();
    expect(container.querySelector("pre > code")).toHaveTextContent("+++.");
  });

  it("fence sem linguagem não chama o realce e continua em <pre><code>", async () => {
    const { container } = render(
      <MarkdownPreview content={"```\ntexto solto\n```"} />
    );

    expect(container.querySelector("pre > code")).toHaveTextContent(
      "texto solto"
    );
    await waitFor(() => expect(highlight).not.toHaveBeenCalled());
    expect(container.querySelector(".hljs-keyword")).toBeNull();
  });

  it("lowlight que não carrega deixa o bloco sem cor, sem erro na tela", async () => {
    lowlightIndisponivel = true;
    /**
     * O `CodeBlock` guarda a instância do lowlight num módulo (registrar 37 gramáticas por bloco
     * seria desperdício), e os testes acima já a resolveram. Recarregar o módulo é o que faz este
     * caso exercitar de verdade o `import()` que falha, em vez do cache de quem já carregou.
     */
    vi.resetModules();
    // Direto no componente: recarregar o `MarkdownPreview` inteiro traria junto meio app.
    const { CodeBlock } = await import("@/components/markdown/CodeBlock");

    const { container } = render(
      <CodeBlock code={"const a = 1;"} language="ts" />
    );

    await waitFor(() => {
      expect(container.querySelector("pre > code")).toHaveTextContent(
        "const a = 1;"
      );
    });
    expect(container.querySelector(".hljs-keyword")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("código inline não vira bloco (nem ganha cabeçalho)", () => {
    const { container } = render(<MarkdownPreview content={"use `npm ci` aqui"} />);

    expect(screen.queryByTestId("markdown-code")).toBeNull();
    expect(container.querySelector("code")).toHaveTextContent("npm ci");
    expect(highlight).not.toHaveBeenCalled();
  });

  it("HTML dentro do fence continua texto, mesmo com a linguagem html", async () => {
    const { container } = render(
      <MarkdownPreview content={"```html\n<img src=x onerror=alert(1)>\n```"} />
    );

    await waitFor(() => {
      expect(container.querySelector("pre > code")).toHaveTextContent(
        "<img src=x onerror=alert(1)>"
      );
    });
    expect(container.querySelector("img")).toBeNull();
  });
});
