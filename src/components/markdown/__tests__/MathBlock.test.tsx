import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MarkdownPreview } from "@/components/MarkdownPreview";

/**
 * Fórmula com `remark-math` + KaTeX por `import()` dinâmico (feature 067). Todo teste espera
 * (`await`/`waitFor`) porque o KaTeX chega depois do primeiro render — é o preço combinado por não
 * arrastar a lib para o chunk da descrição de tarefa.
 */
describe("MathBlock no MarkdownPreview", () => {
  it("fórmula inline vira KaTeX no meio do parágrafo", async () => {
    const { container } = render(
      <MarkdownPreview content="a área é $a^2 + b^2$ no total" />
    );

    await waitFor(() => {
      expect(container.querySelector(".katex")).not.toBeNull();
    });
    const math = screen.getByTestId("math-inline");
    expect(math.textContent).toContain("a");
    // Continua dentro do parágrafo: fórmula inline não pode quebrar o texto em dois.
    expect(math.closest("p")).not.toBeNull();
    expect(container.querySelector("p")?.textContent).toContain("a área é");
  });

  it("fórmula em bloco (`$$…$$`) sai em display, rolável", async () => {
    const { container } = render(<MarkdownPreview content={"$$\nE = mc^2\n$$"} />);

    await waitFor(() => {
      expect(container.querySelector(".katex-display")).not.toBeNull();
    });
    const math = screen.getByTestId("math-display");
    expect(math.className).toContain("overflow-x-auto");
    // O renderer traz o próprio container — nada de `<pre>` amassando a fórmula.
    expect(container.querySelector("pre")).toBeNull();
  });

  it("fórmula inválida vira caixa de erro sem derrubar o resto da nota", async () => {
    render(
      <MarkdownPreview content={"# Cabeçalho\n\n$$\n\\frac{1}{\n$$\n\nparágrafo final"} />
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Fórmula inválida");
    // O resto da nota continua de pé.
    expect(screen.getByRole("heading", { name: /Cabeçalho/ })).toBeInTheDocument();
    expect(screen.getByText("parágrafo final")).toBeInTheDocument();
  });

  it("`$` solto em texto comum não vira fórmula", async () => {
    const { container } = render(
      <MarkdownPreview content="o aluguel é R$ 1.200 por mês" />
    );

    await waitFor(() => {
      expect(container.textContent).toContain("R$ 1.200");
    });
    expect(screen.queryByTestId("math-inline")).toBeNull();
    expect(container.querySelector(".katex")).toBeNull();
  });

  it("`$…$` dentro de bloco de código continua literal", async () => {
    const { container } = render(
      <MarkdownPreview content={"```\necho $a^2$\n```"} />
    );

    await waitFor(() => {
      expect(container.querySelector("pre > code")?.textContent).toBe("echo $a^2$\n");
    });
    expect(screen.queryByTestId("math-inline")).toBeNull();
  });

  it("`$…$` em código inline continua literal", async () => {
    const { container } = render(<MarkdownPreview content="use `$a^2$` assim" />);

    await waitFor(() => {
      expect(container.querySelector("code")?.textContent).toBe("$a^2$");
    });
    expect(screen.queryByTestId("math-inline")).toBeNull();
  });

  it("fórmula convive com o resto das sintaxes na mesma nota", async () => {
    const { container } = render(
      <MarkdownPreview
        content={"> [!NOTE] Física\n> vale $E = mc^2$\n\n```ts\nconst c = 1;\n```"}
      />
    );

    await waitFor(() => {
      expect(container.querySelector(".katex")).not.toBeNull();
    });
    expect(screen.getByRole("note", { name: "Física" })).toBeInTheDocument();
    expect(container.querySelector("code.hljs")).not.toBeNull();
  });
});
