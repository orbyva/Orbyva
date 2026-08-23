import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ProjectFormDialog } from "@/pages/admin/tasks/ProjectFormDialog";
import { AgendaGrid } from "@/pages/admin/tasks/AgendaGrid";
import { listEventInvites } from "@/api/tasks";
import {
  fetchProjectEvents,
  fetchProjects,
  fetchTags,
  fetchTasks,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type {
  Project,
  ProjectCreateRequest,
  ProjectEvent,
} from "@/types/tasks";

/**
 * Feature 076: os dois caminhos de onde se convida alguém para um evento —
 * `ProjectFormDialog` (onde os eventos são criados/apagados desde a 065) e o chip do evento na
 * agenda. Um botão que existe mas não abre nada é o modo clássico de essa feature "estar pronta" e
 * não funcionar, então aqui o que se prova é o dialog abrindo pelos dois lados.
 */

vi.mock("@/api/tasks", async () => {
  const actual = await vi.importActual<typeof import("@/api/tasks")>("@/api/tasks");
  return {
    ...actual,
    fetchTasks: vi.fn(),
    fetchProjects: vi.fn(),
    fetchProjectEvents: vi.fn(),
    fetchTags: vi.fn(),
    createTag: vi.fn(),
    createTask: vi.fn(),
    deleteTask: vi.fn(),
    updateTask: vi.fn(),
    deleteProjectEvent: vi.fn(),
    createEventInvite: vi.fn(),
    listEventInvites: vi.fn(),
    revokeEventInvite: vi.fn(),
  };
});

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn(),
}));

vi.mock("@/hooks/useDimensions", () => ({
  useDimensions: () => ({ dimensions: [], loading: false, error: null, refetch: vi.fn() }),
}));

const mockedList = vi.mocked(listEventInvites);
const mockedFetchTasks = vi.mocked(fetchTasks);
const mockedFetchProjects = vi.mocked(fetchProjects);
const mockedFetchProjectEvents = vi.mocked(fetchProjectEvents);
const mockedFetchTags = vi.mocked(fetchTags);
const mockedFetchRecurring = vi.mocked(fetchRecurringTransactions);

const project: Project = {
  id: "project-1",
  name: "Lançamento",
  color: "#8b5cf6",
  status: "active",
  tag_ids: [],
};

function todayAtNoon(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

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

beforeEach(() => {
  mockedList.mockReset().mockResolvedValue([]);
  mockedFetchTasks.mockReset().mockResolvedValue([]);
  mockedFetchProjects.mockReset().mockResolvedValue([project]);
  mockedFetchProjectEvents.mockReset().mockResolvedValue([]);
  mockedFetchTags.mockReset().mockResolvedValue([]);
  mockedFetchRecurring.mockReset().mockResolvedValue([]);
});

function ProjectFormHarness({ events }: { events: ProjectEvent[] }) {
  const [form, setForm] = useState<ProjectCreateRequest>({
    name: project.name,
    description: "",
    color: project.color,
    goal_id: null,
    status: "active",
    tag_ids: [],
  });
  return (
    <ProjectFormDialog
      open
      onOpenChange={() => {}}
      editing={project}
      form={form}
      setForm={setForm}
      events={events}
      tags={[]}
      onSave={vi.fn()}
      onAddEvent={vi.fn()}
      onDeleteEvent={vi.fn()}
      onCreateTag={vi.fn()}
    />
  );
}

describe("Convidar a partir do ProjectFormDialog", () => {
  it("cada evento tem um botão de convidar que abre o dialog do convite", async () => {
    const user = userEvent.setup();
    render(<ProjectFormHarness events={[makeEvent()]} />);

    await user.click(
      screen.getByRole("button", { name: "Convidar para Reunião de kickoff" })
    );

    expect(
      await screen.findByText("Convidar para Reunião de kickoff")
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/E-mail de quem você quer convidar/i)
    ).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith("event-1");
  });

  it("o botão de convidar não substituiu o de excluir o evento", () => {
    render(<ProjectFormHarness events={[makeEvent()]} />);
    // O de excluir continua lá (ícone sem rótulo, então conta-se pelos botões da linha).
    expect(
      screen.getByRole("button", { name: "Convidar para Reunião de kickoff" })
    ).toBeInTheDocument();
    expect(screen.getByText(/Reunião de kickoff/)).toBeInTheDocument();
  });
});

describe("Convidar a partir do chip de evento na agenda", () => {
  async function abrirEvento(user: ReturnType<typeof userEvent.setup>, titulo: string) {
    render(
      <MemoryRouter>
        <AgendaGrid />
      </MemoryRouter>
    );
    await screen.findByText("Dom");
    await user.click(screen.getByText(titulo));
  }

  it("abrir o evento na agenda oferece 'Convidar', e o botão abre o dialog", async () => {
    const user = userEvent.setup();
    mockedFetchProjectEvents.mockResolvedValue([makeEvent()]);

    await abrirEvento(user, "Reunião de kickoff");
    await user.click(await screen.findByRole("button", { name: "Convidar" }));

    expect(
      await screen.findByLabelText(/E-mail de quem você quer convidar/i)
    ).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith("event-1");
  });

  it("evento recebido por convite (sem projeto) não oferece convidar — não é meu para repassar", async () => {
    const user = userEvent.setup();
    mockedFetchProjectEvents.mockResolvedValue([
      makeEvent({ id: "event-copia", project_id: null, title: "Evento do convite" }),
    ]);

    await abrirEvento(user, "Evento do convite");

    expect(await screen.findByText("Recebido por convite")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Convidar" })).not.toBeInTheDocument();
  });
});
