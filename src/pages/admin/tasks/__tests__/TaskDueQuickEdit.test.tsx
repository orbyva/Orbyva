import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskDueQuickEdit } from "@/pages/admin/tasks/TaskDueQuickEdit";

/**
 * Cobre o popover de prazo simplificado na feature 031 (ícones compactos em vez de inputs
 * grandes) — substitui o teste manual "Horário e Duração aparecem compactos com ícone, presets
 * funcionam, Personalizado aceita valor livre, salvar persiste due_date/due_time/
 * estimated_duration" por asserções reais de componente.
 */
describe("TaskDueQuickEdit", () => {
  it("mostra '+ Prazo' no trigger quando não há dueDate", () => {
    render(<TaskDueQuickEdit dueDate={null} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /\+ Prazo/ })).toBeInTheDocument();
  });

  it("com prazo definido, o popover mostra horário e duração compactos (ícone, sem label 'Horário' em linha própria)", async () => {
    const user = userEvent.setup();
    render(
      <TaskDueQuickEdit dueDate="2026-08-20" dueTime={null} estimatedDuration={null} onChange={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: /20\/08\/2026/ }));

    // Horário: input compacto (identificado por aria-label, não por um <label> visível em linha própria).
    const timeInput = await screen.findByLabelText("Horário");
    expect(timeInput.tagName).toBe("INPUT");
    expect(timeInput).toHaveAttribute("type", "time");
    expect(screen.queryByText("Horário")).not.toBeInTheDocument();

    // Duração: trigger compacto (ícone + texto), não mais um <input type="number"> exposto direto.
    expect(screen.getByRole("button", { name: /\+ Duração/ })).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("sem prazo definido, o popover não mostra os controles de horário/duração", async () => {
    const user = userEvent.setup();
    render(<TaskDueQuickEdit dueDate={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /\+ Prazo/ }));

    expect(screen.queryByLabelText("Horário")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /\+ Duração/ })).not.toBeInTheDocument();
  });

  it("alterar o horário chama onChange preservando due_date e estimated_duration", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TaskDueQuickEdit dueDate="2026-08-20" dueTime={null} estimatedDuration={90} onChange={onChange} />
    );

    await user.click(screen.getByRole("button", { name: /20\/08\/2026/ }));
    const timeInput = await screen.findByLabelText("Horário");
    fireEvent.change(timeInput, { target: { value: "14:30" } });

    expect(onChange).toHaveBeenLastCalledWith({
      due_date: "2026-08-20",
      due_time: "14:30",
      estimated_duration: 90,
      // Feature 070: o payload da edição rápida passou a carregar a flag de tarefa pontual.
      is_quick: false,
    });
  });

  it("selecionar um preset de duração chama onChange preservando due_date e due_time", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TaskDueQuickEdit dueDate="2026-08-20" dueTime="09:00" estimatedDuration={null} onChange={onChange} />
    );

    await user.click(screen.getByRole("button", { name: /20\/08\/2026 09:00/ }));
    await user.click(screen.getByRole("button", { name: /\+ Duração/ }));
    const preset = await screen.findByRole("button", { name: "1h30" });
    await user.click(preset);

    expect(onChange).toHaveBeenCalledWith({
      due_date: "2026-08-20",
      due_time: "09:00",
      estimated_duration: 90,
      is_quick: false,
    });
  });

  it("valor 'Personalizado' de duração fora dos presets chama onChange preservando due_date e due_time", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TaskDueQuickEdit dueDate="2026-08-20" dueTime="09:00" estimatedDuration={null} onChange={onChange} />
    );

    await user.click(screen.getByRole("button", { name: /20\/08\/2026 09:00/ }));
    await user.click(screen.getByRole("button", { name: /\+ Duração/ }));
    const customInput = await screen.findByPlaceholderText("Ex: 50");
    await user.type(customInput, "50");
    await user.click(screen.getByRole("button", { name: "Aplicar" }));

    expect(onChange).toHaveBeenCalledWith({
      due_date: "2026-08-20",
      due_time: "09:00",
      estimated_duration: 50,
      is_quick: false,
    });
  });

  it("a opção Pontual (feature 070) liga is_quick e zera a duração", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TaskDueQuickEdit dueDate="2026-08-20" dueTime="09:00" estimatedDuration={45} onChange={onChange} />
    );

    await user.click(screen.getByRole("button", { name: /20\/08\/2026/ }));
    // "45min" não é preset, então o trigger da duração é inequívoco dentro do popover de prazo.
    await user.click(await screen.findByRole("button", { name: "45min" }));
    await user.click(await screen.findByRole("button", { name: "Pontual" }));

    expect(onChange).toHaveBeenLastCalledWith({
      due_date: "2026-08-20",
      due_time: "09:00",
      estimated_duration: null,
      is_quick: true,
    });
  });

  it("o inverso: numa tarefa pontual, escolher um preset desliga is_quick e grava a duração", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TaskDueQuickEdit
        dueDate="2026-08-20"
        dueTime="09:00"
        estimatedDuration={null}
        isQuick
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /20\/08\/2026/ }));
    await user.click(await screen.findByRole("button", { name: /Pontual \(sem duração\)/ }));
    await user.click(await screen.findByRole("button", { name: "30min" }));

    // Uma única escrita, já com o par resolvido — nunca duas (duração e flag em chamadas separadas).
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      due_date: "2026-08-20",
      due_time: "09:00",
      estimated_duration: 30,
      is_quick: false,
    });
  });

  /**
   * Feature 081 — `onOpenChange` é o sinal que a Lista usa pra descongelar a posição da linha e
   * reagrupar. O que importa aqui é o par abrir/fechar chegar completo, e **escolher uma data não
   * contar como fechar**: horário e duração vivem no mesmo popover (features 031/041) e a 029
   * existe justamente pra o card não sumir de baixo do cursor no meio da edição.
   */
  describe("onOpenChange (feature 081)", () => {
    it("dispara true ao abrir e false ao fechar pelo próprio gatilho", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<TaskDueQuickEdit dueDate={null} onChange={vi.fn()} onOpenChange={onOpenChange} />);

      const trigger = screen.getByRole("button", { name: /\+ Prazo/ });
      await user.click(trigger);
      expect(onOpenChange).toHaveBeenLastCalledWith(true);
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      await user.click(trigger);
      expect(onOpenChange).toHaveBeenLastCalledWith(false);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("dispara false ao fechar com Esc", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(
        <TaskDueQuickEdit dueDate="2026-08-20" onChange={vi.fn()} onOpenChange={onOpenChange} />
      );

      await user.click(screen.getByRole("button", { name: /20\/08\/2026/ }));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      await user.keyboard("{Escape}");

      expect(onOpenChange).toHaveBeenLastCalledWith(false);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("dispara false ao fechar por clique fora", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(
        <div>
          <button type="button">Fora</button>
          <TaskDueQuickEdit dueDate="2026-08-20" onChange={vi.fn()} onOpenChange={onOpenChange} />
        </div>
      );

      await user.click(screen.getByRole("button", { name: /20\/08\/2026/ }));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Fora" }));

      expect(onOpenChange).toHaveBeenLastCalledWith(false);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("selecionar uma data NÃO fecha o popover (regressão da feature 029)", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const onOpenChange = vi.fn();
      render(
        <TaskDueQuickEdit
          dueDate="2026-08-20"
          onChange={onChange}
          onOpenChange={onOpenChange}
        />
      );

      await user.click(screen.getByRole("button", { name: /20\/08\/2026/ }));
      onOpenChange.mockClear();

      // O dia é identificado por `data-day` (mesma âncora usada em `DatePicker.test.tsx`): o nome
      // acessível do botão de dia vem do react-day-picker e não é estável.
      await screen.findByRole("dialog");
      const day25 = document.querySelector('[data-day="2026-08-25"] button');
      await user.click(day25 as HTMLButtonElement);

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ due_date: "2026-08-25" })
      );
      // Continua aberto: nenhum `false` foi emitido e o horário segue acessível.
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByLabelText("Horário")).toBeInTheDocument();
    });
  });

  it("tarefa já pontual mostra 'Pontual (sem duração)' no lugar da duração", async () => {
    const user = userEvent.setup();
    render(
      <TaskDueQuickEdit
        dueDate="2026-08-20"
        dueTime="09:00"
        estimatedDuration={null}
        isQuick
        onChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /20\/08\/2026/ }));

    expect(
      await screen.findByRole("button", { name: /Pontual \(sem duração\)/ })
    ).toBeEnabled();
  });
});
