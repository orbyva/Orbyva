import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

/**
 * O `toast` é o canal de erro do app; aqui ele é espionado para provar o caminho negativo.
 * `vi.hoisted` porque `vi.mock` sobe para o topo do arquivo e precisa do espião já criado.
 */
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast, dismiss: vi.fn(), toasts: [] }),
  toast,
}));

/** jsdom não tem área de transferência: ela é montada aqui, controlável por teste. */
const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  lowlightIndisponivel = false;
  highlight.mockClear();
  toast.mockClear();
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CodeBlock — realce", () => {
  it("pinta o fence com a linguagem declarada, em árvore React (sem innerHTML)", async () => {
    const { container } = render(
      <MarkdownPreview content={"```ts\nconst a = 1;\n```"} />
    );

    // Preview realça via rehype-highlight (children no CodeBlock); lowlight só no fallback
    // sem children. O contrato visível: spans hljs na árvore React, código intacto.
    await waitFor(() => {
      expect(container.querySelector(".hljs-keyword")).not.toBeNull();
    });

    expect(container.querySelector(".hljs-keyword")).toHaveTextContent("const");
    expect(container.querySelector("pre > code")).toHaveTextContent(
      "const a = 1;"
    );
  });

  it("continua entregando <pre><code class=\"language-…\">", async () => {
    const { container } = render(
      <MarkdownPreview content={"```ts\nconst a = 1;\n```"} />
    );

    await waitFor(() => {
      expect(container.querySelector("pre > code")).toHaveClass("language-ts");
    });
  });

  it("mostra a linguagem no cabeçalho", async () => {
    render(<MarkdownPreview content={"```python\nprint(1)\n```"} />);

    await waitFor(() => {
      expect(screen.getByText("python")).toBeInTheDocument();
    });
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

describe("CodeBlock — copiar", () => {
  const FONTE = "const a = 1;\nconst b = 2;";
  const MARKDOWN = `\`\`\`ts\n${FONTE}\n\`\`\``;

  it("copia o texto-fonte do bloco, não o DOM colorido", async () => {
    const { container } = render(<MarkdownPreview content={MARKDOWN} />);
    // Espera o realce entrar: é justamente depois dele que o DOM deixa de ser o texto puro.
    await waitFor(() =>
      expect(container.querySelector(".hljs-keyword")).not.toBeNull()
    );

    fireEvent.click(screen.getByRole("button", { name: /copiar/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(FONTE));
  });

  it("mostra 'Copiado' e volta para 'Copiar' depois de 2s", async () => {
    vi.useFakeTimers();
    render(<MarkdownPreview content={MARKDOWN} />);

    fireEvent.click(screen.getByRole("button", { name: /copiar/i }));
    // Solta as microtarefas do `await writeText` sem avançar o relógio.
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole("button", { name: /copiado/i })).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByRole("button", { name: /copiar/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copiado/i })).toBeNull();
  });

  it("área de transferência negada vira toast e não derruba o bloco", async () => {
    writeText.mockRejectedValue(new Error("NotAllowedError"));
    const { container } = render(<MarkdownPreview content={MARKDOWN} />);

    fireEvent.click(screen.getByRole("button", { name: /copiar/i }));

    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast.mock.calls[0][0]).toMatchObject({ variant: "destructive" });
    // O bloco continua inteiro na tela, e o botão volta a oferecer "Copiar".
    expect(container.querySelector("pre > code")).toHaveTextContent(
      "const a = 1;"
    );
    expect(screen.getByRole("button", { name: /copiar/i })).toBeInTheDocument();
  });

  it("navegador sem área de transferência não quebra a nota", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    render(<MarkdownPreview content={MARKDOWN} />);

    fireEvent.click(screen.getByRole("button", { name: /copiar/i }));

    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /copiar/i })).toBeInTheDocument();
  });
});
