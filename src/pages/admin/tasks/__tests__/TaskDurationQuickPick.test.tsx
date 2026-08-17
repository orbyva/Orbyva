import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskDurationQuickPick } from "@/pages/admin/tasks/TaskDurationQuickPick";

/**
 * Cobre o popover de duração introduzido/simplificado na feature 031 — substitui o teste manual
 * "presets funcionam / Personalizado aceita valor livre" da lista de tarefas por asserções reais
 * de componente (Testing Library + jsdom, ver `vite.config.ts`/`src/test/setup-jsdom.ts`).
 */
describe("TaskDurationQuickPick", () => {
  it("mostra o placeholder '+ Duração' no trigger quando value é null", () => {
    render(<TaskDurationQuickPick value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /\+ Duração/ })).toBeInTheDocument();
  });

  it("mostra a duração formatada (via formatEstimatedDuration) no trigger quando value é definido", () => {
    render(<TaskDurationQuickPick value={90} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "1h30" })).toBeInTheDocument();
  });

  it("abre o popover com presets em botões e aplica um preset via onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TaskDurationQuickPick value={null} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /\+ Duração/ }));

    const preset = await screen.findByRole("button", { name: "1h30" });
    await user.click(preset);

    expect(onChange).toHaveBeenCalledWith(90);
  });

  it("campo 'Personalizado' aceita um valor fora da lista de presets e chama onChange com ele", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TaskDurationQuickPick value={null} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /\+ Duração/ }));

    const customInput = await screen.findByPlaceholderText("Ex: 50");
    await user.type(customInput, "50");
    await user.click(screen.getByRole("button", { name: "Aplicar" }));

    expect(onChange).toHaveBeenCalledWith(50);
  });

  it("botão 'Aplicar' fica desabilitado sem valor no campo Personalizado", async () => {
    const user = userEvent.setup();
    render(<TaskDurationQuickPick value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /\+ Duração/ }));

    expect(await screen.findByRole("button", { name: "Aplicar" })).toBeDisabled();
  });

  it("permite remover a duração quando já definida, chamando onChange(null)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TaskDurationQuickPick value={60} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "1h" }));
    await user.click(await screen.findByRole("button", { name: "Remover duração" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
