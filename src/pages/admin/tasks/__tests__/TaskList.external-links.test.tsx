import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TaskList from "@/pages/admin/tasks/TaskList";
import {
  createTask,
  fetchDependencies,
  fetchExternalLinksForTask,
  fetchExternalLinksForTasks,
  fetchProjects,
  fetchTags,
  fetchTasks,
  saveExternalLinksForTask,
  updateTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Project, Task, TaskExternalLink } from "@/types/tasks";

/**
 * Feature 085 — o fluxo inteiro dos links externos na Lista, ponta a ponta e sem navegador:
 *
 * - criar uma tarefa com dois links grava os dois **depois** do `createTask` (só aí existe
 *   `task_id`), com as `position` na ordem da lista;
 * - abrir uma tarefa para editar carrega os links dela no formulário;
 * - remover um link e salvar manda a lista final, sem ele;
 * - os chips dos cards vêm de **uma** consulta em lote no `load()`, e falha nela cai para "sem
 *   chips" em vez de derrubar a lista de tarefas.
 */

vi.mock("@/api/tasks", () => ({
  fetchTasks: vi.fn(),
  fetchProjects: vi.fn(),
  fetchTags: vi.fn(),
  fetchDependencies: vi.fn(),
  fetchExternalLinksForTask: vi.fn(),
  fetchExternalLinksForTasks: vi.fn(),
  saveExternalLinksForTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  deleteTasks: vi.fn(),
  createTag: vi.fn(),
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
  fetchEntriesForTask: vi.fn().mockResolvedValue([]),
  updateTimeEntry: vi.fn(),
  deleteTimeEntry: vi.fn(),
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
const mockedFetchLinksForTask = vi.mocked(fetchExternalLinksForTask);
const mockedFetchLinksForTasks = vi.mocked(fetchExternalLinksForTasks);
const mockedSaveLinks = vi.mocked(saveExternalLinksForTask);
const mockedCreateTask = vi.mocked(createTask);
const mockedUpdateTask = vi.mocked(updateTask);

const PROJECT: Project = { id: "project-1", name: "Projeto X", status: "active", tag_ids: [] };

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Tarefa existente",
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

function makeLink(over: Partial<TaskExternalLink> & { url: string }): TaskExternalLink {
  return { id: `l-${over.url}`, task_id: "task-1", comment: null, position: 0, ...over };
}

async function renderLoaded(tasks: Task[]) {
  mockedFetchTasks.mockResolvedValue(tasks);
  vi.mocked(fetchProjects).mockResolvedValue([PROJECT]);
  vi.mocked(fetchTags).mockResolvedValue([]);
  vi.mocked(fetchDependencies).mockResolvedValue([]);
  vi.mocked(fetchRecurringTransactions).mockResolvedValue([]);
  render(
    <MemoryRouter>
      <TaskList />
    </MemoryRouter>
  );
  await screen.findAllByRole("button", { name: "Nova tarefa" });
}

async function openCreatePanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole("button", { name: "Nova tarefa" })[0]);
  return within(await screen.findByRole("dialog"));
}

/** Abre a seção "Links externos" do painel aberto e devolve as queries dele. */
async function openLinksSection(
  user: ReturnType<typeof userEvent.setup>,
  panel: ReturnType<typeof within>
) {
  await user.click(panel.getByRole("button", { name: /Links externos/ }));
  return panel;
}

beforeEach(() => {
  toastMock.mockReset();
  mockedCreateTask.mockReset();
  mockedUpdateTask.mockReset();
  mockedSaveLinks.mockReset();
  mockedFetchLinksForTask.mockReset();
  mockedFetchLinksForTasks.mockReset();
  mockedCreateTask.mockResolvedValue(makeTask({ id: "novo-1" }));
  mockedUpdateTask.mockResolvedValue(undefined);
  mockedSaveLinks.mockResolvedValue([]);
  mockedFetchLinksForTask.mockResolvedValue([]);
  mockedFetchLinksForTasks.mockResolvedValue({});
});

/**
 * Feature 100: o título do card virou um botão de edição inline, então clicar nele **não** abre
 * mais o dialog completo — quem abre é o lápis da linha/card (ou qualquer ponto fora do título e
 * da descrição). O caminho do formulário continua existindo, só mudou de gesto.
 */
async function openFullDialog(
  user: ReturnType<typeof userEvent.setup>,
  title: string
) {
  const card = screen
    .getByRole("button", { name: `Editar título: ${title}` })
    .closest(".cursor-pointer") as HTMLElement;
  const pencil = card.querySelector("svg.lucide-pen")?.closest("button") as HTMLButtonElement;
  await user.click(pencil);
}

describe("TaskList — links externos no formulário (feature 085)", () => {
  it("criar com dois links grava os dois depois do createTask, com o id novo e as position em ordem", async () => {
    const user = userEvent.setup();
    await renderLoaded([]);
    const panel = await openLinksSection(user, await openCreatePanel(user));

    await panel.getByLabelText(/^Título/);
    await user.type(panel.getByLabelText(/^Título/), "Tarefa com links");

    await user.click(panel.getByRole("button", { name: "Adicionar link" }));
    await user.type(
      panel.getByLabelText("URL do link 1 de 1"),
      "https://github.com/owner/repo/issues/7"
    );
    await user.type(panel.getByLabelText("Comentário do link 1 de 1"), "issue de origem");

    await user.click(panel.getByRole("button", { name: "Adicionar link" }));
    await user.type(panel.getByLabelText("URL do link 2 de 2"), "https://docs.google.com/x");

    await user.click(screen.getByRole("button", { name: "Criar tarefa" }));

    expect(mockedSaveLinks).toHaveBeenCalledWith("novo-1", [
      { url: "https://github.com/owner/repo/issues/7", comment: "issue de origem", position: 0 },
      { url: "https://docs.google.com/x", comment: null, position: 1 },
    ]);
    // A ordem importa: gravar antes do `createTask` não teria `task_id`.
    expect(mockedCreateTask.mock.invocationCallOrder[0]).toBeLessThan(
      mockedSaveLinks.mock.invocationCallOrder[0]
    );
  });

  it("criar sem link nenhum não chama a gravação de links", async () => {
    const user = userEvent.setup();
    await renderLoaded([]);
    const panel = await openCreatePanel(user);

    await user.type(panel.getByLabelText(/^Título/), "Tarefa sem link");
    await user.click(screen.getByRole("button", { name: "Criar tarefa" }));

    expect(mockedCreateTask).toHaveBeenCalled();
    expect(mockedSaveLinks).not.toHaveBeenCalled();
  });

  it("linha em branco esquecida é descartada, não vira link vazio nem erro", async () => {
    const user = userEvent.setup();
    await renderLoaded([]);
    const panel = await openLinksSection(user, await openCreatePanel(user));

    await user.type(panel.getByLabelText(/^Título/), "Tarefa");
    await user.click(panel.getByRole("button", { name: "Adicionar link" }));
    await user.type(panel.getByLabelText("URL do link 1 de 1"), "https://a.com");
    // Segunda linha só com comentário: comentário sem URL não existe.
    await user.click(panel.getByRole("button", { name: "Adicionar link" }));
    await user.type(panel.getByLabelText("Comentário do link 2 de 2"), "esqueci a URL");

    await user.click(screen.getByRole("button", { name: "Criar tarefa" }));

    expect(mockedSaveLinks).toHaveBeenCalledWith("novo-1", [
      { url: "https://a.com", comment: null, position: 0 },
    ]);
  });

  it("editar carrega os links existentes no formulário, com comentário e ordem", async () => {
    const user = userEvent.setup();
    mockedFetchLinksForTask.mockResolvedValue([
      makeLink({ url: "https://github.com/owner/repo/issues/7", comment: "issue", position: 0 }),
      makeLink({ url: "https://docs.google.com/x", comment: "contrato", position: 1 }),
    ]);
    await renderLoaded([makeTask({ title: "Tarefa com links" })]);

    await openFullDialog(user, "Tarefa com links");
    const panel = within(await screen.findByRole("dialog"));
    expect(mockedFetchLinksForTask).toHaveBeenCalledWith("task-1");

    await user.click(await panel.findByRole("button", { name: /Links externos/ }));

    expect(panel.getByLabelText("URL do link 1 de 2")).toHaveValue(
      "https://github.com/owner/repo/issues/7"
    );
    expect(panel.getByLabelText("Comentário do link 1 de 2")).toHaveValue("issue");
    expect(panel.getByLabelText("URL do link 2 de 2")).toHaveValue("https://docs.google.com/x");
    expect(panel.getByLabelText("Comentário do link 2 de 2")).toHaveValue("contrato");
  });

  it("remover um link e salvar manda a lista final sem ele, e só ele", async () => {
    const user = userEvent.setup();
    mockedFetchLinksForTask.mockResolvedValue([
      makeLink({ url: "https://fica.com", comment: "fica", position: 0 }),
      makeLink({ url: "https://sai.com", comment: "sai", position: 1 }),
      makeLink({ url: "https://fica2.com", comment: null, position: 2 }),
    ]);
    await renderLoaded([makeTask({ title: "Tarefa com links" })]);

    await openFullDialog(user, "Tarefa com links");
    const panel = within(await screen.findByRole("dialog"));
    await user.click(await panel.findByRole("button", { name: /Links externos/ }));

    await user.click(panel.getByRole("button", { name: "Remover link 2 de 3" }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(mockedSaveLinks).toHaveBeenCalledWith("task-1", [
      { id: "l-https://fica.com", url: "https://fica.com", comment: "fica", position: 0 },
      { id: "l-https://fica2.com", url: "https://fica2.com", comment: null, position: 1 },
    ]);
  });

  it("abrir uma tarefa sem link não deixa os links da tarefa anterior na tela", async () => {
    const user = userEvent.setup();
    mockedFetchLinksForTask.mockResolvedValueOnce([
      makeLink({ url: "https://a.com", position: 0 }),
    ]);
    mockedFetchLinksForTask.mockResolvedValueOnce([]);
    await renderLoaded([
      makeTask({ id: "task-1", title: "Com link" }),
      makeTask({ id: "task-2", title: "Sem link" }),
    ]);

    await openFullDialog(user, "Com link");
    let panel = within(await screen.findByRole("dialog"));
    await user.click(await panel.findByRole("button", { name: /Links externos/ }));
    expect(await panel.findByLabelText("URL do link 1 de 1")).toHaveValue("https://a.com");
    await user.keyboard("{Escape}");

    await openFullDialog(user, "Sem link");
    panel = within(await screen.findByRole("dialog"));
    await user.click(await panel.findByRole("button", { name: /Links externos/ }));
    expect(panel.queryByLabelText(/^URL do link/)).not.toBeInTheDocument();
    expect(panel.getByText(/Nenhum link ainda/)).toBeInTheDocument();
  });
});

describe("TaskList — chips dos links vêm de uma consulta em lote (feature 085)", () => {
  it("o load() busca os links de todas as tarefas de uma vez e os chips aparecem nos cards", async () => {
    mockedFetchLinksForTasks.mockResolvedValue({
      "task-1": [makeLink({ url: "https://github.com/owner/repo/issues/7", comment: "issue" })],
      "task-2": [makeLink({ url: "https://figma.com/x", task_id: "task-2" })],
    });
    await renderLoaded([
      makeTask({ id: "task-1", title: "Primeira" }),
      makeTask({ id: "task-2", title: "Segunda" }),
    ]);

    // Uma chamada só, com os dois ids — não uma por card.
    expect(mockedFetchLinksForTasks).toHaveBeenCalledTimes(1);
    expect(mockedFetchLinksForTasks).toHaveBeenCalledWith(["task-1", "task-2"]);

    expect(await screen.findByRole("link", { name: "owner/repo#7" })).toHaveAttribute(
      "title",
      "issue"
    );
    expect(screen.getByRole("link", { name: "figma.com" })).toBeInTheDocument();
  });

  it("falha na consulta em lote cai para 'sem chips', sem derrubar a lista de tarefas", async () => {
    mockedFetchLinksForTasks.mockRejectedValue(new Error("row level security"));
    await renderLoaded([makeTask({ id: "task-1", title: "Continua aparecendo" })]);

    expect(await screen.findByText("Continua aparecendo")).toBeInTheDocument();
    expect(screen.queryAllByRole("link", { name: /github|figma/ })).toHaveLength(0);
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Erro", variant: "destructive" })
    );
  });
});
