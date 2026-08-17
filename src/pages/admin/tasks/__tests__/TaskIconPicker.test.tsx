import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskIconPicker } from "@/pages/admin/tasks/TaskIconPicker";
import { TASK_ICON_PRESETS } from "@/pages/admin/tasks/TaskIconBadge";
import { SHOPPING_TASK_ICON_KEY } from "@/domain/shopping/taskLink";
import { uploadTaskIcon } from "@/api/tasks";

vi.mock("@/api/tasks", () => ({
  uploadTaskIcon: vi.fn(),
}));

const toastMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

/**
 * Cobre o trigger + popover de seleção de ícone da tarefa (feature 035) — as duas formas de
 * atribuir um ícone pedidas no prompt original ("permita adicionar um ícone, não somente
 * selecionar de uma lista"): grid de presets clicáveis e upload de imagem própria. Substitui o
 * item "Teste manual" que fechava a lista de tarefas por asserções reais de componente (Testing
 * Library + jsdom).
 */
describe("TaskIconPicker", () => {
  beforeEach(() => {
    vi.mocked(uploadTaskIcon).mockReset();
    toastMock.mockReset();
  });

  it("sem ícone selecionado, o trigger mostra '+i' (versão compacta pra caber na linha de metadados)", () => {
    render(
      <TaskIconPicker taskId="task-1" value={{ icon_key: null, icon_url: null }} onChange={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Definir ícone" })).toHaveTextContent("+i");
  });

  it("com um preset selecionado, o trigger vira 'Trocar ícone' e mostra o ícone do preset", () => {
    const { container } = render(
      <TaskIconPicker taskId="task-1" value={{ icon_key: "star", icon_url: null }} onChange={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Trocar ícone" })).toBeInTheDocument();
    expect(container.querySelector('svg[aria-label="Estrela"]')).toBeInTheDocument();
  });

  it("abrir o popover mostra os 8 presets como botões clicáveis", async () => {
    const user = userEvent.setup();
    render(
      <TaskIconPicker taskId="task-1" value={{ icon_key: null, icon_url: null }} onChange={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));

    for (const preset of TASK_ICON_PRESETS) {
      expect(await screen.findByRole("button", { name: preset.label })).toBeInTheDocument();
    }
    expect(TASK_ICON_PRESETS).toHaveLength(8);
  });

  // Feature 051: o preset de compras precisa existir no grid pra tarefa criada a partir de um
  // item da lista nascer com o ícone certo — e continuar trocável como qualquer outra tarefa.
  it("o preset 'Compra' (shopping-cart) aparece no grid e pode ser selecionado", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    expect(TASK_ICON_PRESETS.map((preset) => preset.key)).toContain(
      SHOPPING_TASK_ICON_KEY
    );
    render(
      <TaskIconPicker taskId="task-1" value={{ icon_key: null, icon_url: null }} onChange={onChange} />
    );

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    await user.click(await screen.findByRole("button", { name: "Compra" }));

    expect(onChange).toHaveBeenCalledWith({ icon_key: "shopping-cart", icon_url: null });
  });

  it("uma tarefa já criada com o ícone de compras pode trocar pra outro preset (ícone é gravado, não travado)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TaskIconPicker
        taskId="task-1"
        value={{ icon_key: SHOPPING_TASK_ICON_KEY, icon_url: null }}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Trocar ícone" }));
    expect(await screen.findByRole("button", { name: "Compra" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await user.click(screen.getByRole("button", { name: "Estrela" }));

    expect(onChange).toHaveBeenCalledWith({ icon_key: "star", icon_url: null });
  });

  it("clicar num preset chama onChange com { icon_key, icon_url: null } e fecha o popover", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TaskIconPicker taskId="task-1" value={{ icon_key: null, icon_url: null }} onChange={onChange} />
    );

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    await user.click(await screen.findByRole("button", { name: "Bandeira" }));

    expect(onChange).toHaveBeenCalledWith({ icon_key: "flag", icon_url: null });
    expect(screen.queryByRole("button", { name: "Estrela" })).not.toBeInTheDocument();
  });

  it("o preset atualmente selecionado tem aria-pressed=true, os demais false", async () => {
    const user = userEvent.setup();
    render(
      <TaskIconPicker taskId="task-1" value={{ icon_key: "star", icon_url: null }} onChange={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Trocar ícone" }));

    expect(await screen.findByRole("button", { name: "Estrela" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Bandeira" })).toHaveAttribute("aria-pressed", "false");
  });

  it("com taskId nulo, o botão 'Enviar imagem' fica desabilitado e mostra a dica de salvar a tarefa antes", async () => {
    const user = userEvent.setup();
    render(<TaskIconPicker taskId={null} value={{ icon_key: null, icon_url: null }} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));

    expect(screen.getByRole("button", { name: "Enviar imagem" })).toBeDisabled();
    expect(screen.getByText("Salve a tarefa antes de enviar uma imagem.")).toBeInTheDocument();
  });

  it("com taskId presente, o upload fica habilitado e a dica de salvar não aparece", async () => {
    const user = userEvent.setup();
    render(
      <TaskIconPicker taskId="task-1" value={{ icon_key: null, icon_url: null }} onChange={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));

    expect(screen.getByRole("button", { name: "Enviar imagem" })).not.toBeDisabled();
    expect(screen.queryByText("Salve a tarefa antes de enviar uma imagem.")).not.toBeInTheDocument();
  });

  it("selecionar um arquivo com taskId presente chama uploadTaskIcon e onChange com icon_url, limpando icon_key", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(uploadTaskIcon).mockResolvedValue("https://cdn.example.com/task-1.png");
    render(
      <TaskIconPicker taskId="task-1" value={{ icon_key: "star", icon_url: null }} onChange={onChange} />
    );

    await user.click(screen.getByRole("button", { name: "Trocar ícone" }));
    const file = new File(["conteudo"], "icone.png", { type: "image/png" });
    // O popover do Radix renderiza em um portal fora do container local do `render`, precisa
    // buscar no `document` inteiro.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(uploadTaskIcon).toHaveBeenCalledWith("task-1", file);
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        icon_key: null,
        icon_url: "https://cdn.example.com/task-1.png",
      });
    });
  });

  it("upload que falha mostra um toast de erro e não chama onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(uploadTaskIcon).mockRejectedValue(new Error("arquivo muito grande"));
    render(
      <TaskIconPicker taskId="task-1" value={{ icon_key: null, icon_url: null }} onChange={onChange} />
    );

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    const file = new File(["conteudo"], "icone.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await vi.waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      );
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("com ícone definido, o botão 'Remover ícone' chama onChange limpando icon_key e icon_url", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TaskIconPicker taskId="task-1" value={{ icon_key: "star", icon_url: null }} onChange={onChange} />
    );

    await user.click(screen.getByRole("button", { name: "Trocar ícone" }));
    await user.click(screen.getByRole("button", { name: "Remover ícone" }));

    expect(onChange).toHaveBeenCalledWith({ icon_key: null, icon_url: null });
  });
});
