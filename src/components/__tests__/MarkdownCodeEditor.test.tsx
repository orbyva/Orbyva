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

  /**
   * Atalhos de formatação (feature 070). O teste digita a tecla de verdade no `contenteditable` e
   * confere o **documento resultante** — é o que prova que o keymap está ligado no editor, e não só
   * que a função pura por trás dele funciona (isso é `markdownCommands.test.ts`).
   */
  describe("atalhos de formatação", () => {
    async function selectAll(user: ReturnType<typeof userEvent.setup>, field: HTMLElement) {
      await user.click(field);
      await user.keyboard("{Control>}a{/Control}");
    }

    it("Ctrl+B envolve a seleção com `**` e Ctrl+B de novo remove", async () => {
      const user = userEvent.setup();
      render(<Harness initial="negrito" />);
      const field = screen.getByRole("textbox", { name: "Conteúdo" });

      await selectAll(user, field);
      await user.keyboard("{Control>}b{/Control}");
      expect(doc()).toBe("**negrito**");

      await user.keyboard("{Control>}b{/Control}");
      expect(doc()).toBe("negrito");
    });

    it("Ctrl+I aplica itálico e Ctrl+Shift+K aplica código inline", async () => {
      const user = userEvent.setup();
      render(<Harness initial="texto" />);
      const field = screen.getByRole("textbox", { name: "Conteúdo" });

      await selectAll(user, field);
      await user.keyboard("{Control>}i{/Control}");
      expect(doc()).toBe("_texto_");

      await selectAll(user, field);
      await user.keyboard("{Control>}{Shift>}K{/Shift}{/Control}");
      expect(doc()).toBe("`_texto_`");
    });

    it("Ctrl+K vira link com o texto selecionado como rótulo", async () => {
      const user = userEvent.setup();
      render(<Harness initial="orbyva" />);
      const field = screen.getByRole("textbox", { name: "Conteúdo" });

      await selectAll(user, field);
      await user.keyboard("{Control>}k{/Control}");
      expect(doc()).toBe("[orbyva]()");

      // O cursor parou dentro dos parênteses: é lá que falta digitar.
      await user.keyboard("https://orbyva.app");
      expect(doc()).toBe("[orbyva](https://orbyva.app)");
    });

    it("Ctrl+2 vira título nível 2 e Ctrl+3 troca o nível em vez de empilhar `#`", async () => {
      const user = userEvent.setup();
      render(<Harness initial="Introducao" />);
      const field = screen.getByRole("textbox", { name: "Conteúdo" });

      await user.click(field);
      await user.keyboard("{Control>}2{/Control}");
      expect(doc()).toBe("## Introducao");

      await user.keyboard("{Control>}3{/Control}");
      expect(doc()).toBe("### Introducao");
    });

    it("Ctrl+Shift+8 vira lista e Ctrl+Shift+7 vira lista numerada", async () => {
      const user = userEvent.setup();
      render(<Harness initial={"um\ndois"} />);
      const field = screen.getByRole("textbox", { name: "Conteúdo" });

      await selectAll(user, field);
      await user.keyboard("{Control>}{Shift>}8{/Shift}{/Control}");
      expect(doc()).toBe("- um\n- dois");

      await user.keyboard("{Control>}{Shift>}7{/Shift}{/Control}");
      expect(doc()).toBe("1. um\n2. dois");
    });

    it("o atalho não deixa o evento subir para o atalho global do app (Ctrl+K)", async () => {
      const user = userEvent.setup();
      const onWindowKey = vi.fn();
      window.addEventListener("keydown", onWindowKey);
      render(<Harness initial="orbyva" />);
      const field = screen.getByRole("textbox", { name: "Conteúdo" });

      await selectAll(user, field);
      onWindowKey.mockClear();
      await user.keyboard("{Control>}k{/Control}");

      // A busca global (`GlobalSearch`) escuta no `window`: sem o `stopPropagation`, o mesmo
      // Ctrl+K inseriria o link **e** abriria a paleta por cima do editor. (O keydown da própria
      // tecla Control sobe normalmente — quem não pode subir é o `k`.)
      const keys = onWindowKey.mock.calls.map(([event]) => (event as KeyboardEvent).key);
      expect(keys).not.toContain("k");
      expect(doc()).toBe("[orbyva]()");
      window.removeEventListener("keydown", onWindowKey);
    });
  });

  it("Ctrl+F abre a busca dentro da nota", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Harness initial={"linha um\nlinha dois\nprazo do cartório"} />
    );

    const field = screen.getByRole("textbox", { name: "Conteúdo" });
    await user.click(field);
    expect(container.querySelector(".cm-search")).toBeNull();

    await user.keyboard("{Control>}f{/Control}");

    const panel = container.querySelector(".cm-search");
    expect(panel).not.toBeNull();
    expect(panel?.querySelector("input[name='search']")).not.toBeNull();
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
