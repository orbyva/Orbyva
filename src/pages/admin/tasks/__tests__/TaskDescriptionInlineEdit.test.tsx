import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskDescriptionInlineEdit } from "@/pages/admin/tasks/TaskDescriptionInlineEdit";

/**
 * Feature 100 — editar a descrição clicando nela. Regras de teclado **opostas às do título**
 * (Enter puro quebra linha, `Ctrl/Cmd+Enter` salva), e é isso que este arquivo trava. Sem Chrome:
 * tudo por DOM.
 */

const MARKDOWN = "**Comprar** o [pão](https://padaria.com)\n- integral";
/** O que `stripMarkdown` deixa: sem `**`, sem `[]()`, sem `-`, e com as quebras achatadas. */
const PREVIEW = "Comprar o pão integral";

function renderDescription(
  overrides: Partial<Parameters<typeof TaskDescriptionInlineEdit>[0]> = {}
) {
  const onChange = vi.fn();
  const utils = render(
    <TaskDescriptionInlineEdit value={null} onChange={onChange} {...overrides} />
  );
  return { ...utils, onChange: overrides.onChange ?? onChange };
}

describe("TaskDescriptionInlineEdit — tarefa sem descrição ganha um alvo", () => {
  it("mostra «+ Descrição» e clicar abre a textarea vazia e focada", async () => {
    const user = userEvent.setup();
    renderDescription({ value: null });

    const button = screen.getByRole("button", { name: "Adicionar descrição" });
    expect(button).toHaveTextContent("+ Descrição");

    await user.click(button);

    const textarea = screen.getByRole("textbox", { name: "Descrição" });
    expect(textarea).toHaveValue("");
    expect(textarea).toHaveFocus();
  });

  it("descrição vazia (string vazia, não null) também mostra o placeholder", () => {
    renderDescription({ value: "" });
    expect(screen.getByRole("button", { name: "Adicionar descrição" })).toHaveTextContent(
      "+ Descrição"
    );
  });

  it("o clique não vaza para o card (stopPropagation), nem no placeholder nem na textarea", async () => {
    const user = userEvent.setup();
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick}>
        <TaskDescriptionInlineEdit value={null} onChange={vi.fn()} />
      </div>
    );

    await user.click(screen.getByRole("button", { name: "Adicionar descrição" }));
    await user.click(screen.getByRole("textbox", { name: "Descrição" }));

    expect(onCardClick).not.toHaveBeenCalled();
  });
});

describe("TaskDescriptionInlineEdit — prévia sem markdown, edição com markdown cru", () => {
  it("o card mostra o texto sem sintaxe e a textarea abre com o markdown cru", async () => {
    const user = userEvent.setup();
    renderDescription({ value: MARKDOWN });

    const button = screen.getByRole("button", { name: `Editar descrição: ${PREVIEW}` });
    expect(button).toHaveTextContent(PREVIEW);
    // A prévia é achatada: nada de `**`, `[]()` ou `-` na tela do card.
    expect(button.textContent).not.toContain("**");
    expect(button.textContent).not.toContain("](");
    expect(button.className).toContain("line-clamp-2");

    await user.click(button);

    const textarea = screen.getByRole("textbox", { name: "Descrição" }) as HTMLTextAreaElement;
    expect(textarea).toHaveValue(MARKDOWN);
    // Cursor no fim: continuar escrevendo acrescenta, não insere no começo do texto existente.
    expect(textarea.selectionStart).toBe(MARKDOWN.length);
  });
});

describe("TaskDescriptionInlineEdit — teclado multilinha", () => {
  it("Enter puro quebra linha (não salva) e Ctrl+Enter é que grava as duas linhas", async () => {
    const user = userEvent.setup();
    const { onChange } = renderDescription({ value: null });

    await user.click(screen.getByRole("button", { name: "Adicionar descrição" }));
    await user.keyboard("linha 1{Enter}linha 2");

    // Enter puro não fechou nem gravou nada — é uma descrição multilinha sendo escrita.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Descrição" })).toHaveValue("linha 1\nlinha 2");

    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(onChange).toHaveBeenCalledWith("linha 1\nlinha 2");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("Cmd+Enter salva igual (macOS)", async () => {
    const user = userEvent.setup();
    const { onChange } = renderDescription({ value: null });

    await user.click(screen.getByRole("button", { name: "Adicionar descrição" }));
    await user.keyboard("do mac");
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(onChange).toHaveBeenCalledWith("do mac");
  });

  /** `Tab` aqui **não** serve para sair: ele indenta (é o `MarkdownTextarea` das notas e do
   * formulário — ver a Decisão "consequência assumida"). A saída é clicar fora, e é isso que este
   * teste faz de verdade. */
  it("blur (clicar fora) salva pelo mesmo caminho", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <TaskDescriptionInlineEdit value={null} onChange={onChange} />
        <button type="button">Outro lugar da tela</button>
      </div>
    );

    await user.click(screen.getByRole("button", { name: "Adicionar descrição" }));
    await user.keyboard("escrito e saí");
    await user.click(screen.getByRole("button", { name: "Outro lugar da tela" }));

    expect(onChange).toHaveBeenCalledWith("escrito e saí");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("Escape cancela sem salvar e devolve a prévia antiga (a proteção do título, aqui também)", async () => {
    const user = userEvent.setup();
    const { onChange } = renderDescription({ value: MARKDOWN });

    await user.click(screen.getByRole("button", { name: `Editar descrição: ${PREVIEW}` }));
    await user.keyboard(" texto descartado");
    await user.keyboard("{Escape}");

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.getByRole("button", { name: `Editar descrição: ${PREVIEW}` })
    ).toHaveTextContent(PREVIEW);

    // E reabrir traz o markdown original, não o rascunho descartado.
    await user.click(screen.getByRole("button", { name: `Editar descrição: ${PREVIEW}` }));
    expect(screen.getByRole("textbox", { name: "Descrição" })).toHaveValue(MARKDOWN);
  });

  it("texto inalterado não chama onChange", async () => {
    const user = userEvent.setup();
    const { onChange } = renderDescription({ value: MARKDOWN });

    await user.click(screen.getByRole("button", { name: `Editar descrição: ${PREVIEW}` }));
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("apagar tudo é uma edição legítima: grava a descrição vazia", async () => {
    const user = userEvent.setup();
    const { onChange } = renderDescription({ value: "some isso" });

    await user.click(screen.getByRole("button", { name: "Editar descrição: some isso" }));
    await user.clear(screen.getByRole("textbox", { name: "Descrição" }));
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(onChange).toHaveBeenCalledWith("");
  });

  it("Tab dentro da textarea indenta em vez de sair do campo (comportamento do MarkdownTextarea)", async () => {
    const user = userEvent.setup();
    const { onChange } = renderDescription({ value: null });

    await user.click(screen.getByRole("button", { name: "Adicionar descrição" }));
    await user.keyboard("- item{Enter}");
    await user.tab();
    await user.keyboard("- sub");

    const textarea = screen.getByRole("textbox", { name: "Descrição" });
    expect(textarea).toHaveFocus();
    expect(textarea).toHaveValue("- item\n\t- sub");
    expect(onChange).not.toHaveBeenCalled();
  });
});
