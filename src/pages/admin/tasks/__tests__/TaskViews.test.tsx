import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { KanbanCard, TaskListRow, STATUS_LABELS } from "@/pages/admin/tasks/TaskViews";
import { formatDateTimeBR } from "@/lib/currency";
import { fetchNotes } from "@/api/notes/notes";
import { invalidateNotesTitleIndex } from "@/hooks/useNotesTitleIndex";
import type { Project, Task, TaskExternalLink } from "@/types/tasks";
import type { Note } from "@/types/notes";

vi.mock("@/api/notes/notes", () => ({
  fetchNotes: vi.fn(),
}));

beforeEach(() => {
  invalidateNotesTitleIndex();
  vi.mocked(fetchNotes).mockResolvedValue([]);
});

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
    <MemoryRouter>
      <TaskListRow
        task={task}
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
    </MemoryRouter>
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
      // Feature 070: o payload da edição rápida passou a carregar a flag de tarefa pontual.
      is_quick: false,
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

  it("ordena os mini-cards por prazo, depois prioridade, depois criação", () => {
    renderKanbanCard({
      subtasks: [
        makeTask({
          id: "undated-high",
          title: "Alta sem prazo",
          parent_task_id: "task-1",
          due_date: null,
          priority: "high",
        }),
        makeTask({
          id: "dated-late",
          title: "Prazo tarde",
          parent_task_id: "task-1",
          due_date: "2026-09-20",
        }),
        makeTask({
          id: "dated-soon",
          title: "Prazo cedo",
          parent_task_id: "task-1",
          due_date: "2026-09-10",
        }),
        makeTask({
          id: "undated-old",
          title: "Antiga sem prazo",
          parent_task_id: "task-1",
          due_date: null,
          created_at: "2026-01-01T00:00:00Z",
        }),
      ],
    });

    const titles = screen
      .getAllByText(/^(Alta sem prazo|Prazo tarde|Prazo cedo|Antiga sem prazo|Minha tarefa)$/)
      .map((el) => el.textContent ?? "");
    expect(titles).toEqual([
      "Minha tarefa",
      "Prazo cedo",
      "Prazo tarde",
      "Alta sem prazo",
      "Antiga sem prazo",
    ]);
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

  it("ordena as linhas aninhadas por prazo, depois prioridade, depois criação", () => {
    renderTaskListRow({
      subtasks: [
        makeTask({
          id: "undated-high",
          title: "Alta sem prazo",
          parent_task_id: "task-1",
          due_date: null,
          priority: "high",
        }),
        makeTask({
          id: "dated-late",
          title: "Prazo tarde",
          parent_task_id: "task-1",
          due_date: "2026-09-20",
        }),
        makeTask({
          id: "undated-old",
          title: "Antiga sem prazo",
          parent_task_id: "task-1",
          due_date: null,
          priority: null,
          created_at: "2026-01-01T00:00:00Z",
        }),
        makeTask({
          id: "dated-soon",
          title: "Prazo cedo",
          parent_task_id: "task-1",
          due_date: "2026-09-10",
        }),
      ],
      expanded: true,
      subtaskActions: { onDelete: vi.fn(), onStatusChange: vi.fn() },
    });

    const titles = screen
      .getAllByText(/^(Alta sem prazo|Prazo tarde|Antiga sem prazo|Prazo cedo|Minha tarefa)$/)
      .map((el) => el.textContent ?? "");
    expect(titles).toEqual([
      "Minha tarefa",
      "Prazo cedo",
      "Prazo tarde",
      "Alta sem prazo",
      "Antiga sem prazo",
    ]);
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

/**
 * Botão "Imediatamente" (feature 078) — a superfície da ação nas duas visões que já tinham Play.
 * O rótulo por extenso vive no `aria-label`/tooltip, então é por ele que o botão é encontrado.
 */
describe("TaskViews — botão Imediatamente (feature 078)", () => {
  const startNowName = /Imediatamente/;

  it("aparece na linha da Lista quando `onStartNow` é passado e dispara o handler no clique", async () => {
    const user = userEvent.setup();
    const onStartNow = vi.fn();
    renderTaskListRow({ onStartNow });

    const button = screen.getByRole("button", { name: startNowName });
    expect(button).toBeInTheDocument();
    await user.click(button);
    expect(onStartNow).toHaveBeenCalledTimes(1);
  });

  it("aparece no card do Kanban quando `onStartNow` é passado e dispara o handler no clique", async () => {
    const user = userEvent.setup();
    const onStartNow = vi.fn();
    renderKanbanCard({ onStartNow });

    const button = screen.getByRole("button", { name: startNowName });
    expect(button).toBeInTheDocument();
    await user.click(button);
    expect(onStartNow).toHaveBeenCalledTimes(1);
  });

  it("some quando a prop não é passada (mesmo padrão opcional do Play)", () => {
    renderTaskListRow();
    expect(screen.queryByRole("button", { name: startNowName })).not.toBeInTheDocument();
  });

  it("some no card do Kanban quando a prop não é passada", () => {
    renderKanbanCard();
    expect(screen.queryByRole("button", { name: startNowName })).not.toBeInTheDocument();
  });

  it("some em tarefa concluída, na linha e no card", () => {
    const done = makeTask({ status: "done" });
    const { unmount } = renderTaskListRow({ task: done, onStartNow: vi.fn() });
    expect(screen.queryByRole("button", { name: startNowName })).not.toBeInTheDocument();
    unmount();

    renderKanbanCard({ task: done, onStartNow: vi.fn() });
    expect(screen.queryByRole("button", { name: startNowName })).not.toBeInTheDocument();
  });

  it("fica desabilitado enquanto a ação está em voo (`isStartingNow`)", () => {
    renderTaskListRow({ onStartNow: vi.fn(), isStartingNow: true });
    expect(screen.getByRole("button", { name: startNowName })).toBeDisabled();
  });

  it("a linha aninhada de subtarefa ganha o mesmo botão, bindado na subtarefa", async () => {
    const user = userEvent.setup();
    const subtask = makeTask({ id: "sub-1", title: "Subtarefa A", parent_task_id: "task-1" });
    const onStartNow = vi.fn();
    renderTaskListRow({
      subtasks: [subtask],
      expanded: true,
      subtaskActions: { onDelete: vi.fn(), onStatusChange: vi.fn(), onStartNow },
    });

    const subtaskRow = screen.getByText("Subtarefa A").closest(".cursor-pointer") as HTMLElement;
    await user.click(within(subtaskRow).getByRole("button", { name: startNowName }));

    expect(onStartNow).toHaveBeenCalledWith(subtask);
  });

  /**
   * Largura no mobile: o botão a mais não pode empurrar o conteúdo pra fora da linha/card — a `072`
   * já teve de apertar o `gap` do player pelo mesmo motivo. O que segura isso é estrutural (bloco
   * de ações `shrink-0`, conteúdo `min-w-0` + título `truncate`) e o botão ter a mesma caixa
   * compacta dos vizinhos; é isso que as asserções travam.
   */
  it("na linha, o botão tem a mesma caixa do Play e o título continua podendo truncar", () => {
    renderTaskListRow({ onStartNow: vi.fn(), onToggleTimer: vi.fn() });

    const startNow = screen.getByRole("button", { name: startNowName });
    const play = screen.getByRole("button", { name: "Iniciar timer" });
    expect(startNow.className).toContain("h-8");
    expect(startNow.className).toContain("w-8");
    expect(play.className).toContain("h-8");

    const actions = startNow.parentElement as HTMLElement;
    expect(actions.className).toContain("shrink-0");
    expect(actions.className).toContain("gap-1");

    const title = screen.getByText("Minha tarefa");
    expect(title.className).toContain("truncate");
    expect((title.closest("div.min-w-0") as HTMLElement).className).toContain("flex-1");
  });

  it("no card do Kanban, o botão usa a caixa apertada (7x7) dos vizinhos", () => {
    renderKanbanCard({ onStartNow: vi.fn(), onToggleTimer: vi.fn() });

    const startNow = screen.getByRole("button", { name: startNowName });
    expect(startNow.className).toContain("h-7");
    expect(startNow.className).toContain("w-7");

    const actions = startNow.parentElement as HTMLElement;
    expect(actions.className).toContain("shrink-0");

    const title = screen.getByText("Minha tarefa");
    expect(title.className).toContain("truncate");
  });

  it("sem `onStartNow` em `subtaskActions`, a linha aninhada não mostra o botão", () => {
    const subtask = makeTask({ id: "sub-1", title: "Subtarefa A", parent_task_id: "task-1" });
    renderTaskListRow({
      subtasks: [subtask],
      expanded: true,
      subtaskActions: { onDelete: vi.fn(), onStatusChange: vi.fn() },
    });

    const subtaskRow = screen.getByText("Subtarefa A").closest(".cursor-pointer") as HTMLElement;
    expect(
      within(subtaskRow).queryByRole("button", { name: startNowName })
    ).not.toBeInTheDocument();
  });
});

/**
 * Feature 085 — os chips de link externo. O pedido de 2026-08-23 é literal ("todos com a gestão de
 * ícones+preview"): **um chip por link**, não o primeiro com um contador. O orçamento visual é de 3
 * chips; o resto vira um "+N".
 */
function makeLink(over: Partial<TaskExternalLink> & { url: string }): TaskExternalLink {
  return { id: `l-${over.url}`, task_id: "task-1", comment: null, position: 0, ...over };
}

describe("ExternalLinkChip — um chip por link (feature 085)", () => {
  it("com um link, o rótulo é o de sempre (GitHub continua saindo como owner/repo#N)", () => {
    renderTaskListRow({
      externalLinksByTask: {
        "task-1": [makeLink({ url: "https://github.com/owner/repo/issues/7" })],
      },
    });

    const chip = screen.getByRole("link", { name: "owner/repo#7" });
    expect(chip).toHaveAttribute("href", "https://github.com/owner/repo/issues/7");
    expect(chip).toHaveAttribute("target", "_blank");
  });

  it("com três links, saem três chips, cada um com o próprio rótulo e o próprio comentário no title", () => {
    renderTaskListRow({
      externalLinksByTask: {
        "task-1": [
          makeLink({ url: "https://github.com/owner/repo/issues/7", comment: "issue de origem", position: 0 }),
          makeLink({ url: "https://docs.google.com/document/d/abc", comment: "contrato", position: 1 }),
          makeLink({ url: "https://www.figma.com/file/abc", comment: "protótipo", position: 2 }),
        ],
      },
    });

    expect(screen.getByRole("link", { name: "owner/repo#7" })).toHaveAttribute(
      "title",
      "issue de origem"
    );
    expect(screen.getByRole("link", { name: "docs.google.com" })).toHaveAttribute(
      "title",
      "contrato"
    );
    // O `www.` some do rótulo, mas o href continua a URL crua.
    const figma = screen.getByRole("link", { name: "figma.com" });
    expect(figma).toHaveAttribute("title", "protótipo");
    expect(figma).toHaveAttribute("href", "https://www.figma.com/file/abc");
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("link sem comentário cai na URL no title (melhor do que title nenhum)", () => {
    renderTaskListRow({
      externalLinksByTask: { "task-1": [makeLink({ url: "https://exemplo.com/x" })] },
    });
    expect(screen.getByRole("link", { name: "exemplo.com" })).toHaveAttribute(
      "title",
      "https://exemplo.com/x"
    );
  });

  it("com cinco links, saem três chips e um +2 com os rótulos restantes no title", () => {
    renderTaskListRow({
      externalLinksByTask: {
        "task-1": [
          makeLink({ url: "https://a.com", position: 0 }),
          makeLink({ url: "https://b.com", position: 1 }),
          makeLink({ url: "https://c.com", position: 2 }),
          makeLink({ url: "https://d.com", position: 3 }),
          makeLink({ url: "https://e.com", position: 4 }),
        ],
      },
    });

    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "a.com" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "d.com" })).not.toBeInTheDocument();

    const more = screen.getByText("+2");
    expect(more).toHaveAttribute("title", "d.com, e.com");
    expect(more).toHaveAttribute("aria-label", "Mais 2 links: d.com, e.com");
  });

  it("sem link nenhum não há chip (nem mapa, nem lista vazia)", () => {
    const { unmount } = renderTaskListRow();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    unmount();

    renderTaskListRow({ externalLinksByTask: { "task-1": [] } });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("o Kanban mostra os mesmos chips que a Lista, da mesma lista em lote", () => {
    renderKanbanCard({
      externalLinksByTask: {
        "task-1": [
          makeLink({ url: "https://github.com/owner/repo/pull/3", comment: "PR", position: 0 }),
          makeLink({ url: "https://notion.so/x", position: 1 }),
        ],
      },
    });

    expect(screen.getByRole("link", { name: "owner/repo#3" })).toHaveAttribute("title", "PR");
    expect(screen.getByRole("link", { name: "notion.so" })).toBeInTheDocument();
  });

  it("clicar no chip não abre o formulário da tarefa (o clique para no link)", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderTaskListRow({
      onEdit,
      externalLinksByTask: { "task-1": [makeLink({ url: "https://exemplo.com" })] },
    });

    await user.click(screen.getByRole("link", { name: "exemplo.com" }));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("a linha aninhada da subtarefa mostra os links dela, não os da tarefa-mãe", () => {
    const parent = makeTask({ id: "task-1", title: "Mãe" });
    const child = makeTask({ id: "sub-1", parent_task_id: "task-1", title: "Filha" });
    renderTaskListRow({
      task: parent,
      subtasks: [child],
      expanded: true,
      subtaskActions: {
        onDelete: vi.fn(),
        onStatusChange: vi.fn(),
      },
      externalLinksByTask: {
        "task-1": [makeLink({ url: "https://mae.com" })],
        "sub-1": [makeLink({ url: "https://filha.com", task_id: "sub-1" })],
      },
    });

    expect(screen.getByRole("link", { name: "mae.com" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "filha.com" })).toBeInTheDocument();
  });
});

describe("TaskViews — wiki-link na descrição do card", () => {
  beforeEach(() => {
    invalidateNotesTitleIndex();
    vi.mocked(fetchNotes).mockResolvedValue([]);
  });

  function makeNote(overrides: Partial<Note> = {}): Note {
    return {
      id: "n-finatec",
      title: "Atividades Finatec",
      content: "",
      project_id: null,
      kind: "markdown",
      canvas_data: null,
      ...overrides,
    };
  }

  it("[[wiki-link]] vira link para a nota e o clique não abre o formulário da tarefa", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    vi.mocked(fetchNotes).mockResolvedValue([makeNote()]);

    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <Routes>
          <Route
            path="/tasks"
            element={
              <TaskListRow
                task={makeTask({
                  description: "Ata reunião 01/09/2026 em: [[Atividades Finatec]]",
                })}
                subtasks={[]}
                allTags={[]}
                expanded={false}
                onToggleExpand={vi.fn()}
                onToggleSubtask={vi.fn()}
                onOpenSubtask={vi.fn()}
                onToggleDone={vi.fn()}
                onStatusChange={vi.fn()}
                onOpenSeries={vi.fn()}
                onEdit={onEdit}
                onDelete={vi.fn()}
              />
            }
          />
          <Route path="/notes/:id" element={<p data-testid="note-page">nota</p>} />
        </Routes>
      </MemoryRouter>
    );

    const link = await screen.findByRole("link", { name: "Atividades Finatec" });
    expect(link).toHaveAttribute("href", "/notes/n-finatec");
    await user.click(link);
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByTestId("note-page")).toHaveTextContent("nota");
  });

  it("no Kanban o wiki-link também aponta para a nota", async () => {
    vi.mocked(fetchNotes).mockResolvedValue([makeNote()]);
    renderKanbanCard({
      task: makeTask({
        description: "Ata reunião 01/09/2026 em: [[Atividades Finatec]]",
      }),
    });
    expect(await screen.findByRole("link", { name: "Atividades Finatec" })).toHaveAttribute(
      "href",
      "/notes/n-finatec"
    );
  });
});
