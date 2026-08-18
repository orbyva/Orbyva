import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Projects from "@/pages/admin/tasks/Projects";
import { fetchProjectEvents, fetchProjects, fetchTasks } from "@/api/tasks";
import type { Project, ProjectEvent, Task } from "@/types/tasks";

/**
 * Feature 068: evento vinculado a uma **tarefa** do projeto passa a contar como evento do projeto
 * nas telas de projeto (`resolveEventProjectId`, feature 066). Sem isso o card do projeto some com
 * a "reunião sobre a tarefa X" — o `project_id` da linha é nulo de propósito, porque o projeto de
 * um evento de tarefa é derivado, nunca copiado — e o "próximo evento" mente por omissão.
 */

vi.mock("@/api/tasks", () => ({
  fetchProjects: vi.fn(),
  fetchProjectEvents: vi.fn(),
  fetchTags: vi.fn(async () => []),
  fetchTasks: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  createProjectEvent: vi.fn(),
  updateProjectEvent: vi.fn(),
  deleteProjectEvent: vi.fn(),
  createTag: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "Obra da casa",
    description: null,
    color: null,
    goal_id: null,
    status: "active",
    tag_ids: [],
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: "project-1",
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Comprar cimento",
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

/** Sempre no futuro: `nextEventFor` só mostra evento a partir de agora. */
function inTwoDays(): string {
  return new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
}

function makeEvent(overrides: Partial<ProjectEvent> = {}): ProjectEvent {
  return {
    id: "event-1",
    project_id: null,
    task_id: null,
    title: "Evento",
    starts_at: inTwoDays(),
    ends_at: null,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Projects />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchProjects).mockResolvedValue([makeProject()]);
  vi.mocked(fetchTasks).mockResolvedValue([makeTask()]);
  vi.mocked(fetchProjectEvents).mockResolvedValue([]);
});

describe("Projetos — evento de tarefa conta como evento do projeto (feature 068)", () => {
  it("'próximo evento' do card sai de um evento vinculado a uma tarefa do projeto", async () => {
    vi.mocked(fetchProjectEvents).mockResolvedValue([
      makeEvent({ id: "event-a", task_id: "task-1", title: "Reunião sobre o cimento" }),
    ]);

    renderPage();
    const card = (await screen.findByText("Obra da casa")).closest("article") as HTMLElement;

    expect(within(card).getByText(/Reunião sobre o cimento/)).toBeInTheDocument();
  });

  it("evento avulso e evento de tarefa de outro projeto não entram no card", async () => {
    vi.mocked(fetchTasks).mockResolvedValue([
      makeTask(),
      makeTask({ id: "task-2", project_id: "project-2", title: "Tarefa de outro projeto" }),
    ]);
    vi.mocked(fetchProjectEvents).mockResolvedValue([
      makeEvent({ id: "event-a", title: "Dentista" }),
      makeEvent({ id: "event-b", task_id: "task-2", title: "Reunião do outro projeto" }),
    ]);

    renderPage();
    const card = (await screen.findByText("Obra da casa")).closest("article") as HTMLElement;

    expect(within(card).queryByText(/Dentista/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/Reunião do outro projeto/)).not.toBeInTheDocument();
  });

  it("o dialog de editar projeto lista o evento herdado como somente leitura", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchProjectEvents).mockResolvedValue([
      makeEvent({ id: "event-a", task_id: "task-1", title: "Reunião sobre o cimento" }),
      makeEvent({ id: "event-b", project_id: "project-1", title: "Vistoria" }),
    ]);

    renderPage();
    const card = (await screen.findByText("Obra da casa")).closest("article") as HTMLElement;
    // O botão de editar é só um ícone: chega-se a ele pelo card.
    await user.click(within(card).getAllByRole("button")[0]);
    await screen.findByRole("heading", { name: "Editar projeto" });

    expect(screen.getByText(/via Comprar cimento/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Editar evento Reunião sobre o cimento" })
    ).not.toBeInTheDocument();
    // O evento do próprio projeto continua editável no mesmo dialog.
    expect(screen.getByRole("button", { name: "Editar evento Vistoria" })).toBeInTheDocument();
  });
});
