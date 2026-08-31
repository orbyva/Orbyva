import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskMilestoneField } from "@/pages/admin/tasks/TaskMilestoneField";

/**
 * Checkbox "Marco" (feature 037, aba Geral do formulário de tarefa) — cobre o estado inicial
 * refletindo `value` e o `onChange` disparando com o novo valor ao clicar, igual ao padrão de
 * teste de `TaskPriorityField`/outros campos de formulário isolados desta pasta.
 */
describe("TaskMilestoneField", () => {
  it("value=false: checkbox começa desmarcado", () => {
    render(<TaskMilestoneField value={false} onChange={() => {}} />);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("value=true: checkbox começa marcado", () => {
    render(<TaskMilestoneField value={true} onChange={() => {}} />);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("clicar no checkbox desmarcado chama onChange(true)", async () => {
    const onChange = vi.fn();
    render(<TaskMilestoneField value={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("clicar no checkbox marcado chama onChange(false)", async () => {
    const onChange = vi.fn();
    render(<TaskMilestoneField value={true} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
