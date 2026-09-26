import { afterEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { blockRenderers } from "@/components/markdown/blockRegistry";

/**
 * O registry é um mapa mutável de propósito (é o que faz "registrar um plugin" ser uma linha), então
 * o teste registra um renderer de mentira e limpa depois — assim ele prova o mecanismo sem depender
 * do mermaid, que é só o primeiro cliente dele.
 */
function DemoBlock({ code }: { code: string }) {
  return <div data-testid="demo-block">demo:{code}</div>;
}

afterEach(() => {
  delete blockRenderers.demo;
});

describe("MarkdownPreview + registry de blocos", () => {
  it("entrega o código cru do fence ao renderer registrado", () => {
    blockRenderers.demo = DemoBlock;
    render(<MarkdownPreview content={"```demo\nA-->B\nC\n```"} />);

    expect(screen.getByTestId("demo-block")).toHaveTextContent("demo:A-->B C");
  });

  it("não deixa o renderer dentro do <pre> (que amassaria um SVG)", () => {
    blockRenderers.demo = DemoBlock;
    const { container } = render(<MarkdownPreview content={"```demo\nx\n```"} />);

    expect(screen.getByTestId("demo-block").closest("pre")).toBeNull();
    expect(container.querySelector("pre")).toBeNull();
  });

  it("bloco de linguagem sem renderer continua renderizando como antes", () => {
    const { container } = render(
      <MarkdownPreview content={"```ts\nconst a = 1;\n```"} />
    );

    const code = container.querySelector("pre > code");
    expect(code).not.toBeNull();
    expect(code).toHaveClass("language-ts");
    expect(code).toHaveTextContent("const a = 1;");
  });

  it("a linguagem casa sem diferenciar caixa", () => {
    blockRenderers.demo = DemoBlock;
    render(<MarkdownPreview content={"```DEMO\ny\n```"} />);

    expect(screen.getByTestId("demo-block")).toHaveTextContent("demo:y");
  });

  it("código inline não vira bloco de plugin", () => {
    blockRenderers.demo = DemoBlock;
    const { container } = render(<MarkdownPreview content="use `demo` aqui" />);

    expect(screen.queryByTestId("demo-block")).toBeNull();
    expect(container.querySelector("code")).toHaveTextContent("demo");
  });

  it("o resto do Markdown continua funcionando com o registry ligado", () => {
    render(
      <MarkdownPreview content={"# Titulo\n\n- item\n\n**forte**\n\n```demo\nz\n```"} />
    );

    expect(screen.getByRole("heading", { name: /Titulo/ })).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("item");
    expect(screen.getByText("forte").tagName).toBe("STRONG");
  });

  it("o array central de plugins remark está ligado (GFM continua valendo)", () => {
    render(
      <MarkdownPreview
        content={"| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] feito\n\n~~riscado~~"}
      />
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByText("riscado").tagName).toBe("DEL");
  });

  it("HTML cru continua não sendo interpretado", () => {
    const { container } = render(
      <MarkdownPreview content={"<img src=x onerror=alert(1)>"} />
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img");
  });
});

/**
 * # A invariante, recurso por recurso (feature 069)
 *
 * "O preview não interpreta HTML" (decisão da 055, garantida por não existir `rehype-raw`) é a
 * frase mais fácil de deixar de ser verdade sem ninguém notar: basta um recurso novo passar texto
 * do usuário por `innerHTML` em algum canto. A 069 trouxe três caminhos novos para o texto do
 * usuário — callout, fórmula e realce de código — e cada um deles tem um caso aqui.
 *
 * Estes testes usam o **KaTeX e o lowlight de verdade**, sem mock, de propósito: mock nenhum prova
 * o que a biblioteca faz com o que recebe, e é exatamente isso que está sendo afirmado.
 */
describe("MarkdownPreview — HTML cru continua desligado nos recursos da 069", () => {
  const ATAQUE = "<img src=x onerror=alert(1)>";

  it("dentro de um callout", () => {
    const { container } = render(
      <MarkdownPreview content={`> [!WARNING]\n> ${ATAQUE}`} />
    );

    expect(container.querySelector('[data-callout="warning"]')).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img");
  });

  it("dentro de uma fórmula", async () => {
    const { container } = render(
      <MarkdownPreview content={`$$\n${ATAQUE}\n$$`} />
    );

    // Espera o KaTeX de verdade desenhar (ou falhar) — sem isso o teste passaria por preguiça.
    await waitFor(
      () =>
        expect(
          container.querySelector(".katex") ??
            container.querySelector('[role="alert"]')
        ).not.toBeNull(),
      { timeout: 5000 }
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("dentro de um fence com linguagem html", async () => {
    const { container } = render(
      <MarkdownPreview content={"```html\n" + ATAQUE + "\n```"} />
    );

    // O realce de verdade marca a tag; é depois dele que o DOM deixaria de ser texto.
    await waitFor(
      () => expect(container.querySelector(".hljs-tag")).not.toBeNull(),
      { timeout: 5000 }
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("pre > code")).toHaveTextContent(ATAQUE);
  });

  it("dentro do texto de um título (que ganha id e âncora)", () => {
    const { container } = render(<MarkdownPreview content={`## ${ATAQUE}`} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("h2")?.textContent).toContain("<img");
  });
});
