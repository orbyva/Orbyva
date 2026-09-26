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


// O guia do módulo depende do `AuthProvider` e não tem nada a ver com o que este teste afirma.
vi.mock("@/components/ModuleGuide", () => ({
  ModuleGuide: () => null,
  ModuleGuideButton: () => null,
}));

vi.mock("@/api/tasks", () => ({
  // Feature 085: os donos do formulário/lista carregam e gravam os links externos.
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchTasks: vi.fn(),
  fetchProjects: vi.fn(),
  fetchTags: vi.fn(),
  fetchDependencies: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  deleteTasks: vi.fn(),
  createTag: vi.fn(),
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
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
    // Feature 080: o form completo virou painel único — os campos aparecem todos de uma vez, sem
    // aba nenhuma, em vez do "Título/Descrição/Prazo" reduzido do SubtaskEditDialog.
    const panel = within(screen.getByRole("dialog"));
    expect(screen.queryByRole("tab", { name: "Geral" })).not.toBeInTheDocument();
    expect(panel.getByLabelText(/^Título/)).toBeInTheDocument();
    expect(panel.getByRole("button", { name: /Descrição/ })).toBeInTheDocument();
    expect(panel.getByText("Data limite")).toBeInTheDocument();
    expect(panel.getByRole("button", { name: /Registros de tempo/ })).toBeInTheDocument();
    // Campos que o SubtaskEditDialog nunca ofereceu, disponíveis de graça no form completo.
    expect(panel.getByText("Prioridade")).toBeInTheDocument();
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

    // Feature 080: o seletor virou um badge clicável de uma linha; a lista abre no popover.
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("button", { name: "Projeto Alpha" })).toBeInTheDocument();
    expect(screen.queryByText("Herdado da tarefa principal")).not.toBeInTheDocument();

    await user.click(dialog.getByRole("button", { name: "Projeto Alpha" }));
    expect(await screen.findByRole("listbox", { name: "Projeto" })).toBeInTheDocument();
  });

  it("o painel esconde o campo Subtarefas ao editar uma subtarefa, mantendo Tags/Links externos", async () => {
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
    // Feature 085: o campo único virou a seção "Links externos" — subtarefa continua tendo a dela.
    expect(dialog.getByRole("button", { name: /Links externos/ })).toBeInTheDocument();
  });

  it("o painel mostra o campo Subtarefas normalmente ao editar uma tarefa de topo", async () => {
    const user = userEvent.setup();
    const parent = makeTask({ id: "parent-1", title: "Tarefa principal" });
    await renderWithTasks([parent]);

    await user.click(screen.getByText("Tarefa principal"));
    // Seção colapsável (feature 080): um clique abre.
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Subtarefas/ }));

    expect(screen.getByPlaceholderText("Adicionar subtarefa")).toBeInTheDocument();
  });

  it("subtarefa mostra só Data limite/Horário, sem recorrência nem Início/Duração", async () => {
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

    // Escopado ao diálogo: rótulos como "Prazo" também aparecem no seletor "Ordenar por" da Lista
    // atrás dele (feature 079), e `screen.getByText` acharia os dois.
    const dialog = within(screen.getByRole("dialog"));

    // Só Data limite (+ Horário, condicionado a ter prazo) — sem recorrência, Início nem Duração,
    // que só existem no modo tarefa de topo.
    expect(dialog.getByText("Data limite")).toBeInTheDocument();
    expect(dialog.getByText("Horário")).toBeInTheDocument();
    expect(dialog.queryByRole("button", { name: /Repetição da tarefa/ })).not.toBeInTheDocument();
    expect(dialog.queryByText("Início")).not.toBeInTheDocument();
    expect(dialog.queryByText("Duração")).not.toBeInTheDocument();
  });

  it("tarefa de topo continua com Início/Duração e com a configuração de repetição a um clique", async () => {
    const user = userEvent.setup();
    const parent = makeTask({ id: "parent-1", title: "Tarefa principal", due_date: "2026-08-20" });
    await renderWithTasks([parent]);

    await user.click(screen.getByText("Tarefa principal"));
    const dialog = within(screen.getByRole("dialog"));

    expect(dialog.getByText("Início")).toBeInTheDocument();
    expect(dialog.getByText("Duração")).toBeInTheDocument();

    // Feature 080: a configuração de repetição foi para um modal próprio, com o estado resumido
    // no botão que o abre.
    await user.click(dialog.getByRole("button", { name: /Repetição da tarefa — Não se repete/ }));
    expect(await screen.findByText("Esta tarefa se repete?")).toBeInTheDocument();
  });

  it("isSubtaskDueDateValid bloqueia salvar com prazo além do prazo da mãe: aviso no campo + toast de erro", async () => {
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

    // Feature 080: o aviso agora aparece no próprio campo, assim que o dialog abre — antes só
    // existia como toast, depois de tentar salvar.
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("alert")).toHaveTextContent(
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
