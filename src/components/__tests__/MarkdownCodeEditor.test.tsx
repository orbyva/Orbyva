import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkdownCodeEditor } from "@/components/MarkdownCodeEditor";

/**
 * O editor de Markdown sobre CodeMirror 6 (feature 056). O que precisa ficar provado aqui é o
 * contrato que a decisão da feature assumiu: o documento é markdown **cru** — o que entra em
 * `value` é o que sai em `onChange`, sem o editor reescrever nada por conta própria.
 */

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <MarkdownCodeEditor label="Conteúdo" value={value} onChange={setValue} />
      {/* Espelho do documento: é por ele que as assertivas leem o estado real do editor. */}
      <output data-testid="doc">{JSON.stringify(value)}</output>
    </>
  );
}

function doc(): string {
  return JSON.parse(screen.getByTestId("doc").textContent ?? '""') as string;
}

describe("MarkdownCodeEditor", () => {
  it("expõe o campo por aria-label e mostra o conteúdo inicial", () => {
    render(<Harness initial={"# Título\n\ncorpo"} />);
    const field = screen.getByRole("textbox", { name: "Conteúdo" });
    expect(field).toHaveAttribute("contenteditable", "true");
    expect(field).toHaveTextContent("# Título");
    expect(field).toHaveTextContent("corpo");
  });

  it("digitar markdown mantém o texto cru, marcadores inclusive", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const field = screen.getByRole("textbox", { name: "Conteúdo" });
    await user.click(field);
    await user.type(field, "**negrito**");

    // Nada de WYSIWYG: os asteriscos continuam no documento.
    expect(doc()).toBe("**negrito**");
  });

  it("Tab insere um tab literal e Shift+Tab remove o de trás do cursor", async () => {
    const user = userEvent.setup();
    render(<Harness initial="- item" />);

    const field = screen.getByRole("textbox", { name: "Conteúdo" });
    await user.click(field);
    // Cursor no começo da linha, como quem vai indentar o item.
    await user.keyboard("{Home}");
    await user.keyboard("{Tab}");
    expect(doc()).toBe("\t- item");
    // O foco continua no editor: o Tab foi consumido pelo keymap, não moveu para o próximo campo.
    expect(field).toHaveFocus();

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(doc()).toBe("- item");
  });

  it("Shift+Tab não apaga nada quando o caractere anterior não é tab", async () => {
    const user = userEvent.setup();
    render(<Harness initial="texto" />);

    const field = screen.getByRole("textbox", { name: "Conteúdo" });
    await user.click(field);
    await user.keyboard("{End}");
    await user.keyboard("{Shift>}{Tab}{/Shift}");

    expect(doc()).toBe("texto");
  });
});
