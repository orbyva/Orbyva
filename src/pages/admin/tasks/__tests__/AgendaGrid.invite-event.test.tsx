import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
import type { Project, ProjectEvent } from "@/types/tasks";

/**
 * Feature 076: `project_event.project_id` passou a aceitar nulo, porque o convidado que aceita um
 * convite recebe uma **cópia** do evento e não tem o projeto do anfitrião. Toda a agenda antes
 * assumia que todo evento tinha projeto (cor do chip, badge, link "Ir para o projeto"), então este
 * arquivo trava o comportamento do evento sem projeto: ele aparece, com cor neutra, com rótulo
 * próprio, e sem link para um projeto que não existe.
 */

vi.mock("@/api/tasks", () => ({
  // Feature 085: os donos do formulário/lista carregam e gravam os links externos.
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

/** Meio-dia local de hoje: cai no dia certo da grade do mês em qualquer fuso. */
function todayAtNoon(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

const project: Project = {
  id: "project-1",
  name: "Lançamento",
  color: "#8b5cf6",
  status: "active",
  tag_ids: [],
};

function makeEvent(overrides: Partial<ProjectEvent> = {}): ProjectEvent {
  return {
    id: "event-1",
    project_id: "project-1",
    title: "Reunião de kickoff",
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

beforeEach(() => {
  mockedFetchTasks.mockReset().mockResolvedValue([]);
  mockedFetchProjects.mockReset().mockResolvedValue([project]);
  mockedFetchProjectEvents.mockReset();
  mockedFetchTags.mockReset().mockResolvedValue([]);
  mockedFetchRecurringTransactions.mockReset().mockResolvedValue([]);
});

describe("AgendaGrid — evento sem projeto (recebido por convite, feature 076)", () => {
  it("renderiza o chip do evento mesmo sem projeto, em vez de sumir ou quebrar", async () => {
    mockedFetchProjectEvents.mockResolvedValue([
      makeEvent({ id: "event-convite", project_id: null, title: "Reunião do convite" }),
    ]);

    await renderLoaded();

    expect(screen.getByText("Reunião do convite")).toBeInTheDocument();
  });

  it("o chip sem projeto usa a cor neutra, e o com projeto usa a cor do projeto", async () => {
    mockedFetchProjectEvents.mockResolvedValue([
      makeEvent({ id: "event-com", project_id: "project-1", title: "Evento com projeto" }),
      makeEvent({ id: "event-sem", project_id: null, title: "Evento sem projeto" }),
    ]);

    await renderLoaded();

    const comProjeto = screen.getByText("Evento com projeto").closest("button");
    const semProjeto = screen.getByText("Evento sem projeto").closest("button");
    // A bolinha de cor é o primeiro span do chip.
    expect(comProjeto?.querySelector("span")).toHaveStyle({
      backgroundColor: "#8b5cf6",
    });
    expect(semProjeto?.querySelector("span")?.getAttribute("style")).toContain(
      "--muted-foreground"
    );
  });

  it("abrir o evento sem projeto mostra o rótulo de convite e não oferece 'Ir para o projeto'", async () => {
    const user = userEvent.setup();
    mockedFetchProjectEvents.mockResolvedValue([
      makeEvent({ id: "event-convite", project_id: null, title: "Reunião do convite" }),
    ]);

    await renderLoaded();
    await user.click(screen.getByText("Reunião do convite"));

    expect(await screen.findByText("Recebido por convite")).toBeInTheDocument();
    expect(screen.queryByText("Ir para o projeto")).not.toBeInTheDocument();
    expect(screen.queryByText("Lançamento")).not.toBeInTheDocument();
    // Excluir continua disponível: a cópia é do convidado, ele pode apagar.
    expect(screen.getByText("Excluir")).toBeInTheDocument();
  });

  it("evento com projeto continua mostrando o projeto e o link, sem regressão", async () => {
    const user = userEvent.setup();
    mockedFetchProjectEvents.mockResolvedValue([
      makeEvent({ id: "event-com", project_id: "project-1", title: "Evento com projeto" }),
    ]);

    await renderLoaded();
    await user.click(screen.getByText("Evento com projeto"));

    expect(await screen.findByText("Lançamento")).toBeInTheDocument();
    expect(screen.getByText("Ir para o projeto")).toBeInTheDocument();
    expect(screen.queryByText("Recebido por convite")).not.toBeInTheDocument();
  });
});
