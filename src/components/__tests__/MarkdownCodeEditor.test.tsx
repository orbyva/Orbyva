import { describe, expect, it, vi } from "vitest";
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

  it("o live preview está ligado: formata o trecho e esconde a marcação fora da linha do cursor", async () => {
    const user = userEvent.setup();
    render(<Harness initial={"**negrito**\nsegunda linha"} />);

    const field = screen.getByRole("textbox", { name: "Conteúdo" });
    // Com o cursor na linha 1 (posição inicial), a marcação continua à mostra para poder ser
    // editada — é o comportamento do Obsidian.
    expect(field.textContent).toContain("**negrito**");
    expect(field.querySelector(".cm-md-strong")).not.toBeNull();

    await user.click(field);
    await user.keyboard("{Control>}{End}{/Control}");

    // Cursor na linha 2: os `**` da linha 1 somem da tela…
    expect(field.textContent).not.toContain("**");
    expect(field.textContent).toContain("negrito");
    // …mas continuam no documento. Decoração é camada de view, não edição.
    expect(doc()).toBe("**negrito**\nsegunda linha");
  });

  it("Ctrl+B envolve a seleção em negrito e Ctrl+B de novo desfaz", async () => {
    const user = userEvent.setup();
    render(<Harness initial="urgente" />);

    const field = screen.getByRole("textbox", { name: "Conteúdo" });
    await user.click(field);
    await user.keyboard("{Control>}a{/Control}");
    await user.keyboard("{Control>}b{/Control}");
    expect(doc()).toBe("**urgente**");

    await user.keyboard("{Control>}b{/Control}");
    expect(doc()).toBe("urgente");
  });

  it("Ctrl+Shift+2 vira título de nível 2 e troca de nível em vez de acumular `#`", async () => {
    const user = userEvent.setup();
    render(<Harness initial="Pauta" />);

    const field = screen.getByRole("textbox", { name: "Conteúdo" });
    await user.click(field);
    await user.keyboard("{Control>}{Shift>}2{/Shift}{/Control}");
    expect(doc()).toBe("## Pauta");

    await user.keyboard("{Control>}{Shift>}1{/Shift}{/Control}");
    expect(doc()).toBe("# Pauta");
  });

  it("Ctrl+K insere o esqueleto de link e não vaza para o atalho global do app", async () => {
    const user = userEvent.setup();
    // O mesmo predicado do `GlobalSearch`: só o Ctrl/⌘+K interessa (as teclas modificadoras
    // sozinhas continuam subindo, e não fazem nada lá).
    const globalShortcut = vi.fn();
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") globalShortcut();
    };
    window.addEventListener("keydown", listener);

    try {
      render(<Harness initial="veja " />);
      const field = screen.getByRole("textbox", { name: "Conteúdo" });
      await user.click(field);
      await user.keyboard("{Control>}{End}{/Control}");
      await user.keyboard("{Control>}k{/Control}");

      expect(doc()).toBe("veja []()");
      // A busca global (`GlobalSearch`) escuta Ctrl+K no `window`: o `stopPropagation` da
      // KeyBinding é o que impede o popup de abrir por cima do editor.
      expect(globalShortcut).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", listener);
    }
  });

  it("Ctrl+F abre a busca dentro da nota (religada na 068)", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Harness initial={"linha um\nlinha dois\nprazo do cartório"} />
    );

    const field = screen.getByRole("textbox", { name: "Conteúdo" });
    await user.click(field);
    expect(container.querySelector(".cm-search")).toBeNull();

    await user.keyboard("{Control>}f{/Control}");

    // O painel padrão do `@codemirror/search`, com o campo de busca dentro dele.
    const panel = container.querySelector(".cm-search");
    expect(panel).not.toBeNull();
    expect(panel?.querySelector("input[name='search']")).not.toBeNull();
    // E o documento continua intacto: abrir a busca não é editar.
    expect(doc()).toBe("linha um\nlinha dois\nprazo do cartório");
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
