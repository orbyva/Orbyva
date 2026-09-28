import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AgendaGrid } from "@/pages/admin/tasks/AgendaGrid";
import {
  fetchProjectEvents,
  fetchProjects,
  fetchTags,
  fetchTasks,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Project, ProjectEvent, Task } from "@/types/tasks";

/**
 * Feature 066: `project_event.project_id` virou nullable e entrou `task_id`, então a Agenda passa a
 * receber três tipos de evento. Aqui o interesse é só a propagação dessa nulabilidade na UI que já
 * existia — criar/editar evento pela Agenda é a 067:
 *
 * - evento de tarefa **deriva** o projeto da tarefa (cor do chip e badge/link do dialog);
 * - evento avulso não tem projeto: cor neutra e nada de "Ir para o projeto";
 * - evento de projeto (linha legada) continua exatamente como antes.
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

const mockedFetchTasks = vi.mocked(fetchTasks);
const mockedFetchProjects = vi.mocked(fetchProjects);
const mockedFetchProjectEvents = vi.mocked(fetchProjectEvents);
const mockedFetchTags = vi.mocked(fetchTags);
const mockedFetchRecurringTransactions = vi.mocked(fetchRecurringTransactions);

/** Meio-dia de hoje: cai sempre dentro da grade do mês corrente, que é a visão padrão. */
function todayAtNoon(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0).toISOString();
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
    starts_at: todayAtNoon(),
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

/** Ponto colorido do chip: primeiro `<span>` do botão, com a cor do projeto no style inline. */
function chipDotColor(title: string): string {
  const chip = screen.getByRole("button", { name: title });
  const dot = chip.querySelector("span");
  return (dot as HTMLElement).style.backgroundColor;
}

beforeEach(() => {
  mockedFetchTasks.mockReset().mockResolvedValue([]);
  mockedFetchProjects.mockReset().mockResolvedValue([]);
  mockedFetchProjectEvents.mockReset().mockResolvedValue([]);
  mockedFetchTags.mockReset().mockResolvedValue([]);
  mockedFetchRecurringTransactions.mockReset().mockResolvedValue([]);
});

describe("AgendaGrid — evento de projeto, de tarefa e avulso (feature 066)", () => {
  it("evento avulso aparece na agenda com cor neutra e sem botão 'Ir para o projeto'", async () => {
    const user = userEvent.setup();
    mockedFetchProjects.mockResolvedValue([makeProject()]);
    mockedFetchProjectEvents.mockResolvedValue([makeEvent({ title: "Dentista" })]);

    await renderLoaded();

    expect(chipDotColor("Dentista")).not.toBe("rgb(255, 0, 0)");

    await user.click(screen.getByRole("button", { name: "Dentista" }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).queryByText("Ir para o projeto")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Projeto Alpha")).not.toBeInTheDocument();
    // O evento continua utilizável: excluir segue disponível.
    expect(within(dialog).getByText("Excluir")).toBeInTheDocument();
  });

  it("evento de tarefa deriva o projeto da tarefa (cor do chip, badge e link do dialog)", async () => {
    const user = userEvent.setup();
    const project = makeProject();
    mockedFetchProjects.mockResolvedValue([project]);
    mockedFetchTasks.mockResolvedValue([
      makeTask({ id: "task-1", project_id: project.id, title: "Comprar cimento" }),
    ]);
    mockedFetchProjectEvents.mockResolvedValue([
      makeEvent({ task_id: "task-1", title: "Reunião sobre o cimento" }),
    ]);

    await renderLoaded();

    // A cor sai do projeto DA TAREFA, mesmo com `project_id` do evento nulo.
    expect(chipDotColor("Reunião sobre o cimento")).toBe("rgb(255, 0, 0)");

    await user.click(screen.getByRole("button", { name: "Reunião sobre o cimento" }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByRole("link", { name: "Projeto Alpha" })).toHaveAttribute(
      "href",
      "/tasks/projects/project-1"
    );
  });

  it("evento de tarefa sem projeto (tarefa solta) não inventa projeto nenhum", async () => {
    const user = userEvent.setup();
    mockedFetchProjects.mockResolvedValue([makeProject()]);
    mockedFetchTasks.mockResolvedValue([
      makeTask({ id: "task-2", project_id: null, title: "Tarefa solta" }),
    ]);
    mockedFetchProjectEvents.mockResolvedValue([
      makeEvent({ task_id: "task-2", title: "Conversa sobre a tarefa solta" }),
    ]);

    await renderLoaded();
    await user.click(screen.getByRole("button", { name: "Conversa sobre a tarefa solta" }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).queryByText("Ir para o projeto")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Projeto Alpha")).not.toBeInTheDocument();
  });

  it("evento de projeto (linha legada) continua com badge e link para o projeto", async () => {
    const user = userEvent.setup();
    const project = makeProject();
    mockedFetchProjects.mockResolvedValue([project]);
    mockedFetchProjectEvents.mockResolvedValue([
      makeEvent({ project_id: project.id, title: "Reunião de obra" }),
    ]);

    await renderLoaded();

    expect(chipDotColor("Reunião de obra")).toBe("rgb(255, 0, 0)");

    await user.click(screen.getByRole("button", { name: "Reunião de obra" }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByRole("link", { name: "Projeto Alpha" })).toHaveAttribute(
      "href",
      "/tasks/projects/project-1"
    );
  });
});
