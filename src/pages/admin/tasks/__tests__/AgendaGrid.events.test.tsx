import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AgendaGrid } from "@/pages/admin/tasks/AgendaGrid";
import {
  createProjectEvent,
  deleteProjectEvent,
  fetchProjectEvents,
  fetchProjects,
  fetchTags,
  fetchTasks,
  updateProjectEvent,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Project, ProjectEvent, Task } from "@/types/tasks";

/**
 * Feature 067: a Agenda deixou de ser só leitura de evento — passa a criar, editar e excluir no
 * lugar onde o compromisso é marcado. Sem navegador na verificação, é este arquivo que prova o
 * caminho de escrita ponta a ponta (clique -> dialog -> chamada de API com o payload certo).
 */

vi.mock("@/api/tasks", () => ({
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
const mockedFetchProjectEvents = vi.mocked(fetchProjectEvents);
const mockedFetchTags = vi.mocked(fetchTags);
const mockedFetchRecurringTransactions = vi.mocked(fetchRecurringTransactions);
const mockedCreateProjectEvent = vi.mocked(createProjectEvent);
const mockedUpdateProjectEvent = vi.mocked(updateProjectEvent);
const mockedDeleteProjectEvent = vi.mocked(deleteProjectEvent);

/** Meio-dia de hoje: cai sempre dentro da grade do mês corrente, que é a visão padrão. */
function todayAtNoon(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0);
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Tarefa qualquer",
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
    name: "Projeto Alpha",
    color: "#ff0000",
    status: "active",
    tag_ids: [],
    ...overrides,
  };
}

function makeEvent(overrides: Partial<ProjectEvent> = {}): ProjectEvent {
  return {
    id: "event-1",
    project_id: null,
    task_id: null,
    title: "Evento",
    starts_at: todayAtNoon().toISOString(),
    ends_at: null,
    ...overrides,
  };
}

async function renderLoaded() {
  const utils = render(
    <MemoryRouter>
      <AgendaGrid />
    </MemoryRouter>
  );
  await screen.findByText("Dom");
  return utils;
}

function saveButton(): HTMLElement {
  return screen.getByRole("button", { name: /Criar evento|Salvar alterações/ });
}

beforeEach(() => {
  toastMock.mockReset();
  mockedFetchTasks.mockReset().mockResolvedValue([]);
  mockedFetchProjects.mockReset().mockResolvedValue([]);
  mockedFetchProjectEvents.mockReset().mockResolvedValue([]);
  mockedFetchTags.mockReset().mockResolvedValue([]);
  mockedFetchRecurringTransactions.mockReset().mockResolvedValue([]);
  mockedCreateProjectEvent.mockReset().mockResolvedValue(makeEvent());
  mockedUpdateProjectEvent.mockReset().mockResolvedValue(makeEvent());
  mockedDeleteProjectEvent.mockReset().mockResolvedValue(undefined);
});

describe("AgendaGrid — criar evento (feature 067)", () => {
  it("'Novo evento' abre o dialog de criação", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    expect(screen.queryByText("Novo evento", { selector: "h2, h3" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Novo evento/ }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Título/)).toHaveValue("");
    expect(screen.getByLabelText(/^Início/)).toHaveValue("");
  });

  it("salvar chama createProjectEvent com o evento avulso e recarrega a agenda", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    expect(mockedFetchProjectEvents).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /Novo evento/ }));
    await user.type(screen.getByLabelText(/^Título/), "Dentista");
    await user.type(screen.getByLabelText(/^Início/), "2026-08-17T09:00");
    await user.click(saveButton());

    await waitFor(() =>
      expect(mockedCreateProjectEvent).toHaveBeenCalledWith({
        title: "Dentista",
        starts_at: new Date(2026, 7, 17, 9, 0).toISOString(),
        ends_at: null,
        project_id: null,
        task_id: null,
      })
    );
    // Recarrega a agenda depois de salvar (mesmo padrão de `handleDeleteEvent`).
    await waitFor(() => expect(mockedFetchProjectEvents).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("vincular a uma tarefa manda task_id preenchido e project_id null", async () => {
    const user = userEvent.setup();
    mockedFetchProjects.mockResolvedValue([makeProject()]);
    mockedFetchTasks.mockResolvedValue([
      makeTask({ id: "task-1", project_id: "project-1", title: "Comprar cimento" }),
    ]);
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: /Novo evento/ }));
    await user.type(screen.getByLabelText(/^Título/), "Reunião sobre o cimento");
    await user.type(screen.getByLabelText(/^Início/), "2026-08-17T09:00");
    await user.click(screen.getByRole("tab", { name: "Tarefa" }));
    await user.click(await screen.findByRole("option", { name: /Comprar cimento/ }));
    await user.click(saveButton());

    await waitFor(() =>
      expect(mockedCreateProjectEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Reunião sobre o cimento",
          project_id: null,
          task_id: "task-1",
        })
      )
    );
  });

  it("erro na criação mostra toast e mantém o dialog aberto com o que foi digitado", async () => {
    const user = userEvent.setup();
    mockedCreateProjectEvent.mockRejectedValue(new Error("insert falhou"));
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: /Novo evento/ }));
    await user.type(screen.getByLabelText(/^Título/), "Dentista");
    await user.type(screen.getByLabelText(/^Início/), "2026-08-17T09:00");
    await user.click(saveButton());

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      )
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Título/)).toHaveValue("Dentista");
    expect(saveButton()).toBeEnabled();
  });
});
