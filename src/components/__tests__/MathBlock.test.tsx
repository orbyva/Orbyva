import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MarkdownPreview } from "@/components/MarkdownPreview";

/**
 * O KaTeX é mockado aqui de propósito: o que precisa ser provado é o **contrato do componente**
 * (quem é chamado, com que fórmula, em que modo, e o que aparece quando dá errado), não a
 * tipografia do KaTeX — que é problema do KaTeX e custaria carregar a biblioteca inteira em jsdom.
 *
 * O mock imita a API real: `katex.render(fonte, elemento, opções)` escreve **nós de DOM** dentro do
 * elemento hospedeiro. É o que o `MathBlock` usa justamente para não precisar de
 * `dangerouslySetInnerHTML` (invariante da 055).
 */
const katexRender = vi.fn();
let katexIndisponivel = false;

vi.mock("katex", () => ({
  get default() {
    // Simula o `import()` dinâmico que não chega (offline, chunk fora do ar).
    if (katexIndisponivel) {
      throw new Error("Failed to fetch dynamically imported module");
    }
    return { render: katexRender };
  },
}));

vi.mock("katex/dist/katex.min.css", () => ({}));

beforeEach(() => {
  katexIndisponivel = false;
  katexRender.mockReset();
  katexRender.mockImplementation(
    (source: string, host: HTMLElement, options: { displayMode?: boolean }) => {
      host.textContent = "";
      const desenhado = host.ownerDocument.createElement("span");
      desenhado.className = options.displayMode ? "katex-display" : "katex";
      desenhado.textContent = `katex(${source})`;
      host.appendChild(desenhado);
    }
  );
});

describe("InlineMath — $…$", () => {
  it("manda a fórmula ao KaTeX em modo inline e mostra o resultado", async () => {
    render(<MarkdownPreview content={"vale $a^2$ aqui"} />);

    await waitFor(() => {
      expect(screen.getByTestId("math-inline")).toHaveTextContent("katex(a^2)");
    });

    expect(katexRender).toHaveBeenCalledTimes(1);
    const [fonte, , opcoes] = katexRender.mock.calls[0];
    expect(fonte).toBe("a^2");
    expect(opcoes).toMatchObject({ displayMode: false, throwOnError: true });
  });

  it("os cifrões são sintaxe: não sobram na tela", async () => {
    const { container } = render(<MarkdownPreview content={"vale $a^2$ aqui"} />);

    await waitFor(() => expect(katexRender).toHaveBeenCalled());
    expect(container.textContent).not.toContain("$a^2$");
    expect(container.textContent).toContain("vale");
    expect(container.textContent).toContain("aqui");
  });

  it("cifrão solto continua sendo cifrão (preço não vira fórmula)", () => {
    const { container } = render(
      <MarkdownPreview content={"custou R$ 10 e sobrou troco"} />
    );

    expect(screen.queryByTestId("math-inline")).toBeNull();
    expect(katexRender).not.toHaveBeenCalled();
    expect(container.textContent).toContain("R$ 10");
  });
});

describe("MathBlock — $$…$$ e ```math", () => {
  it("fórmula em bloco vai ao KaTeX em modo display", async () => {
    render(<MarkdownPreview content={"$$\nE = mc^2\n$$"} />);

    await waitFor(() => {
      expect(screen.getByTestId("math-display")).toHaveTextContent(
        "katex(E = mc^2)"
      );
    });

    const [fonte, , opcoes] = katexRender.mock.calls[0];
    expect(fonte).toBe("E = mc^2");
    expect(opcoes).toMatchObject({ displayMode: true });
  });

  it("o fence ```math também é fórmula (como no GitHub), fora do <pre>", async () => {
    const { container } = render(
      <MarkdownPreview content={"```math\n\\frac{1}{2}\n```"} />
    );

    await waitFor(() => {
      expect(screen.getByTestId("math-display")).toHaveTextContent(
        "katex(\\frac{1}{2})"
      );
    });
    // O `<pre>` amassaria a fórmula com fonte monoespaçada — o registry o desfaz.
    expect(container.querySelector("pre")).toBeNull();
  });

  it("fórmula em bloco não engole o texto em volta", async () => {
    const { container } = render(
      <MarkdownPreview content={"antes\n\n$$\nx\n$$\n\ndepois"} />
    );

    await waitFor(() => expect(katexRender).toHaveBeenCalled());
    expect(container.textContent).toContain("antes");
    expect(container.textContent).toContain("depois");
  });
});

describe("MathBlock — quando dá errado", () => {
  it("fórmula inválida mostra a fonte e a mensagem do KaTeX, sem sumir", async () => {
    katexRender.mockImplementation(() => {
      throw new Error("KaTeX parse error: Undefined control sequence: \\naoexiste");
    });

    render(<MarkdownPreview content={"$$\n\\naoexiste{x}\n$$"} />);

    const erro = await screen.findByRole("alert");
    // A fonte continua na tela: o usuário vê o que escreveu.
    expect(erro).toHaveTextContent("\\naoexiste{x}");
    expect(erro).toHaveTextContent("Undefined control sequence");
  });

  it("erro de uma fórmula não derruba o resto da nota", async () => {
    katexRender.mockImplementation(() => {
      throw new Error("KaTeX parse error: boom");
    });

    const { container } = render(
      <MarkdownPreview content={"# Titulo\n\n$$\n\\boom\n$$\n\ntexto depois"} />
    );

    await screen.findByRole("alert");
    expect(screen.getByRole("heading", { name: "Titulo" })).toBeInTheDocument();
    expect(container.textContent).toContain("texto depois");
  });

  it("KaTeX que não carrega cai para o texto-fonte, sem caixa de erro", async () => {
    katexIndisponivel = true;

    render(<MarkdownPreview content={"vale $a^2$ aqui"} />);

    await waitFor(() => {
      expect(screen.getByTestId("math-inline")).toHaveTextContent("a^2");
    });
    // Biblioteca que não chegou não é erro de quem escreveu: nada de alerta vermelho.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(katexRender).not.toHaveBeenCalled();
  });

  it("HTML cru dentro de fórmula continua não interpretado", async () => {
    // O que o KaTeX receber é texto; o que ele devolve são nós de DOM que ele mesmo cria.
    const { container } = render(
      <MarkdownPreview content={"$$\n<img src=x onerror=alert(1)>\n$$"} />
    );

    await waitFor(() => expect(katexRender).toHaveBeenCalled());
    expect(katexRender.mock.calls[0][0]).toBe("<img src=x onerror=alert(1)>");
    expect(container.querySelector("img")).toBeNull();
  });
});
