import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskQuickAdd } from "@/pages/admin/tasks/TaskQuickAdd";

/**
 * Feature 098 — a tira de quick add da aba Lista. A skill `next` proíbe Chrome, então tudo o que a
 * feature promete (estados, foco, Tab, Enter, Ctrl+Enter, Escape, clique fora) é provado por DOM
 * aqui.
 */

/** Promise que só resolve quando o teste mandar — é o que deixa observar o estado "em voo". */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderQuickAdd(overrides: Partial<Parameters<typeof TaskQuickAdd>[0]> = {}) {
  const onCreate = vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <TaskQuickAdd projectId={null} onCreate={onCreate} {...overrides} />
  );
  return { ...utils, onCreate: overrides.onCreate ?? onCreate };
}

describe("TaskQuickAdd — estado fechado", () => {
  it("fechado mostra só o `+`, com aria-expanded=false", () => {
    renderQuickAdd();

    const plus = screen.getByRole("button", { name: "Adicionar tarefa rápida" });
    expect(plus).toHaveAttribute("aria-expanded", "false");
    expect(plus).toHaveAttribute("aria-controls");
    // Nenhum campo de digitação antes de abrir.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Criar" })).toBeNull();
  });
});

describe("TaskQuickAdd — estado aberto", () => {
  it("clicar no `+` troca ele pela tira, com o foco já no título", async () => {
    const user = userEvent.setup();
    renderQuickAdd();

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));

    const titleInput = screen.getByRole("textbox", { name: "Título da tarefa" });
    expect(titleInput).toHaveAttribute("placeholder", "O que precisa ser feito?");
    expect(titleInput).toHaveFocus();
    // O `+` deu lugar à tira — não convivem.
    expect(screen.queryByRole("button", { name: "Adicionar tarefa rápida" })).toBeNull();
    // E os dois botões da tira estão lá, à direita do campo.
    expect(screen.getByRole("button", { name: "Adicionar descrição" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar" })).toBeInTheDocument();
  });
});

describe("TaskQuickAdd — navegação por Tab (o coração do pedido)", () => {
  it("do título, Tab leva ao botão de descrição e outro Tab ao «Criar»", async () => {
    const user = userEvent.setup();
    renderQuickAdd();

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    await user.keyboard("Comprar pão");
    expect(screen.getByRole("textbox", { name: "Título da tarefa" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Adicionar descrição" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Criar" })).toHaveFocus();
  });

  it("Enter no «Criar» (o último ponto de tabulação) cria a tarefa", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderQuickAdd();

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    await user.keyboard("Comprar pão");
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Criar" })).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith({
      title: "Comprar pão",
      description: "",
      projectId: null,
    });
  });

  it("«Criar» é submit do form e o botão de descrição não é", async () => {
    const user = userEvent.setup();
    renderQuickAdd();

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    expect(screen.getByRole("button", { name: "Criar" })).toHaveAttribute("type", "submit");
    expect(screen.getByRole("button", { name: "Adicionar descrição" })).toHaveAttribute(
      "type",
      "button"
    );
  });
});

describe("TaskQuickAdd — descrição", () => {
  it.each([
    ["clique", async (user: ReturnType<typeof userEvent.setup>) =>
      user.click(screen.getByRole("button", { name: "Adicionar descrição" }))],
    ["Enter", async (user: ReturnType<typeof userEvent.setup>) => {
      screen.getByRole("button", { name: "Adicionar descrição" }).focus();
      await user.keyboard("{Enter}");
    }],
    ["Espaço", async (user: ReturnType<typeof userEvent.setup>) => {
      screen.getByRole("button", { name: "Adicionar descrição" }).focus();
      await user.keyboard("[Space]");
    }],
  ])("%s no botão de descrição revela a textarea e leva o foco pra dentro dela", async (_name, trigger) => {
    const user = userEvent.setup();
    renderQuickAdd();

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    const button = screen.getByRole("button", { name: "Adicionar descrição" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Descrição" })).toBeNull();

    await trigger(user);

    const textarea = screen.getByRole("textbox", { name: "Descrição" });
    expect(textarea).toHaveFocus();
    expect(textarea).toHaveAttribute("rows", "3");
    expect(screen.getByRole("button", { name: "Adicionar descrição" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    // A descrição abre **abaixo** da tira, não dentro do `<form>` de uma linha.
    expect(textarea.closest("form")).toBeNull();
    // E o `aria-controls` do botão aponta pro contêiner que ela ocupa.
    expect(button.getAttribute("aria-controls")).toBe(textarea.parentElement?.id);
  });

  it("a descrição digitada vai junto no onCreate", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderQuickAdd();

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    await user.keyboard("Comprar pão");
    await user.click(screen.getByRole("button", { name: "Adicionar descrição" }));
    await user.keyboard("Integral, da padaria da esquina");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(onCreate).toHaveBeenCalledWith({
      title: "Comprar pão",
      description: "Integral, da padaria da esquina",
      projectId: null,
    });
  });
});

describe("TaskQuickAdd — descrição: Enter quebra linha, Ctrl/Cmd+Enter cria", () => {
  it("Enter puro dentro da textarea só quebra a linha", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderQuickAdd();

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    await user.keyboard("Comprar pão");
    await user.click(screen.getByRole("button", { name: "Adicionar descrição" }));
    await user.keyboard("linha 1{Enter}linha 2");

    expect(screen.getByRole("textbox", { name: "Descrição" })).toHaveValue("linha 1\nlinha 2");
    expect(onCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["Ctrl", "{Control>}{Enter}{/Control}"],
    ["Cmd", "{Meta>}{Enter}{/Meta}"],
  ])("%s+Enter dentro da textarea cria com título e descrição", async (_name, keys) => {
    const user = userEvent.setup();
    const { onCreate } = renderQuickAdd();

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    await user.keyboard("Comprar pão");
    await user.click(screen.getByRole("button", { name: "Adicionar descrição" }));
    await user.keyboard("linha 1{Enter}linha 2");
    await user.keyboard(keys);

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith({
      title: "Comprar pão",
      description: "linha 1\nlinha 2",
      projectId: null,
    });
  });
});

describe("TaskQuickAdd — criar", () => {
  it("digitar o título e dar Enter chama onCreate com a descrição vazia", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderQuickAdd();

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    await user.keyboard("Comprar pão{Enter}");

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith({
      title: "Comprar pão",
      description: "",
      projectId: null,
    });
  });

  it("título só com espaços: «Criar» desabilitado e o Enter não cria nada", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderQuickAdd();

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    expect(screen.getByRole("button", { name: "Criar" })).toBeDisabled();

    await user.keyboard("   ");
    expect(screen.getByRole("button", { name: "Criar" })).toBeDisabled();

    await user.keyboard("{Enter}");
    expect(onCreate).not.toHaveBeenCalled();

    // Com texto de verdade o botão volta a valer.
    await user.keyboard("x");
    expect(screen.getByRole("button", { name: "Criar" })).toBeEnabled();
  });

  it("o título vai aparado (sem espaços nas pontas) para o onCreate", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderQuickAdd();

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    await user.keyboard("  Ligar para o dentista  {Enter}");

    expect(onCreate).toHaveBeenCalledWith({
      title: "Ligar para o dentista",
      description: "",
      projectId: null,
    });
  });
});

describe("TaskQuickAdd — criação em voo (saving)", () => {
  it("trava input, textarea e os dois botões enquanto o onCreate não volta", async () => {
    const user = userEvent.setup();
    const gate = deferred<void>();
    const onCreate = vi.fn().mockReturnValue(gate.promise);
    renderQuickAdd({ onCreate });

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    await user.keyboard("Comprar pão");
    await user.click(screen.getByRole("button", { name: "Adicionar descrição" }));
    await user.keyboard("integral");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(screen.getByRole("textbox", { name: "Título da tarefa" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Descrição" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Adicionar descrição" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Criar" })).toBeDisabled();

    // Um segundo disparo enquanto o primeiro está em voo não cria outra tarefa.
    await user.keyboard("{Enter}");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(onCreate).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve();
    });
    expect(screen.getByRole("textbox", { name: "Título da tarefa" })).toBeEnabled();
  });

  it("sucesso limpa os campos, recolhe a descrição, mantém a tira aberta e refoca o título", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderQuickAdd();

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    await user.keyboard("Comprar pão");
    await user.click(screen.getByRole("button", { name: "Adicionar descrição" }));
    await user.keyboard("integral");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    const titleInput = screen.getByRole("textbox", { name: "Título da tarefa" });
    // A tira continua aberta (o `+` não voltou) — anotar três coisas seguidas é o caso de uso.
    expect(screen.queryByRole("button", { name: "Adicionar tarefa rápida" })).toBeNull();
    expect(titleInput).toHaveValue("");
    expect(titleInput).toHaveFocus();
    // A descrição se recolheu e o rascunho dela também foi embora.
    expect(screen.queryByRole("textbox", { name: "Descrição" })).toBeNull();
    expect(screen.getByRole("button", { name: "Adicionar descrição" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );

    // E dá pra emendar a próxima anotação sem tocar no mouse.
    await user.keyboard("Comprar leite{Enter}");
    expect(onCreate).toHaveBeenNthCalledWith(2, {
      title: "Comprar leite",
      description: "",
      projectId: null,
    });
  });
});

describe("TaskQuickAdd — falha do onCreate", () => {
  it("promise rejeitada preserva título e descrição e devolve o foco ao título", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockRejectedValue(new Error("offline"));
    renderQuickAdd({ onCreate });

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    await user.keyboard("Comprar pão");
    await user.click(screen.getByRole("button", { name: "Adicionar descrição" }));
    await user.keyboard("integral");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    const titleInput = screen.getByRole("textbox", { name: "Título da tarefa" });
    expect(titleInput).toHaveValue("Comprar pão");
    expect(titleInput).toBeEnabled();
    expect(titleInput).toHaveFocus();
    // A descrição continua aberta, com o texto dentro.
    expect(screen.getByRole("textbox", { name: "Descrição" })).toHaveValue("integral");

    // E dá pra tentar de novo sem redigitar nada.
    onCreate.mockResolvedValueOnce(undefined);
    await user.keyboard("{Enter}");
    expect(onCreate).toHaveBeenNthCalledWith(2, {
      title: "Comprar pão",
      description: "integral",
      projectId: null,
    });
  });
});

describe("TaskQuickAdd — Escape e clique fora", () => {
  it("Escape fecha, devolve o foco ao `+` e reabrir restaura o rascunho", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderQuickAdd();

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    await user.keyboard("Comprar pão");
    await user.click(screen.getByRole("button", { name: "Adicionar descrição" }));
    await user.keyboard("integral");

    await user.keyboard("{Escape}");

    const plus = screen.getByRole("button", { name: "Adicionar tarefa rápida" });
    expect(plus).toHaveFocus();
    expect(screen.queryByRole("textbox", { name: "Título da tarefa" })).toBeNull();
    // Fechar não cria nada.
    expect(onCreate).not.toHaveBeenCalled();

    await user.click(plus);
    expect(screen.getByRole("textbox", { name: "Título da tarefa" })).toHaveValue("Comprar pão");
    expect(screen.getByRole("textbox", { name: "Descrição" })).toHaveValue("integral");
  });

  it("Escape a partir da textarea também fecha (a saída da descrição, já que Tab indenta)", async () => {
    const user = userEvent.setup();
    renderQuickAdd();

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    await user.click(screen.getByRole("button", { name: "Adicionar descrição" }));
    expect(screen.getByRole("textbox", { name: "Descrição" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Adicionar tarefa rápida" })).toHaveFocus();
  });

  it("clique fora com os campos vazios fecha a tira", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">outro lugar</button>
        <TaskQuickAdd projectId={null} onCreate={vi.fn().mockResolvedValue(undefined)} />
      </div>
    );

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    expect(screen.getByRole("textbox", { name: "Título da tarefa" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "outro lugar" }));
    expect(screen.queryByRole("textbox", { name: "Título da tarefa" })).toBeNull();
    expect(screen.getByRole("button", { name: "Adicionar tarefa rápida" })).toBeInTheDocument();
  });

  it("clique fora com texto digitado NÃO fecha", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">outro lugar</button>
        <TaskQuickAdd projectId={null} onCreate={vi.fn().mockResolvedValue(undefined)} />
      </div>
    );

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    await user.keyboard("Comprar pão");

    await user.click(screen.getByRole("button", { name: "outro lugar" }));
    expect(screen.getByRole("textbox", { name: "Título da tarefa" })).toHaveValue("Comprar pão");
  });

  it("clique fora com só a descrição preenchida também NÃO fecha", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">outro lugar</button>
        <TaskQuickAdd projectId={null} onCreate={vi.fn().mockResolvedValue(undefined)} />
      </div>
    );

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    await user.click(screen.getByRole("button", { name: "Adicionar descrição" }));
    await user.keyboard("lembrete solto");

    await user.click(screen.getByRole("button", { name: "outro lugar" }));
    expect(screen.getByRole("textbox", { name: "Descrição" })).toHaveValue("lembrete solto");
  });
});

describe("TaskQuickAdd — responsivo e movimento", () => {
  it("mobile: `+`, campo e botões com alvo de toque de 44px, e a tira ocupa a linha inteira", async () => {
    const user = userEvent.setup();
    renderQuickAdd();

    // `h-11` = 44px (o `sm:` só entra a partir do breakpoint, no navegador).
    const plus = screen.getByRole("button", { name: "Adicionar tarefa rápida" });
    expect(plus.className).toMatch(/(^|\s)h-11(\s|$)/);
    expect(plus.className).toMatch(/(^|\s)w-11(\s|$)/);

    await user.click(plus);
    const titleInput = screen.getByRole("textbox", { name: "Título da tarefa" });
    expect(titleInput.className).toMatch(/(^|\s)h-11(\s|$)/);
    expect(titleInput.className).toMatch(/(^|\s)w-full(\s|$)/);
    expect(screen.getByRole("button", { name: "Adicionar descrição" }).className).toMatch(
      /(^|\s)h-11(\s|$)/
    );
    expect(screen.getByRole("button", { name: "Criar" }).className).toMatch(/(^|\s)h-11(\s|$)/);
    // O `<form>` inteiro ocupa a linha no mobile e volta a "só o necessário" a partir de `sm`.
    expect(titleInput.closest("form")?.className).toMatch(/(^|\s)w-full(\s|$)/);
    expect(titleInput.closest("form")?.className).toMatch(/(^|\s)sm:w-auto(\s|$)/);
  });

  it("a animação de largura respeita «reduzir movimento»", async () => {
    const user = userEvent.setup();
    renderQuickAdd();

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    const titleInput = screen.getByRole("textbox", { name: "Título da tarefa" });
    expect(titleInput.className).toContain("transition-[width]");
    expect(titleInput.className).toContain("motion-reduce:transition-none");
  });

  /**
   * O pedido literal: "ao clicar nele, expande um campo de input textual **para a esquerda**". O
   * campo nasce com largura zero e vai a `w-64` no quadro seguinte; como a tira é ancorada à
   * direita (`ml-auto` na página + `sm:items-end` no contêiner), esse crescimento só pode acontecer
   * para a esquerda.
   */
  it("o campo abre com largura zero e cresce — ancorado à direita, ou seja, para a esquerda", async () => {
    const user = userEvent.setup();
    renderQuickAdd();

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    const titleInput = screen.getByRole("textbox", { name: "Título da tarefa" });
    expect(titleInput.className).toContain("sm:w-0");

    await waitFor(() => expect(titleInput.className).toContain("sm:w-64"));
    expect(titleInput.className).not.toContain("sm:w-0");

    // O contêiner da tira alinha o conteúdo à direita — a borda direita é o ponto fixo.
    expect((titleInput.closest("form")?.parentElement as HTMLElement).className).toContain(
      "sm:items-end"
    );
  });
});
