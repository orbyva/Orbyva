import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TaskList from "@/pages/admin/tasks/TaskList";
import { fetchDependencies, fetchProjects, fetchTags, fetchTasks, updateTask } from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Project, Task } from "@/types/tasks";

/**
 * Cobre a feature 036 (subtarefa é uma tarefa completa, não uma entidade reduzida): abrir uma
 * subtarefa a partir do checklist passou a abrir o mesmo dialog completo usado por tarefas de
 * topo (`setEditing`/`setFormTab("geral")`), em vez do `SubtaskEditDialog` removido, mantendo as
 * restrições que precisavam sobreviver à migração — prazo não pode passar do prazo da mãe, sem
 * recorrência própria, sem sub-subtarefas, projeto herdado somente-leitura. Substitui o item
 * "Teste manual" que fechava a lista de tarefas por asserções reais de componente (Testing
 * Library + jsdom), já que a skill `next` proíbe Chrome/browser automation como rede de segurança.
 */

vi.mock("@/api/tasks", () => ({
  fetchTasks: vi.fn(),
  fetchProjects: vi.fn(),
  fetchTags: vi.fn(),
  fetchDependencies: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  deleteTasks: vi.fn(),
  createTag: vi.fn(),
  uploadTaskIcon: vi.fn(),
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

const mockedFetchTasks = vi.mocked(fetchTasks);
const mockedFetchProjects = vi.mocked(fetchProjects);
const mockedFetchTags = vi.mocked(fetchTags);
const mockedFetchDependencies = vi.mocked(fetchDependencies);
const mockedFetchRecurringTransactions = vi.mocked(fetchRecurringTransactions);
const mockedUpdateTask = vi.mocked(updateTask);

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

async function renderWithTasks(tasks: Task[], projects: Project[] = []) {
  mockedFetchTasks.mockResolvedValue(tasks);
  mockedFetchProjects.mockResolvedValue(projects);
  mockedFetchTags.mockResolvedValue([]);
  mockedFetchDependencies.mockResolvedValue([]);
  mockedFetchRecurringTransactions.mockResolvedValue([]);

  const utils = render(
    <MemoryRouter>
      <TaskList />
    </MemoryRouter>
  );
  await screen.findByText(tasks.find((t) => !t.parent_task_id)!.title);
  return utils;
}

/** Expande a tarefa-mãe e abre a subtarefa clicando na sua linha aninhada — desde a feature 046,
 * a subtarefa expandida renderiza como uma `TaskListRow` completa (não mais um checklist de
 * checkboxes), então clicar no título da linha (o mesmo caminho de qualquer `TaskListRow`) chama
 * `onEdit`/`onOpenSubtask`. */
async function openSubtaskFromChecklist(user: ReturnType<typeof userEvent.setup>, subtaskTitle: string) {
  await user.click(screen.getByRole("button", { name: "Expandir subtarefas" }));
  await user.click(screen.getByText(subtaskTitle));
}

describe("TaskList — edição de subtarefa abre o form completo (feature 036)", () => {
  beforeEach(() => {
    toastMock.mockReset();
    mockedUpdateTask.mockReset();
    mockedUpdateTask.mockResolvedValue(undefined);
  });

  it("abrir uma subtarefa pelo checklist abre o mesmo dialog completo (não o SubtaskEditDialog removido)", async () => {
    const user = userEvent.setup();
    const project = makeProject();
    const parent = makeTask({
      id: "parent-1",
      title: "Tarefa principal",
      project_id: project.id,
      due_date: "2026-08-20",
    });
    const subtask = makeTask({
      id: "sub-1",
      parent_task_id: "parent-1",
      title: "Subtarefa filha",
      due_date: "2026-08-10",
    });
    await renderWithTasks([parent, subtask], [project]);

    await openSubtaskFromChecklist(user, "Subtarefa filha");

    expect(screen.getByText("Editar tarefa")).toBeInTheDocument();
    // Abas do form completo — Geral/Data e repetição/Organização/Registros de tempo — não o
    // "Título/Descrição/Prazo" reduzido que o SubtaskEditDialog oferecia.
    expect(screen.getByRole("tab", { name: "Geral" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Data e repetição" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Organização" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Registros de tempo" })).toBeInTheDocument();
    // Campos que o SubtaskEditDialog nunca ofereceu, disponíveis de graça no form completo.
    expect(screen.getByText("Prioridade")).toBeInTheDocument();
  });

  it("campo Projeto vira somente-leitura 'Herdado da tarefa principal' ao editar subtarefa", async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: "Projeto Alpha" });
    const parent = makeTask({
      id: "parent-1",
      title: "Tarefa principal",
      project_id: project.id,
      due_date: "2026-08-20",
    });
    const subtask = makeTask({
      id: "sub-1",
      parent_task_id: "parent-1",
      title: "Subtarefa filha",
      project_id: project.id,
      due_date: "2026-08-10",
    });
    await renderWithTasks([parent, subtask], [project]);

    await openSubtaskFromChecklist(user, "Subtarefa filha");
    const dialog = within(screen.getByRole("dialog"));

    expect(dialog.getByText("Herdado da tarefa principal")).toBeInTheDocument();
    expect(dialog.getByText("Projeto Alpha")).toBeInTheDocument();
    // ProjectPicker (listbox clicável) não aparece — o campo não é editável.
    expect(dialog.queryByRole("listbox", { name: "Projeto" })).not.toBeInTheDocument();
  });

  it("editar uma tarefa de topo continua mostrando o ProjectPicker normal (sem 'Herdado')", async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: "Projeto Alpha" });
    const parent = makeTask({ id: "parent-1", title: "Tarefa principal", project_id: project.id });
    await renderWithTasks([parent], [project]);

    await user.click(screen.getByText("Tarefa principal"));

    expect(screen.getByRole("listbox", { name: "Projeto" })).toBeInTheDocument();
    expect(screen.queryByText("Herdado da tarefa principal")).not.toBeInTheDocument();
  });

  it("Organização esconde o campo Subtarefas ao editar uma subtarefa, mantendo Tags/Link externo", async () => {
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
    await user.click(screen.getByRole("tab", { name: "Organização" }));
    const dialog = within(screen.getByRole("dialog"));

    expect(dialog.queryByText("Subtarefas")).not.toBeInTheDocument();
    expect(dialog.queryByPlaceholderText("Adicionar subtarefa")).not.toBeInTheDocument();
    expect(dialog.getByText("Tags")).toBeInTheDocument();
    expect(dialog.getByText("Link externo")).toBeInTheDocument();
  });

  it("Organização mostra o campo Subtarefas normalmente ao editar uma tarefa de topo", async () => {
    const user = userEvent.setup();
    const parent = makeTask({ id: "parent-1", title: "Tarefa principal" });
    await renderWithTasks([parent]);

    await user.click(screen.getByText("Tarefa principal"));
    await user.click(screen.getByRole("tab", { name: "Organização" }));

    expect(screen.getByPlaceholderText("Adicionar subtarefa")).toBeInTheDocument();
  });

  it("TaskRecurrenceField em modo subtarefa mostra só Prazo/Horário, sem seletor de recorrência nem Início/Duração", async () => {
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
    await user.click(screen.getByRole("tab", { name: "Data e repetição" }));

    // Só Prazo (+ Horário, condicionado a ter prazo) — sem "se repete?", Início nem Duração
    // estimada, que só existem no modo tarefa de topo.
    expect(screen.getByText("Prazo")).toBeInTheDocument();
    expect(screen.getByText("Horário")).toBeInTheDocument();
    expect(screen.queryByText("Esta tarefa se repete?")).not.toBeInTheDocument();
    expect(screen.queryByText("Início")).not.toBeInTheDocument();
    expect(screen.queryByText("Duração estimada")).not.toBeInTheDocument();
  });

  it("TaskRecurrenceField em modo tarefa de topo continua mostrando o seletor de recorrência completo", async () => {
    const user = userEvent.setup();
    const parent = makeTask({ id: "parent-1", title: "Tarefa principal", due_date: "2026-08-20" });
    await renderWithTasks([parent]);

    await user.click(screen.getByText("Tarefa principal"));
    await user.click(screen.getByRole("tab", { name: "Data e repetição" }));

    expect(screen.getByText("Esta tarefa se repete?")).toBeInTheDocument();
    expect(screen.getByText("Início")).toBeInTheDocument();
    expect(screen.getByText("Duração estimada")).toBeInTheDocument();
  });

  it("isSubtaskDueDateValid bloqueia salvar com prazo além do prazo da mãe: toast de erro + troca para a aba Data", async () => {
    const user = userEvent.setup();
    const parent = makeTask({ id: "parent-1", title: "Tarefa principal", due_date: "2026-08-20" });
    // Prazo da subtarefa já além do prazo da mãe (ex.: prazo da mãe foi antecipado depois que a
    // subtarefa foi criada) — dispara a validação assim que o usuário tenta salvar, sem precisar
    // manipular o DatePicker.
    const subtask = makeTask({
      id: "sub-1",
      parent_task_id: "parent-1",
      title: "Subtarefa filha",
      due_date: "2026-08-25",
    });
    await renderWithTasks([parent, subtask]);

    await openSubtaskFromChecklist(user, "Subtarefa filha");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Erro",
        description: expect.stringContaining("O prazo não pode passar de 20/08/2026"),
        variant: "destructive",
      })
    );
    expect(screen.getByRole("tab", { name: "Data e repetição" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(mockedUpdateTask).not.toHaveBeenCalled();
  });

  it("com prazo válido (dentro do prazo da mãe), salvar chama updateTask normalmente", async () => {
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
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(mockedUpdateTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub-1", due_date: "2026-08-10" })
    );
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Erro" }));
  });
});
