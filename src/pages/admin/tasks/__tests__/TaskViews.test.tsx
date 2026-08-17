import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { KanbanCard, TaskListRow, STATUS_LABELS } from "@/pages/admin/tasks/TaskViews";
import { formatDateTimeBR } from "@/lib/currency";
import type { Project, Task } from "@/types/tasks";

/**
 * Cobre a extração do quick-edit compartilhado (`TaskQuickFields`, feature 033) — prova que o
 * Kanban ganhou os mesmos três quick-edits (prioridade/prazo/projeto) que já existiam só na Lista
 * (feature 029), que ambas visões usam o mesmo componente (mesmo comportamento clicável quando o
 * handler é passado, mesmo fallback somente-leitura quando ausente) e que o ícone de status
 * (`STATUS_ICONS`) aparece nas duas. Substitui o item "Teste manual" que fechava a lista de
 * tarefas por asserções reais de componente (Testing Library + jsdom).
 */

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Minha tarefa",
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
  return {
    id: "project-1",
    name: "Projeto X",
    status: "active",
    tag_ids: [],
    ...overrides,
  };
}

function renderKanbanCard(overrides: Partial<Parameters<typeof KanbanCard>[0]> = {}) {
  const task = overrides.task ?? makeTask();
  return render(
    <MemoryRouter>
      <KanbanCard
        task={task}
        allTasks={[task]}
        colIndex={0}
        subtasks={[]}
        allTags={[]}
        subtaskDraft=""
        onSubtaskDraftChange={vi.fn()}
        onAddSubtask={vi.fn()}
        onToggleSubtask={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onMoveStatus={vi.fn()}
        onOpenSubtask={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>
  );
}

function renderTaskListRow(overrides: Partial<Parameters<typeof TaskListRow>[0]> = {}) {
  const task = overrides.task ?? makeTask();
  return render(
    <TaskListRow
      task={task}
      allTasks={[task]}
      subtasks={[]}
      allTags={[]}
      expanded={false}
      onToggleExpand={vi.fn()}
      onToggleSubtask={vi.fn()}
      onOpenSubtask={vi.fn()}
      onToggleDone={vi.fn()}
      onStatusChange={vi.fn()}
      onOpenSeries={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      {...overrides}
    />
  );
}

describe("KanbanCard — quick edit compartilhado com a Lista (feature 033)", () => {
  it("sem handlers, mostra prioridade/prazo/projeto somente-leitura (nada clicável) e o ícone de status da coluna", () => {
    const task = makeTask({ priority: "high", due_date: "2026-08-20", due_time: "09:00" });
    const { container } = renderKanbanCard({
      task,
      projectBadge: <span>Sem projeto</span>,
    });

    // Prioridade: ícone estático (aria-label), não um botão clicável.
    expect(screen.getByLabelText("Prioridade alta")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Prioridade|Definir prioridade/ })).not.toBeInTheDocument();

    // Prazo: texto com ícone Calendar, não um botão.
    const expectedDue = formatDateTimeBR("2026-08-20", "09:00");
    expect(screen.getByText(expectedDue)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: new RegExp(expectedDue) })).not.toBeInTheDocument();

    // Projeto: o `projectBadge` estático passado por fora, sem popover.
    expect(screen.getByText("Sem projeto")).toBeInTheDocument();

    // Ícone de status da coluna (STATUS_ICONS["todo"] = Circle -> classe lucide-circle).
    expect(container.querySelector("svg.lucide-circle")).toBeInTheDocument();
  });

  it("com onPriorityChange, o quick-edit de prioridade fica clicável e chama onPriorityChange no Kanban", async () => {
    const user = userEvent.setup();
    const onPriorityChange = vi.fn();
    renderKanbanCard({ task: makeTask({ priority: null }), onPriorityChange });

    await user.click(screen.getByRole("button", { name: "Definir prioridade" }));
    await user.click(await screen.findByRole("button", { name: "Alta" }));

    expect(onPriorityChange).toHaveBeenCalledWith("high");
  });

  it("com onDueChange, o quick-edit de prazo fica clicável e chama onDueChange preservando due_date no Kanban", async () => {
    const user = userEvent.setup();
    const onDueChange = vi.fn();
    renderKanbanCard({
      task: makeTask({ due_date: "2026-08-20", due_time: null, estimated_duration: null }),
      onDueChange,
    });

    const expectedDue = formatDateTimeBR("2026-08-20", null);
    await user.click(screen.getByRole("button", { name: new RegExp(expectedDue) }));
    const timeInput = await screen.findByLabelText("Horário");
    fireEvent.change(timeInput, { target: { value: "14:30" } });

    expect(onDueChange).toHaveBeenCalledWith({
      due_date: "2026-08-20",
      due_time: "14:30",
      estimated_duration: null,
    });
  });

  it("com onProjectChange+projects, o badge de projeto fica clicável e chama onProjectChange no Kanban (card sem projeto)", async () => {
    const user = userEvent.setup();
    const onProjectChange = vi.fn();
    const project = makeProject({ id: "proj-abc", name: "Projeto Alpha" });
    renderKanbanCard({
      task: makeTask({ project_id: null }),
      onProjectChange,
      projects: [project],
    });

    await user.click(screen.getByRole("button", { name: "Sem projeto" }));
    const listbox = await screen.findByRole("listbox", { name: "Projeto" });
    await user.click(within(listbox).getByRole("option", { name: "Projeto Alpha" }));

    expect(onProjectChange).toHaveBeenCalledWith("proj-abc");
  });

  it("com icon_key definido na task, o TaskIconBadge somente-leitura aparece no card (feature 035)", () => {
    const { container } = renderKanbanCard({ task: makeTask({ icon_key: "flag", icon_url: null }) });
    expect(container.querySelector('svg[aria-label="Bandeira"]')).toBeInTheDocument();
  });

  it("com onIconChange, o quick-edit de ícone fica clicável e chama onIconChange no Kanban (feature 035)", async () => {
    const user = userEvent.setup();
    const onIconChange = vi.fn();
    renderKanbanCard({ task: makeTask({ icon_key: null, icon_url: null }), onIconChange });

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    await user.click(await screen.findByRole("button", { name: "Estrela" }));

    expect(onIconChange).toHaveBeenCalledWith({ icon_key: "star", icon_url: null });
  });

  it("o trigger de ícone aparece na linha de metadados do card, não mais na linha do título (feature 040)", () => {
    renderKanbanCard({ task: makeTask({ icon_key: null, icon_url: null }), onIconChange: vi.fn() });

    const title = screen.getByText("Minha tarefa");
    const iconTrigger = screen.getByRole("button", { name: "Definir ícone" });
    const statusIndicator = screen.getByLabelText(`Status: ${STATUS_LABELS.todo}`);

    // A linha do título e a linha de metadados são irmãs; o trigger de ícone deve estar no mesmo
    // container que o indicador de status (metadados), não no container do título.
    expect(iconTrigger.parentElement).toBe(statusIndicator.parentElement);
    expect(iconTrigger.parentElement).not.toBe(title.parentElement);
  });

  it("mostra o ícone de status correto por coluna (todo/doing/done) no Kanban", () => {
    const { container: todoContainer } = renderKanbanCard({ task: makeTask({ status: "todo" }) });
    expect(todoContainer.querySelector("svg.lucide-circle")).toBeInTheDocument();

    const { container: doingContainer } = renderKanbanCard({ task: makeTask({ status: "doing" }) });
    expect(doingContainer.querySelector("svg.lucide-circle-dashed")).toBeInTheDocument();

    const { container: doneContainer } = renderKanbanCard({
      task: makeTask({ status: "done", linked_recurring_id: "recurring-1" }),
    });
    expect(doneContainer.querySelector("svg.lucide-circle-check")).toBeInTheDocument();
  });
});

describe("KanbanCard — subtarefas agrupadas como mini-cards (feature 047)", () => {
  it("com subtasks, renderiza um mini-card por subtarefa, não mais um checklist de checkboxes", () => {
    const subtask1 = makeTask({ id: "sub-1", title: "Subtarefa A", parent_task_id: "task-1" });
    const subtask2 = makeTask({
      id: "sub-2",
      title: "Subtarefa B",
      parent_task_id: "task-1",
      status: "done",
    });
    renderKanbanCard({ subtasks: [subtask1, subtask2] });

    // Mini-cards reais (título em texto normal), não `<input type="checkbox">`.
    expect(screen.getByText("Subtarefa A")).toBeInTheDocument();
    expect(screen.getByText("Subtarefa B")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    // Cada mini-card ganha seu próprio botão redondo de concluir/reabrir, substituindo o checkbox
    // do checklist antigo (um "Concluir subtarefa" pra `todo`, um "Reabrir subtarefa" pra `done`).
    expect(screen.getByRole("button", { name: "Concluir subtarefa" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reabrir subtarefa" })).toBeInTheDocument();
  });

  it("mini-card de subtarefa não tem handle de arrastar — só o card do pai é sortable", () => {
    const subtask = makeTask({ id: "sub-1", title: "Subtarefa A", parent_task_id: "task-1" });
    renderKanbanCard({ subtasks: [subtask] });

    // Só existe um botão "Arrastar tarefa" na árvore: o do card-pai. O mini-card da subtarefa não
    // ganha o seu próprio `GripVertical`/listeners de `useSortable`.
    expect(screen.getAllByRole("button", { name: "Arrastar tarefa" })).toHaveLength(1);
  });

  it("clicar no mini-card de subtarefa abre o form completo de edição (onOpenSubtask com a subtarefa)", async () => {
    const user = userEvent.setup();
    const subtask = makeTask({ id: "sub-1", title: "Subtarefa A", parent_task_id: "task-1" });
    const onOpenSubtask = vi.fn();
    renderKanbanCard({ subtasks: [subtask], onOpenSubtask });

    await user.click(screen.getByText("Subtarefa A"));

    expect(onOpenSubtask).toHaveBeenCalledWith(subtask);
  });

  it("com subtaskActions, o Select de status do mini-card chama onStatusChange sem mover o mini-card pra fora do card do pai", async () => {
    const user = userEvent.setup();
    const parentTask = makeTask({ id: "task-1", title: "Tarefa pai", status: "todo" });
    // Status deliberadamente diferente do pai — prova que a subtarefa fica agrupada sob o pai
    // independente do próprio status (decisão da feature 047: subtarefa nunca vira card solto
    // numa coluna própria).
    const subtask = makeTask({
      id: "sub-1",
      title: "Subtarefa A",
      parent_task_id: "task-1",
      status: "done",
    });
    const onStatusChange = vi.fn();
    const { container } = renderKanbanCard({
      task: parentTask,
      subtasks: [subtask],
      subtaskActions: { onDelete: vi.fn(), onStatusChange },
    });

    const parentArticle = container.querySelector("article") as HTMLElement;
    expect(within(parentArticle).getByText("Subtarefa A")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: `Status: ${STATUS_LABELS.done}` }));
    await user.click(await screen.findByText(STATUS_LABELS.todo));

    expect(onStatusChange).toHaveBeenCalledWith(subtask, "todo");
    // A subtarefa continua dentro do mesmo `<article>` do card-pai depois da interação — nunca
    // migra pra outra coluna/DOM separado.
    expect(within(parentArticle).getByText("Subtarefa A")).toBeInTheDocument();
  });

  it("sem subtaskActions, o status do mini-card aparece somente-leitura (sem Select clicável)", () => {
    const subtask = makeTask({
      id: "sub-1",
      title: "Subtarefa A",
      parent_task_id: "task-1",
      status: "doing",
    });
    renderKanbanCard({ subtasks: [subtask] });

    expect(
      screen.queryByRole("combobox", { name: `Status: ${STATUS_LABELS.doing}` })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(`Status: ${STATUS_LABELS.doing}`)).toBeInTheDocument();
  });
});

describe("TaskListRow — mesmo TaskQuickFields compartilhado com o Kanban (feature 033)", () => {
  it("com onPriorityChange, o quick-edit de prioridade fica clicável e chama onPriorityChange na Lista", async () => {
    const user = userEvent.setup();
    const onPriorityChange = vi.fn();
    renderTaskListRow({ task: makeTask({ priority: null }), onPriorityChange });

    await user.click(screen.getByRole("button", { name: "Definir prioridade" }));
    await user.click(await screen.findByRole("button", { name: "Alta" }));

    expect(onPriorityChange).toHaveBeenCalledWith("high");
  });

  it("com icon_key definido na task, o TaskIconBadge somente-leitura aparece na linha (feature 035)", () => {
    const { container } = renderTaskListRow({ task: makeTask({ icon_key: "flag", icon_url: null }) });
    expect(container.querySelector('svg[aria-label="Bandeira"]')).toBeInTheDocument();
  });

  it("com onIconChange, o quick-edit de ícone fica clicável e chama onIconChange na Lista (feature 035)", async () => {
    const user = userEvent.setup();
    const onIconChange = vi.fn();
    renderTaskListRow({ task: makeTask({ icon_key: null, icon_url: null }), onIconChange });

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    await user.click(await screen.findByRole("button", { name: "Estrela" }));

    expect(onIconChange).toHaveBeenCalledWith({ icon_key: "star", icon_url: null });
  });

  it("mostra só o ícone de status no trigger fechado do Select da Lista, sem o texto do label (feature 040)", () => {
    const { container } = renderTaskListRow({ task: makeTask({ status: "doing" }) });

    const trigger = screen.getByRole("combobox", { name: `Status: ${STATUS_LABELS.doing}` });
    expect(trigger).not.toHaveTextContent(STATUS_LABELS.doing);
    expect(trigger).toHaveAttribute("title", STATUS_LABELS.doing);
    expect(container.querySelector("svg.lucide-circle-dashed")).toBeInTheDocument();
  });

  it("abrir a lista de opções de status ainda mostra ícone + texto em cada item (feature 040)", async () => {
    const user = userEvent.setup();
    renderTaskListRow({ task: makeTask({ status: "todo" }) });

    await user.click(screen.getByRole("combobox", { name: `Status: ${STATUS_LABELS.todo}` }));

    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText(STATUS_LABELS.todo)).toBeInTheDocument();
    expect(within(listbox).getByText(STATUS_LABELS.doing)).toBeInTheDocument();
    expect(within(listbox).getByText(STATUS_LABELS.done)).toBeInTheDocument();
  });

  it("o trigger de ícone aparece na linha de metadados, não mais na linha do título (feature 040)", () => {
    renderTaskListRow({ task: makeTask({ icon_key: null, icon_url: null }), onIconChange: vi.fn() });

    const title = screen.getByText("Minha tarefa");
    const iconTrigger = screen.getByRole("button", { name: "Definir ícone" });
    const statusTrigger = screen.getByRole("combobox", { name: `Status: ${STATUS_LABELS.todo}` });

    // A linha do título e a linha de metadados são irmãs; o trigger de ícone deve estar no mesmo
    // container que o Select de status (metadados), não no container do título.
    expect(iconTrigger.parentElement).toBe(statusTrigger.parentElement);
    expect(iconTrigger.parentElement).not.toBe(title.parentElement);
  });
});

describe("TaskListRow — subtarefas agrupadas como linhas reais (feature 046)", () => {
  it("expandir uma tarefa com subtarefas renderiza uma TaskListRow por subtarefa, não mais um checklist de checkboxes", () => {
    const subtask1 = makeTask({ id: "sub-1", title: "Subtarefa A", parent_task_id: "task-1" });
    const subtask2 = makeTask({ id: "sub-2", title: "Subtarefa B", parent_task_id: "task-1" });
    renderTaskListRow({
      subtasks: [subtask1, subtask2],
      expanded: true,
      subtaskActions: {
        onDelete: vi.fn(),
        onStatusChange: vi.fn(),
      },
    });

    // Linhas reais (título em texto normal), não `<input type="checkbox">`.
    expect(screen.getByText("Subtarefa A")).toBeInTheDocument();
    expect(screen.getByText("Subtarefa B")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    // Cada subtarefa ganha seu próprio botão "Concluir tarefa" — mesmo quick action de uma linha
    // de topo, substituindo o checkbox do checklist antigo. Total é 3: a linha de topo (`task-1`,
    // não concluída) mais as 2 subtarefas, cada uma com o seu.
    expect(screen.getAllByRole("button", { name: "Concluir tarefa" })).toHaveLength(3);
  });

  it("a linha da subtarefa não tem seu próprio botão de expandir subtarefas", () => {
    const subtask = makeTask({ id: "sub-1", title: "Subtarefa A", parent_task_id: "task-1" });
    renderTaskListRow({
      subtasks: [subtask],
      expanded: true,
      subtaskActions: { onDelete: vi.fn(), onStatusChange: vi.fn() },
    });

    // A linha de topo continua com o seu próprio botão de expandir/recolher subtarefas (ela tem 1
    // subtarefa) — já renderizada expandida aqui, então o label é "Recolher subtarefas".
    expect(screen.getByRole("button", { name: "Recolher subtarefas" })).toBeInTheDocument();

    // A linha da subtarefa (aninhada) não ganha o seu próprio botão de expandir/recolher — `isNested`
    // desliga o `ExpandSubtasksButton` independentemente de ela ter subtarefas (`subtasks` da linha
    // aninhada é sempre `[]` — sem 3º nível, modelo de 2 níveis da feature 036).
    const subtaskRow = screen.getByText("Subtarefa A").closest(".cursor-pointer") as HTMLElement;
    expect(within(subtaskRow).queryByRole("button", { name: /subtarefas/i })).not.toBeInTheDocument();
  });

  it("os quick actions da linha de subtarefa chamam os handlers certos com o task.id da subtarefa", async () => {
    const user = userEvent.setup();
    const subtask = makeTask({
      id: "sub-1",
      title: "Subtarefa A",
      parent_task_id: "task-1",
      priority: null,
      icon_key: null,
      icon_url: null,
    });
    const onPriorityChange = vi.fn();
    const onIconChange = vi.fn();
    const onDelete = vi.fn();
    const onStatusChange = vi.fn();
    renderTaskListRow({
      subtasks: [subtask],
      expanded: true,
      subtaskActions: {
        onDelete,
        onStatusChange,
        onPriorityChange,
        onIconChange,
      },
    });

    await user.click(screen.getByRole("button", { name: "Definir prioridade" }));
    await user.click(await screen.findByRole("button", { name: "Alta" }));
    expect(onPriorityChange).toHaveBeenCalledWith(subtask, "high");

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    await user.click(await screen.findByRole("button", { name: "Estrela" }));
    expect(onIconChange).toHaveBeenCalledWith(subtask, { icon_key: "star", icon_url: null });

    // Status: o Select inline da linha da subtarefa chama `onStatusChange` com a subtarefa. A
    // linha de topo (`task-1`) também está em "A fazer" e também tem um Select próprio, então o
    // combobox precisa ser buscado escopado à linha da subtarefa, não `screen` inteiro.
    const subtaskRow = screen.getByText("Subtarefa A").closest(".cursor-pointer") as HTMLElement;
    await user.click(within(subtaskRow).getByRole("combobox", { name: `Status: ${STATUS_LABELS.todo}` }));
    await user.click(await screen.findByText(STATUS_LABELS.doing));
    expect(onStatusChange).toHaveBeenCalledWith(subtask, "doing");

    // Excluir: abre o `TaskDeleteDialog` da linha da subtarefa e confirma — chama `onDelete` com
    // a subtarefa, não com a tarefa-mãe.
    const deleteTrigger = subtaskRow.querySelector("button.text-destructive") as HTMLButtonElement;
    expect(deleteTrigger).toBeTruthy();
    await user.click(deleteTrigger);
    await user.click(await screen.findByRole("button", { name: "Excluir" }));
    expect(onDelete).toHaveBeenCalledWith(subtask);
  });

  it("clicar na linha da subtarefa abre o form completo de edição (onOpenSubtask com a subtarefa)", async () => {
    const user = userEvent.setup();
    const subtask = makeTask({ id: "sub-1", title: "Subtarefa A", parent_task_id: "task-1" });
    const onOpenSubtask = vi.fn();
    renderTaskListRow({
      subtasks: [subtask],
      expanded: true,
      onOpenSubtask,
      subtaskActions: { onDelete: vi.fn(), onStatusChange: vi.fn() },
    });

    await user.click(screen.getByText("Subtarefa A"));

    expect(onOpenSubtask).toHaveBeenCalledWith(subtask);
  });

  it("sem subtarefas ou recolhida, não renderiza nenhuma TaskListRow aninhada", () => {
    const subtask = makeTask({ id: "sub-1", title: "Subtarefa A", parent_task_id: "task-1" });
    renderTaskListRow({ subtasks: [subtask], expanded: false });

    expect(screen.queryByText("Subtarefa A")).not.toBeInTheDocument();
  });
});
