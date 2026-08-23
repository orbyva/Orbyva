import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProjectDetail from "@/pages/admin/tasks/ProjectDetail";
import {
  fetchDependencies,
  fetchProjectById,
  fetchProjectEvents,
  fetchTags,
  fetchTasks,
  updateTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Project, Task } from "@/types/tasks";

/**
 * Cobre a feature 036 em `ProjectDetail.tsx` — a mesma tela replica o padrão de `TaskList.tsx`
 * (form completo pra editar subtarefa, prazo limitado ao da mãe, sem recorrência própria, sem
 * sub-subtarefas). A checagem de satisfação da feature encontrou uma tarefa marcada `[x]` que na
 * verdade não tinha sido feita aqui: `TaskSubtasksField` (aba Organização) não estava escondido ao
 * editar uma subtarefa em `ProjectDetail.tsx` (só em `TaskList.tsx` tinha o guard
 * `!editing?.parent_task_id`) — corrigido nesta sessão, coberto abaixo pra não regredir.
 */

vi.mock("@/api/tasks", () => ({
  fetchProjectById: vi.fn(),
  fetchTasks: vi.fn(),
  fetchTags: vi.fn(),
  fetchDependencies: vi.fn(),
  fetchProjectEvents: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  deleteTasks: vi.fn(),
  createTag: vi.fn(),
  uploadTaskIcon: vi.fn(),
  updateProject: vi.fn(),
  createProjectEvent: vi.fn(),
  deleteProjectEvent: vi.fn(),
}));

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn(),
  createRecurringApi: vi.fn(),
}));

vi.mock("@/hooks/useDimensions", () => ({
  useDimensions: () => ({ dimensions: [], loading: false, error: null, refetch: vi.fn() }),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const mockedFetchProjectById = vi.mocked(fetchProjectById);
const mockedFetchTasks = vi.mocked(fetchTasks);
const mockedFetchTags = vi.mocked(fetchTags);
const mockedFetchDependencies = vi.mocked(fetchDependencies);
const mockedFetchRecurringTransactions = vi.mocked(fetchRecurringTransactions);
const mockedFetchProjectEvents = vi.mocked(fetchProjectEvents);
const mockedUpdateTask = vi.mocked(updateTask);

const PROJECT_ID = "project-1";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: PROJECT_ID,
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
  return { id: PROJECT_ID, name: "Projeto X", status: "active", tag_ids: [], ...overrides };
}

async function renderWithTasks(tasks: Task[], project: Project = makeProject()) {
  mockedFetchProjectById.mockResolvedValue(project);
  mockedFetchTasks.mockResolvedValue(tasks);
  mockedFetchTags.mockResolvedValue([]);
  mockedFetchDependencies.mockResolvedValue([]);
  mockedFetchRecurringTransactions.mockResolvedValue([]);
  mockedFetchProjectEvents.mockResolvedValue([]);

  const utils = render(
    <MemoryRouter initialEntries={[`/tasks/projects/${PROJECT_ID}`]}>
      <Routes>
        <Route path="/tasks/projects/:id" element={<ProjectDetail />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByText(tasks.find((t) => !t.parent_task_id)!.title);
  return utils;
}

/** `ProjectDetail` abre por padrão na visão Kanban — `KanbanCard` mostra os mini-cards de
 * subtarefa direto (sem botão "Expandir subtarefas", diferente de `TaskListRow`). Clicar no
 * título do mini-card (não mais um `<button>` — feature 047 trocou o checklist de checkboxes por
 * mini-cards clicáveis) abre o form completo via `onOpenSubtask`. */
async function openSubtaskFromChecklist(user: ReturnType<typeof userEvent.setup>, subtaskTitle: string) {
  await user.click(screen.getByText(subtaskTitle));
}

describe("ProjectDetail — edição de subtarefa abre o form completo (feature 036)", () => {
  beforeEach(() => {
    toastMock.mockReset();
    mockedUpdateTask.mockReset();
    mockedUpdateTask.mockResolvedValue(undefined);
  });

  it("o painel esconde o campo Subtarefas ao editar uma subtarefa (regressão: faltava o guard nesta tela)", async () => {
    const user = userEvent.setup();
    const parent = makeTask({ id: "parent-1", title: "Tarefa principal", due_date: "2026-08-20" });
    const subtask = makeTask({
      id: "sub-1",
      parent_task_id: "parent-1",
      title: "Subtarefa filha",
      due_date: "2026-08-10",
    });
    await renderWithTasks([parent, subtask]);

    await openSubtaskFromChecklist(user, "Subtarefa filha");
    const dialog = within(screen.getByRole("dialog"));

    expect(dialog.queryByRole("button", { name: /Subtarefas/ })).not.toBeInTheDocument();
    expect(dialog.queryByPlaceholderText("Adicionar subtarefa")).not.toBeInTheDocument();
    expect(dialog.getByText("Tags")).toBeInTheDocument();
    expect(dialog.getByText("Link externo")).toBeInTheDocument();
  });

  it("o painel mostra o campo Subtarefas normalmente ao editar uma tarefa de topo", async () => {
    const user = userEvent.setup();
    const parent = makeTask({ id: "parent-1", title: "Tarefa principal" });
    await renderWithTasks([parent]);

    await user.click(screen.getByText("Tarefa principal"));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Subtarefas/ }));

    expect(
      within(screen.getByRole("dialog")).getByPlaceholderText("Adicionar subtarefa")
    ).toBeInTheDocument();
  });

  it("abrir uma subtarefa pelo checklist abre o mesmo painel completo, com tudo visível de uma vez", async () => {
    const user = userEvent.setup();
    const parent = makeTask({ id: "parent-1", title: "Tarefa principal", due_date: "2026-08-20" });
    const subtask = makeTask({
      id: "sub-1",
      parent_task_id: "parent-1",
      title: "Subtarefa filha",
      due_date: "2026-08-10",
    });
    await renderWithTasks([parent, subtask]);

    await openSubtaskFromChecklist(user, "Subtarefa filha");

    expect(screen.getByText("Editar tarefa")).toBeInTheDocument();
    // Feature 080: sem abas — os campos convivem no mesmo painel.
    const dialog = within(screen.getByRole("dialog"));
    expect(screen.queryByRole("tab", { name: "Geral" })).not.toBeInTheDocument();
    expect(dialog.getByLabelText(/^Título/)).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: /Descrição/ })).toBeInTheDocument();
    expect(dialog.getByText("Data limite")).toBeInTheDocument();
    expect(dialog.getByText("Tags")).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: /Registros de tempo/ })).toBeInTheDocument();
  });

  it("subtarefa mostra só Data limite/Horário, sem recorrência", async () => {
    const user = userEvent.setup();
    const parent = makeTask({ id: "parent-1", title: "Tarefa principal", due_date: "2026-08-20" });
    const subtask = makeTask({
      id: "sub-1",
      parent_task_id: "parent-1",
      title: "Subtarefa filha",
      due_date: "2026-08-10",
    });
    await renderWithTasks([parent, subtask]);

    await openSubtaskFromChecklist(user, "Subtarefa filha");
    const dialog = within(screen.getByRole("dialog"));

    expect(dialog.getByText("Data limite")).toBeInTheDocument();
    expect(dialog.queryByRole("button", { name: /Repetição da tarefa/ })).not.toBeInTheDocument();
    expect(dialog.queryByText("Esta tarefa se repete?")).not.toBeInTheDocument();
    expect(dialog.queryByText("Início")).not.toBeInTheDocument();
  });

  it("isSubtaskDueDateValid bloqueia salvar com prazo além do prazo da mãe: aviso no campo + toast de erro", async () => {
    const user = userEvent.setup();
    const parent = makeTask({ id: "parent-1", title: "Tarefa principal", due_date: "2026-08-20" });
    const subtask = makeTask({
      id: "sub-1",
      parent_task_id: "parent-1",
      title: "Subtarefa filha",
      due_date: "2026-08-25",
    });
    await renderWithTasks([parent, subtask]);

    await openSubtaskFromChecklist(user, "Subtarefa filha");

    // Feature 080: o campo avisa sozinho, antes de qualquer tentativa de salvar.
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(
      "O prazo não pode passar de 20/08/2026, prazo da tarefa principal."
    );

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Erro",
        description: expect.stringContaining("O prazo não pode passar de 20/08/2026"),
        variant: "destructive",
      })
    );
    expect(mockedUpdateTask).not.toHaveBeenCalled();
  });
});
