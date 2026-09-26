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

  /** Feature 072: sem o preset "Pontual" a primeira cláusula de `isPointTask`
   * (`estimated_duration === 0`) seria inalcançável pela UI. */
  it('escolher "Pontual" grava estimated_duration = 0', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TaskDurationQuickPick value={null} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /\+ Duração/ }));
    await user.click(await screen.findByRole("button", { name: "Pontual" }));

    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('com value 0 o trigger mostra "Pontual", não o placeholder', () => {
    render(<TaskDurationQuickPick value={0} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Pontual" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /\+ Duração/ })).toBeNull();
  });

  it('com value 0 ainda é possível remover a duração (voltar para "não sei quanto dura")', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TaskDurationQuickPick value={0} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Pontual" }));
    await user.click(await screen.findByRole("button", { name: "Remover duração" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});

/**
 * Feature 070 — "Pontual" ao lado dos presets: duração e tarefa pontual são mutuamente exclusivas,
 * então escolher uma tem que desligar a outra, nos dois sentidos.
 */
describe("TaskDurationQuickPick — opção Pontual (feature 070)", () => {
  it("sem onQuickChange, Pontual ainda existe como preset de duração 0 (feature 072)", async () => {
    const user = userEvent.setup();
    render(<TaskDurationQuickPick value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /\+ Duração/ }));

    expect(screen.getByRole("button", { name: "Pontual" })).toBeInTheDocument();
  });

  it("escolher Pontual dispara só onQuickChange(true) — quem zera a duração é o consumidor", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onQuickChange = vi.fn();
    render(
      <TaskDurationQuickPick value={60} onChange={onChange} isQuick={false} onQuickChange={onQuickChange} />
    );

    await user.click(screen.getByRole("button", { name: "1h" }));
    await user.click(await screen.findByRole("button", { name: "Pontual" }));

    expect(onQuickChange).toHaveBeenCalledWith(true);
    // Callback único por ação: um segundo disparo sobrescreveria o primeiro com props defasadas
    // (e, na lista, viraria duas escritas no banco).
    expect(onChange).not.toHaveBeenCalled();
  });

  it("escolher um preset devolve a duração num único onChange (o inverso; a flag cai no consumidor)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onQuickChange = vi.fn();
    render(
      <TaskDurationQuickPick value={null} onChange={onChange} isQuick onQuickChange={onQuickChange} />
    );

    await user.click(screen.getByRole("button", { name: /Pontual \(sem duração\)/ }));
    await user.click(await screen.findByRole("button", { name: "30min" }));

    expect(onChange).toHaveBeenCalledWith(30);
    expect(onQuickChange).not.toHaveBeenCalled();
  });

  it("aplicar um valor personalizado segue o mesmo contrato de callback único", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onQuickChange = vi.fn();
    render(
      <TaskDurationQuickPick value={null} onChange={onChange} isQuick onQuickChange={onQuickChange} />
    );

    await user.click(screen.getByRole("button", { name: /Pontual \(sem duração\)/ }));
    await user.type(await screen.findByPlaceholderText("Ex: 50"), "45");
    await user.click(screen.getByRole("button", { name: "Aplicar" }));

    expect(onChange).toHaveBeenCalledWith(45);
    expect(onQuickChange).not.toHaveBeenCalled();
  });

  it("o trigger mostra 'Pontual (sem duração)' e fica desabilitado quando quem manda é o interruptor do form", () => {
    render(<TaskDurationQuickPick value={null} onChange={vi.fn()} isQuick />);

    const trigger = screen.getByRole("button", { name: /Pontual \(sem duração\)/ });
    expect(trigger).toBeDisabled();
  });
});
