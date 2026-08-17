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
    });
  });
});
