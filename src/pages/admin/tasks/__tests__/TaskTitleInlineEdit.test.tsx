import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  TaskTitleInlineEdit,
  TASK_TITLE_EMPTY_MESSAGE,
} from "@/pages/admin/tasks/TaskTitleInlineEdit";

/**
 * Feature 100 — editar o título clicando nele. A skill `next` proíbe Chrome, então tudo o que o
 * componente promete (botão nomeado, foco, Enter, Escape, título vazio, valor inalterado, teclado
 * puro) é provado por DOM aqui.
 */

function renderTitle(overrides: Partial<Parameters<typeof TaskTitleInlineEdit>[0]> = {}) {
  const onChange = vi.fn();
  const onInvalid = vi.fn();
  const utils = render(
    <TaskTitleInlineEdit
      value="Comprar pão"
      onChange={onChange}
      onInvalid={onInvalid}
      {...overrides}
    />
  );
  return {
    ...utils,
    onChange: overrides.onChange ?? onChange,
    onInvalid: overrides.onInvalid ?? onInvalid,
  };
}

describe("TaskTitleInlineEdit — estado de leitura", () => {
  it("o título aparece como botão nomeado, com a tipografia de hoje", () => {
    renderTitle();

    const button = screen.getByRole("button", { name: "Editar título: Comprar pão" });
    expect(button).toHaveTextContent("Comprar pão");
    expect(button).toHaveAttribute("type", "button");
    // A tipografia do `<p className="truncate font-medium">` que ele substitui.
    expect(button.className).toContain("truncate");
    expect(button.className).toContain("font-medium");
    expect(button.className).toContain("text-left");
    // Nada de input antes de clicar.
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("tarefa concluída mantém o line-through e continua clicável (diferente do prazo, que trava)", async () => {
    const user = userEvent.setup();
    renderTitle({ done: true });

    const button = screen.getByRole("button", { name: "Editar título: Comprar pão" });
    expect(button.className).toContain("line-through");
    expect(button.className).toContain("text-muted-foreground");

    await user.click(button);
    expect(screen.getByRole("textbox", { name: "Título" })).toBeInTheDocument();
  });

  it("o clique no título não vaza para o card (stopPropagation)", async () => {
    const user = userEvent.setup();
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick}>
        <TaskTitleInlineEdit value="Comprar pão" onChange={vi.fn()} />
      </div>
    );

    await user.click(screen.getByRole("button", { name: "Editar título: Comprar pão" }));

    expect(screen.getByRole("textbox", { name: "Título" })).toBeInTheDocument();
    expect(onCardClick).not.toHaveBeenCalled();
  });
});

describe("TaskTitleInlineEdit — estado de edição", () => {
  it("clicar troca o texto por um input com o valor atual, focado e com o cursor no fim", async () => {
    const user = userEvent.setup();
    renderTitle();

    await user.click(screen.getByRole("button", { name: "Editar título: Comprar pão" }));

    const input = screen.getByRole("textbox", { name: "Título" }) as HTMLInputElement;
    expect(input).toHaveValue("Comprar pão");
    expect(input).toHaveFocus();
    // Cursor no fim (não select-all): quem clica no título quer corrigir, não substituir.
    expect(input.selectionStart).toBe("Comprar pão".length);
    expect(input.selectionEnd).toBe("Comprar pão".length);
    // O botão deu lugar ao input — não convivem.
    expect(screen.queryByRole("button", { name: /Editar título/ })).toBeNull();
  });

  it("digitar no fim e dar Enter chama onChange com o texto novo e fecha o input", async () => {
    const user = userEvent.setup();
    const { onChange } = renderTitle();

    await user.click(screen.getByRole("button", { name: "Editar título: Comprar pão" }));
    await user.keyboard(" integral{Enter}");

    expect(onChange).toHaveBeenCalledWith("Comprar pão integral");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("textbox")).toBeNull();
    // O foco volta pro botão: saiu pelo teclado, continua no teclado.
    expect(screen.getByRole("button", { name: /Editar título/ })).toHaveFocus();
  });

  it("blur (clicar fora) salva pelo mesmo caminho do Enter", async () => {
    const user = userEvent.setup();
    const { onChange } = renderTitle();

    await user.click(screen.getByRole("button", { name: "Editar título: Comprar pão" }));
    await user.keyboard(" integral");
    await user.tab();

    expect(onChange).toHaveBeenCalledWith("Comprar pão integral");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("TaskTitleInlineEdit — Escape cancela sem salvar (o defeito do DimensionsBoard)", () => {
  it("Escape não chama onChange, mesmo com o rascunho digitado, e restaura o texto", async () => {
    const user = userEvent.setup();
    const { onChange } = renderTitle();

    await user.click(screen.getByRole("button", { name: "Editar título: Comprar pão" }));
    await user.keyboard(" que eu não quero");
    await user.keyboard("{Escape}");

    // Em `DimensionsBoard.tsx:796-826` o Escape desmonta o input cujo `onBlur` salva — aqui a flag
    // de cancelamento é lida pelo `onBlur` e o rascunho é descartado.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Editar título: Comprar pão" })).toHaveTextContent(
      "Comprar pão"
    );
  });

  it("reabrir depois do Escape traz o valor original, não o rascunho descartado", async () => {
    const user = userEvent.setup();
    const { onChange } = renderTitle();

    await user.click(screen.getByRole("button", { name: "Editar título: Comprar pão" }));
    await user.keyboard(" lixo{Escape}");
    await user.click(screen.getByRole("button", { name: "Editar título: Comprar pão" }));

    expect(screen.getByRole("textbox", { name: "Título" })).toHaveValue("Comprar pão");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("TaskTitleInlineEdit — guards de gravação", () => {
  it("título em branco chama onInvalid, não onChange, e restaura o valor anterior", async () => {
    const user = userEvent.setup();
    const { onChange, onInvalid } = renderTitle();

    await user.click(screen.getByRole("button", { name: "Editar título: Comprar pão" }));
    await user.clear(screen.getByRole("textbox", { name: "Título" }));
    await user.keyboard("{Enter}");

    expect(onChange).not.toHaveBeenCalled();
    expect(onInvalid).toHaveBeenCalledWith(TASK_TITLE_EMPTY_MESSAGE);
    expect(screen.getByRole("button", { name: "Editar título: Comprar pão" })).toBeInTheDocument();
  });

  it("só espaço em branco conta como vazio (o trim vale antes de gravar)", async () => {
    const user = userEvent.setup();
    const { onChange, onInvalid } = renderTitle();

    await user.click(screen.getByRole("button", { name: "Editar título: Comprar pão" }));
    await user.clear(screen.getByRole("textbox", { name: "Título" }));
    await user.keyboard("   {Enter}");

    expect(onChange).not.toHaveBeenCalled();
    expect(onInvalid).toHaveBeenCalledWith(TASK_TITLE_EMPTY_MESSAGE);
  });

  it("texto inalterado não chama nada (nem onChange, nem onInvalid)", async () => {
    const user = userEvent.setup();
    const { onChange, onInvalid } = renderTitle();

    await user.click(screen.getByRole("button", { name: "Editar título: Comprar pão" }));
    await user.keyboard("{Enter}");

    expect(onChange).not.toHaveBeenCalled();
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it("espaço sobrando nas pontas não conta como mudança", async () => {
    const user = userEvent.setup();
    const { onChange } = renderTitle();

    await user.click(screen.getByRole("button", { name: "Editar título: Comprar pão" }));
    await user.keyboard("  {Enter}");

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("TaskTitleInlineEdit — teclado puro, sem mouse nenhum", () => {
  it("Tab alcança o botão do título e Enter abre o input", async () => {
    const user = userEvent.setup();
    renderTitle();

    await user.tab();

    const button = screen.getByRole("button", { name: "Editar título: Comprar pão" });
    expect(button).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "Título" })).toHaveFocus();
  });

  it("Espaço no botão também abre o input (semântica nativa de <button>)", async () => {
    const user = userEvent.setup();
    renderTitle();

    await user.tab();
    await user.keyboard(" ");

    expect(screen.getByRole("textbox", { name: "Título" })).toHaveFocus();
  });

  it("do teclado, dá pra abrir, corrigir e salvar sem tocar no mouse", async () => {
    const user = userEvent.setup();
    const { onChange } = renderTitle();

    await user.tab();
    await user.keyboard("{Enter}");
    await user.keyboard("zinho{Enter}");

    expect(onChange).toHaveBeenCalledWith("Comprar pãozinho");
  });
});
