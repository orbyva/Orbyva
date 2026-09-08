import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AgendaGrid } from "@/pages/admin/tasks/AgendaGrid";
import {
  fetchProjectEvents,
  fetchProjects,
  fetchTags,
  fetchTasks,
  updateProjectEvent,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Project, ProjectEvent } from "@/types/tasks";

/**
 * Feature 103 — evento passa a ser **editável** pela Agenda.
 *
 * Sem isto, criar pela Agenda seria criar sem conserto: até esta feature `project_event` só tinha
 * insert e delete, e um horário errado só se resolvia apagando e recriando. A 104, que cria por
 * arrasto (horário aproximado por definição), depende deste caminho existir.
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
const mockedUpdateProjectEvent = vi.mocked(updateProjectEvent);
const mockedFetchRecurringTransactions = vi.mocked(fetchRecurringTransactions);

const ALPHA: Project = { id: "p-alpha", name: "Alpha", status: "active", tag_ids: [] };

const HOJE = new Date();
const MES = `${HOJE.getFullYear()}-${String(HOJE.getMonth() + 1).padStart(2, "0")}`;
const DIA = `${MES}-10`;
/** Montado em **hora local** de propósito: é assim que o formulário relê o `starts_at`. */
const AS_10H = new Date(HOJE.getFullYear(), HOJE.getMonth(), 10, 10, 0).toISOString();

function makeEvent(overrides: Partial<ProjectEvent> = {}): ProjectEvent {
  return {
    id: "ev-1",
    project_id: ALPHA.id,
    title: "Reunião de equipe",
    starts_at: AS_10H,
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

/** Chip do evento → dialog de detalhe → "Editar" → formulário em modo edição. */
async function abrirEdicao(user: ReturnType<typeof userEvent.setup>, titulo: string) {
  await user.click(screen.getByText(titulo));
  await user.click(await screen.findByRole("button", { name: "Editar" }));
  await screen.findByText("Editar evento");
}

beforeEach(() => {
  localStorage.clear();
  mockedFetchTasks.mockReset().mockResolvedValue([]);
  mockedFetchProjects.mockReset().mockResolvedValue([ALPHA]);
  mockedFetchProjectEvents.mockReset().mockResolvedValue([makeEvent()]);
  mockedFetchTags.mockReset().mockResolvedValue([]);
  mockedUpdateProjectEvent.mockReset().mockResolvedValue(makeEvent());
  mockedFetchRecurringTransactions.mockReset().mockResolvedValue([]);
});

describe("AgendaGrid — editar evento (feature 103)", () => {
  it("abre o formulário já preenchido com o que está no banco", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await abrirEdicao(user, "Reunião de equipe");

    expect(screen.getByLabelText(/^Título/)).toHaveValue("Reunião de equipe");
    expect(screen.getByLabelText(/^Data/)).toHaveValue(DIA);
    expect(screen.getByLabelText(/^Início/)).toHaveValue("10:00");
    // Projeto do evento vem selecionado.
    expect(screen.getByRole("option", { name: "Alpha" })).toHaveAttribute("aria-selected", "true");
  });

  it("mudar o horário chama updateProjectEvent com o id certo e o novo starts_at", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await abrirEdicao(user, "Reunião de equipe");
    await user.clear(screen.getByLabelText(/^Início/));
    await user.type(screen.getByLabelText(/^Início/), "14:30");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mockedUpdateProjectEvent).toHaveBeenCalledTimes(1));
    const [payload] = mockedUpdateProjectEvent.mock.calls[0];
    expect(payload.id).toBe("ev-1");
    const inicio = new Date(payload.starts_at!);
    expect(inicio.getHours()).toBe(14);
    expect(inicio.getMinutes()).toBe(30);
    expect(inicio.getDate()).toBe(10);
    // Editar nunca cai no caminho de criação.
    expect(payload.project_id).toBe(ALPHA.id);
  });

  it("a cópia recebida por convite é editável, avisando que a alteração não volta para o anfitrião", async () => {
    const user = userEvent.setup();
    mockedFetchProjectEvents.mockResolvedValue([
      makeEvent({ id: "ev-convite", project_id: null, title: "Convite recebido" }),
    ]);
    await renderLoaded();

    await abrirEdicao(user, "Convite recebido");

    expect(screen.getByText(/não volta para quem convidou/i)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Início/));
    await user.type(screen.getByLabelText(/^Início/), "11:00");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mockedUpdateProjectEvent).toHaveBeenCalledTimes(1));
    expect(mockedUpdateProjectEvent.mock.calls[0][0].id).toBe("ev-convite");
  });

  it("o evento próprio não mostra o aviso de convite", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await abrirEdicao(user, "Reunião de equipe");

    expect(screen.queryByText(/não volta para quem convidou/i)).not.toBeInTheDocument();
  });
});
