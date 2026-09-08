import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AgendaGrid } from "@/pages/admin/tasks/AgendaGrid";
import {
  createTask,
  fetchProjectEvents,
  fetchProjects,
  fetchTags,
  fetchTasks,
  saveExternalLinksForTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import { TASK_PROJECT_FILTER_STORAGE_KEY } from "@/lib/taskProjectFilterPreference";
import type { Project, Task } from "@/types/tasks";

/**
 * Feature 103 — criar **tarefa** de dentro da Agenda.
 *
 * A 099 registrou por escrito que a Agenda ficava de fora do "a tarefa nova herda o projeto do
 * filtro" porque ela **não criava tarefa**: `AgendaGrid` só editava. Esta feature abre esse
 * caminho, e com ele a Agenda passa a herdar o filtro como Lista e Projeto.
 */

vi.mock("@/api/tasks", () => ({
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchTasks: vi.fn(),
  fetchProjects: vi.fn(),
  fetchProjectEvents: vi.fn(),
  fetchTags: vi.fn(),
  createTag: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  updateTask: vi.fn(),
  createProjectEvent: vi.fn(),
  updateProjectEvent: vi.fn(),
  deleteProjectEvent: vi.fn(),
}));

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn(),
}));

vi.mock("@/api/health/medications", () => ({
  fetchMedications: vi.fn(async () => []),
  endMedicationAndDeleteFutureDoses: vi.fn(),
  EndMedicationError: class extends Error {},
}));

vi.mock("@/hooks/useDimensions", () => ({
  useDimensions: () => ({ dimensions: [], loading: false, error: null, refetch: vi.fn() }),
}));

const mockedFetchTasks = vi.mocked(fetchTasks);
const mockedFetchProjects = vi.mocked(fetchProjects);
const mockedFetchProjectEvents = vi.mocked(fetchProjectEvents);
const mockedFetchTags = vi.mocked(fetchTags);
const mockedCreateTask = vi.mocked(createTask);
const mockedFetchRecurringTransactions = vi.mocked(fetchRecurringTransactions);

const ALPHA: Project = { id: "p-alpha", name: "Alpha", status: "active", tag_ids: [] };

const HOJE = new Date();
const MES = `${HOJE.getFullYear()}-${String(HOJE.getMonth() + 1).padStart(2, "0")}`;
const DIA = `${MES}-10`;

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-nova",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Comprar pão",
    status: "todo",
    tag_ids: [],
    due_date: DIA,
    due_time: null,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    ...overrides,
  };
}

async function renderLoaded(props: Parameters<typeof AgendaGrid>[0] = {}) {
  const utils = render(
    <MemoryRouter>
      <AgendaGrid {...props} />
    </MemoryRouter>
  );
  await screen.findByText("Dom");
  return utils;
}

/** "Novo" → "Tarefa" e o formulário completo aberto em modo criação. */
async function abrirFormularioDeTarefa(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Novo item na agenda" }));
  await user.click(await screen.findByRole("menuitem", { name: "Tarefa" }));
  await screen.findByText("Nova tarefa");
}

beforeEach(() => {
  localStorage.clear();
  mockedFetchTasks.mockReset().mockResolvedValue([]);
  mockedFetchProjects.mockReset().mockResolvedValue([ALPHA]);
  mockedFetchProjectEvents.mockReset().mockResolvedValue([]);
  mockedFetchTags.mockReset().mockResolvedValue([]);
  mockedCreateTask.mockReset().mockResolvedValue(makeTask());
  mockedFetchRecurringTransactions.mockReset().mockResolvedValue([]);
  vi.mocked(saveExternalLinksForTask).mockClear();
});

describe("AgendaGrid — formulário de tarefa nova (feature 103)", () => {
  it("«Novo» → «Tarefa» abre o form completo em modo criação, vazio e com botão de criar", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await abrirFormularioDeTarefa(user);

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByLabelText(/^Título/)).toHaveValue("");
    expect(dialog.getByRole("button", { name: "Criar tarefa" })).toBeInTheDocument();
    // Modo criação, não edição: nada de "Salvar alterações" nem de excluir.
    expect(dialog.queryByRole("button", { name: "Salvar alterações" })).not.toBeInTheDocument();
    expect(dialog.queryByRole("button", { name: "Excluir tarefa" })).not.toBeInTheDocument();
  });

  it("com o filtro de projeto num projeto, o form nasce com aquele projeto (costura com a 099)", async () => {
    const user = userEvent.setup();
    localStorage.setItem(TASK_PROJECT_FILTER_STORAGE_KEY, ALPHA.id);
    await renderLoaded();

    await abrirFormularioDeTarefa(user);

    // Feature 080: o projeto atual aparece como badge clicável no cabeçalho do form.
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Alpha" })).toBeInTheDocument();
  });
});

describe("AgendaGrid — criar tarefa (feature 103)", () => {
  it("título + prazo chamam createTask, e a tarefa aparece na grade depois do reload", async () => {
    const user = userEvent.setup();
    const criada = makeTask({ title: "Comprar pão" });
    mockedCreateTask.mockResolvedValue(criada);
    mockedFetchTasks.mockResolvedValueOnce([]).mockResolvedValue([criada]);
    await renderLoaded();

    expect(screen.queryByText("Comprar pão")).not.toBeInTheDocument();

    await abrirFormularioDeTarefa(user);
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText(/^Título/), "Comprar pão");
    await user.click(dialog.getByRole("button", { name: "Criar tarefa" }));

    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Comprar pão", parent_task_id: null })
    );
    expect(await screen.findByText("Comprar pão")).toBeInTheDocument();
    // O dialog fecha no sucesso.
    expect(screen.queryByText("Nova tarefa")).not.toBeInTheDocument();
  });

  it("criar pelo `+` de um dia nasce com o due_date daquele dia", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    const dia10 = new Date(HOJE.getFullYear(), HOJE.getMonth(), 10);
    const mais = screen.getAllByRole("button", {
      name: new RegExp(`^Novo item em ${dia10.getDate()} de`),
    })[0];
    await user.click(mais);
    await user.click(await screen.findByRole("menuitem", { name: "Tarefa" }));
    await screen.findByText("Nova tarefa");

    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText(/^Título/), "Comprar pão");
    await user.click(dialog.getByRole("button", { name: "Criar tarefa" }));

    // Sem isto a tarefa criada pela Agenda não apareceria na Agenda — o mesmo bug que a 099
    // consertou na Lista.
    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Comprar pão", due_date: DIA })
    );
  });

  it("pelo botão da barra (sem dia), a tarefa nasce sem prazo — quem escolhe é o usuário", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await abrirFormularioDeTarefa(user);
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText(/^Título/), "Sem data ainda");
    await user.click(dialog.getByRole("button", { name: "Criar tarefa" }));

    expect(mockedCreateTask).toHaveBeenCalledWith(expect.objectContaining({ due_date: null }));
  });

  it("título vazio não cria nada", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await abrirFormularioDeTarefa(user);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Criar tarefa" }));

    expect(mockedCreateTask).not.toHaveBeenCalled();
    // E o formulário continua aberto, com o que foi digitado.
    expect(screen.getByText("Nova tarefa")).toBeInTheDocument();
  });

  it("subtarefas digitadas antes do insert viram linhas só depois do createTask da mãe", async () => {
    const user = userEvent.setup();
    const criada = makeTask({ id: "mae-1", project_id: ALPHA.id, title: "Mudança" });
    mockedCreateTask.mockResolvedValue(criada);
    await renderLoaded();

    await abrirFormularioDeTarefa(user);
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText(/^Título/), "Mudança");
    await user.click(dialog.getByRole("button", { name: /Subtarefas/ }));
    await user.type(screen.getByPlaceholderText("Adicionar subtarefa"), "Contratar caminhão");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    // Enquanto não há tarefa-mãe, a subtarefa é só rascunho local.
    expect(mockedCreateTask).not.toHaveBeenCalled();

    await user.click(dialog.getByRole("button", { name: "Criar tarefa" }));

    expect(mockedCreateTask).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ title: "Mudança" })
    );
    expect(mockedCreateTask).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        title: "Contratar caminhão",
        parent_task_id: "mae-1",
        project_id: ALPHA.id,
      })
    );
  });

  it("links externos só são gravados depois do createTask — antes não há task_id", async () => {
    const user = userEvent.setup();
    mockedCreateTask.mockResolvedValue(makeTask({ id: "task-nova" }));
    await renderLoaded();

    await abrirFormularioDeTarefa(user);
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText(/^Título/), "Comprar pão");
    await user.click(await dialog.findByRole("button", { name: /Links externos/ }));
    await user.click(dialog.getByRole("button", { name: "Adicionar link" }));
    await user.type(dialog.getByLabelText("URL do link 1 de 1"), "https://a.com");

    // Nada gravado enquanto a tarefa não existe.
    expect(saveExternalLinksForTask).not.toHaveBeenCalled();

    await user.click(dialog.getByRole("button", { name: "Criar tarefa" }));

    await waitFor(() =>
      expect(saveExternalLinksForTask).toHaveBeenCalledWith("task-nova", [
        { url: "https://a.com", comment: null, position: 0 },
      ])
    );
    // E na ordem certa: primeiro o insert da tarefa, depois os links.
    expect(mockedCreateTask.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(saveExternalLinksForTask).mock.invocationCallOrder[0]
    );
  });
});

/**
 * Feature 099 — "a tarefa nova herda o projeto do filtro" — tinha deixado a Agenda de fora por
 * escrito, porque ela não criava tarefa. Com a 103 ela cria, então passa a seguir a mesma regra
 * (`projectIdForNewTask`): um id vira `project_id`; "Todos" e "Sem projeto" viram `null`.
 */
describe("AgendaGrid — tarefa nova herda o projeto do filtro (features 099/103)", () => {
  async function criarTarefa(user: ReturnType<typeof userEvent.setup>) {
    await abrirFormularioDeTarefa(user);
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText(/^Título/), "Comprar pão");
    await user.click(dialog.getByRole("button", { name: "Criar tarefa" }));
  }

  it("filtro num projeto: a tarefa nasce naquele projeto", async () => {
    const user = userEvent.setup();
    await renderLoaded({ projectFilter: ALPHA.id });

    await criarTarefa(user);

    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: ALPHA.id })
    );
  });

  it("filtro em «Todos os projetos»: a tarefa nasce sem projeto", async () => {
    const user = userEvent.setup();
    await renderLoaded({ projectFilter: "all" });

    await criarTarefa(user);

    expect(mockedCreateTask).toHaveBeenCalledWith(expect.objectContaining({ project_id: null }));
  });

  it("filtro em «Sem projeto»: a tarefa nasce sem projeto", async () => {
    const user = userEvent.setup();
    await renderLoaded({ projectFilter: "null" });

    await criarTarefa(user);

    expect(mockedCreateTask).toHaveBeenCalledWith(expect.objectContaining({ project_id: null }));
  });
});
