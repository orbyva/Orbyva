import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProjectDetail from "@/pages/admin/tasks/ProjectDetail";
import {
  createProjectEvent,
  deleteProjectEvent,
  fetchDependencies,
  fetchProjectById,
  fetchProjectEvents,
  fetchTags,
  fetchTasks,
  updateProject,
  updateProjectEvent,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Project, ProjectEvent, Task } from "@/types/tasks";

/**
 * Feature 050 — `ProjectDetail.tsx` ganha um botão "Editar projeto" que hoje não existia (só dava
 * pra editar as tarefas dentro do projeto, não o projeto em si). Cobre: botão abre o
 * `ProjectFormDialog` pré-preenchido, salvar chama `updateProject` com o `id` certo e recarrega,
 * gestão de eventos (adicionar/excluir) a partir da própria tela, e erro ao salvar mantém o
 * dialog aberto.
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
  updateProjectEvent: vi.fn(),
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

const PROJECT_ID = "project-1";
const mockedFetchProjectById = vi.mocked(fetchProjectById);
const mockedFetchTasks = vi.mocked(fetchTasks);
const mockedFetchTags = vi.mocked(fetchTags);
const mockedFetchDependencies = vi.mocked(fetchDependencies);
const mockedFetchRecurringTransactions = vi.mocked(fetchRecurringTransactions);
const mockedFetchProjectEvents = vi.mocked(fetchProjectEvents);
const mockedUpdateProject = vi.mocked(updateProject);
const mockedCreateProjectEvent = vi.mocked(createProjectEvent);
const mockedUpdateProjectEvent = vi.mocked(updateProjectEvent);
const mockedDeleteProjectEvent = vi.mocked(deleteProjectEvent);

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    name: "Projeto Alpha",
    description: "Descrição original",
    color: "#94a3b8",
    goal_id: null,
    status: "active",
    tag_ids: [],
    ...overrides,
  };
}

function makeEvent(overrides: Partial<ProjectEvent> = {}): ProjectEvent {
  return {
    id: "event-1",
    project_id: PROJECT_ID,
    task_id: null,
    title: "Reunião semanal",
    starts_at: "2026-08-20T14:00:00.000Z",
    ...overrides,
  };
}

async function renderDetail(project: Project, tasks: Task[] = [], events: ProjectEvent[] = []) {
  mockedFetchProjectById.mockResolvedValue(project);
  mockedFetchTasks.mockResolvedValue(tasks);
  mockedFetchTags.mockResolvedValue([]);
  mockedFetchDependencies.mockResolvedValue([]);
  mockedFetchRecurringTransactions.mockResolvedValue([]);
  mockedFetchProjectEvents.mockResolvedValue(events);

  render(
    <MemoryRouter initialEntries={[`/tasks/projects/${PROJECT_ID}`]}>
      <Routes>
        <Route path="/tasks/projects/:id" element={<ProjectDetail />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByText(project.name);
}

describe("ProjectDetail — editar projeto", () => {
  beforeEach(() => {
    toastMock.mockReset();
    mockedUpdateProject.mockReset();
    mockedCreateProjectEvent.mockReset();
    mockedUpdateProjectEvent.mockReset();
    mockedDeleteProjectEvent.mockReset();
    mockedFetchProjectById.mockReset();
    mockedFetchTasks.mockReset();
  });

  it("botão 'Editar projeto' abre o dialog pré-preenchido com os dados do projeto atual", async () => {
    const user = userEvent.setup();
    const project = makeProject();
    await renderDetail(project);

    await user.click(screen.getByRole("button", { name: "Editar projeto" }));
    const dialog = within(screen.getByRole("dialog"));

    expect(dialog.getByText("Editar projeto")).toBeInTheDocument();
    expect(dialog.getByLabelText(/Nome/)).toHaveValue("Projeto Alpha");
    expect(dialog.getByLabelText(/Descrição/)).toHaveValue("Descrição original");
  });

  it("salvar chama updateProject com o id do projeto e os campos alterados, e recarrega", async () => {
    const user = userEvent.setup();
    const project = makeProject();
    mockedUpdateProject.mockResolvedValue(undefined);
    await renderDetail(project);
    mockedFetchProjectById.mockResolvedValue({ ...project, name: "Projeto Beta" });

    await user.click(screen.getByRole("button", { name: "Editar projeto" }));
    const dialog = within(screen.getByRole("dialog"));
    const nameInput = dialog.getByLabelText(/Nome/);
    await user.clear(nameInput);
    await user.type(nameInput, "Projeto Beta");
    await user.click(dialog.getByRole("button", { name: "Salvar alterações" }));

    expect(mockedUpdateProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: PROJECT_ID, name: "Projeto Beta" })
    );
    await waitFor(() => expect(mockedFetchProjectById).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("adicionar um evento passa pelo EventFormDialog e chama createProjectEvent com o project_id correto", async () => {
    const user = userEvent.setup();
    const project = makeProject();
    mockedCreateProjectEvent.mockResolvedValue(makeEvent());
    await renderDetail(project);

    await user.click(screen.getByRole("button", { name: "Editar projeto" }));
    await user.click(screen.getByRole("button", { name: "Adicionar evento" }));
    // Feature 068: o mini-form inline virou o mesmo dialog de evento da Agenda.
    await screen.findByText("Novo evento");
    await user.type(screen.getByLabelText(/^Título/), "Reunião mensal");
    await user.type(screen.getByLabelText(/^Início/), "2026-09-01T10:00");
    await user.type(screen.getByLabelText(/^Fim/), "2026-09-01T11:00");
    await user.click(screen.getByRole("button", { name: "Criar evento" }));

    await waitFor(() =>
      expect(mockedCreateProjectEvent).toHaveBeenCalledWith({
        project_id: PROJECT_ID,
        task_id: null,
        title: "Reunião mensal",
        starts_at: new Date(2026, 8, 1, 10, 0).toISOString(),
        // O `ends_at: null` fixo do mini-form antigo virou o fim de verdade do rascunho.
        ends_at: new Date(2026, 8, 1, 11, 0).toISOString(),
      })
    );
  });

  it("editar um evento existente chama updateProjectEvent com o id do evento", async () => {
    const user = userEvent.setup();
    const project = makeProject();
    const starts = new Date(2026, 7, 20, 14, 0);
    mockedUpdateProjectEvent.mockResolvedValue(makeEvent());
    await renderDetail(project, [], [makeEvent({ starts_at: starts.toISOString() })]);

    await user.click(screen.getByRole("button", { name: "Editar projeto" }));
    await user.click(screen.getByRole("button", { name: "Editar evento Reunião semanal" }));
    const title = await screen.findByLabelText(/^Título/);
    await user.clear(title);
    await user.type(title, "Reunião quinzenal");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(mockedUpdateProjectEvent).toHaveBeenCalledWith({
        id: "event-1",
        title: "Reunião quinzenal",
        starts_at: starts.toISOString(),
        ends_at: null,
      })
    );
    expect(mockedCreateProjectEvent).not.toHaveBeenCalled();
  });

  it("excluir um evento existente chama deleteProjectEvent com o id do evento", async () => {
    const user = userEvent.setup();
    const project = makeProject();
    const event = makeEvent();
    mockedDeleteProjectEvent.mockResolvedValue(undefined);
    await renderDetail(project, [], [event]);

    await user.click(screen.getByRole("button", { name: "Editar projeto" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(/Reunião semanal/)).toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Excluir evento Reunião semanal" }));

    expect(mockedDeleteProjectEvent).toHaveBeenCalledWith("event-1");
  });

  it("erro ao salvar mostra toast e mantém o dialog aberto", async () => {
    const user = userEvent.setup();
    const project = makeProject();
    mockedUpdateProject.mockRejectedValue(new Error("Falhou"));
    await renderDetail(project);

    await user.click(screen.getByRole("button", { name: "Editar projeto" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Salvar alterações" }));

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Erro", variant: "destructive" })
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
