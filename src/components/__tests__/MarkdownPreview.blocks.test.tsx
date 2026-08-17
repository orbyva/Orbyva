import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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

    expect(screen.getByRole("heading", { name: "Titulo" })).toBeInTheDocument();
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
