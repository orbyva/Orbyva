import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskPicker } from "@/pages/admin/tasks/TaskPicker";
import type { Project, Task } from "@/types/tasks";

/**
 * Feature 067: irmão do `ProjectPicker` para vincular um evento a uma tarefa. O que precisa ser
 * provado aqui é o que o `ProjectPicker` não faz — busca por título, teto de itens renderizados e o
 * nome do projeto como texto secundário —, além da seleção em si.
 */

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Tarefa",
    status: "todo",
    tag_ids: [],
    due_date: null,
    due_time: null,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return { id: "project-1", name: "Projeto Alpha", color: "#ff0000", status: "active", tag_ids: [], ...overrides };
}

function renderPicker({
  tasks = [makeTask()],
  projects = [] as Project[],
  value = null as string | null,
} = {}) {
  const onChange = vi.fn();
  const utils = render(
    <TaskPicker tasks={tasks} projects={projects} value={value} onChange={onChange} />
  );
  return { ...utils, onChange };
}

function listbox(): HTMLElement {
  return screen.getByRole("listbox", { name: "Tarefa" });
}

describe("TaskPicker", () => {
  it("lista as tarefas e a opção 'Sem tarefa'", () => {
    renderPicker({
      tasks: [
        makeTask({ id: "a", title: "Comprar cimento" }),
        makeTask({ id: "b", title: "Pintar parede" }),
      ],
    });

    const options = within(listbox()).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Sem tarefa",
      "Comprar cimento",
      "Pintar parede",
    ]);
  });

  it("clicar numa tarefa chama onChange com o id, e 'Sem tarefa' com null", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({
      tasks: [makeTask({ id: "a", title: "Comprar cimento" })],
      value: "a",
    });

    await user.click(screen.getByRole("option", { name: "Sem tarefa" }));
    expect(onChange).toHaveBeenCalledWith(null);

    await user.click(screen.getByRole("option", { name: "Comprar cimento" }));
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("marca aria-selected na tarefa escolhida", () => {
    renderPicker({
      tasks: [makeTask({ id: "a", title: "Comprar cimento" }), makeTask({ id: "b", title: "Pintar" })],
      value: "b",
    });

    expect(screen.getByRole("option", { name: "Pintar" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Comprar cimento" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
    expect(screen.getByRole("option", { name: "Sem tarefa" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("busca filtra por título, sem diferenciar maiúsculas", async () => {
    const user = userEvent.setup();
    renderPicker({
      tasks: [
        makeTask({ id: "a", title: "Comprar CIMENTO" }),
        makeTask({ id: "b", title: "Pintar parede" }),
      ],
    });

    await user.type(screen.getByLabelText("Buscar tarefa"), "cimento");

    const options = within(listbox()).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Sem tarefa", "Comprar CIMENTO"]);
  });

  it("busca sem resultado mostra o aviso e mantém 'Sem tarefa'", async () => {
    const user = userEvent.setup();
    renderPicker({ tasks: [makeTask({ id: "a", title: "Comprar cimento" })] });

    await user.type(screen.getByLabelText("Buscar tarefa"), "zzz");

    expect(screen.getByText("Nenhuma tarefa encontrada.")).toBeInTheDocument();
    expect(within(listbox()).getAllByRole("option")).toHaveLength(1);
  });

  it("mostra o nome do projeto da tarefa como texto secundário", () => {
    renderPicker({
      tasks: [makeTask({ id: "a", title: "Comprar cimento", project_id: "project-1" })],
      projects: [makeProject()],
    });

    expect(within(screen.getByRole("option", { name: /Comprar cimento/ })).getByText("Projeto Alpha")).toBeInTheDocument();
  });

  it("renderiza no máximo 50 tarefas e avisa quantas ficaram de fora", () => {
    const many = Array.from({ length: 63 }, (_, i) =>
      makeTask({ id: `t-${i}`, title: `Tarefa ${i}` })
    );
    renderPicker({ tasks: many });

    // 50 tarefas + a opção "Sem tarefa".
    expect(within(listbox()).getAllByRole("option")).toHaveLength(51);
    expect(screen.getByText("+13 tarefa(s) — refine a busca.")).toBeInTheDocument();
  });
});
