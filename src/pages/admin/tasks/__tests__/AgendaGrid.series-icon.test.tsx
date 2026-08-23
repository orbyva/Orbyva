import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AgendaGrid } from "@/pages/admin/tasks/AgendaGrid";
import { fetchProjectEvents, fetchProjects, fetchTags, fetchTasks } from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Task } from "@/types/tasks";

/**
 * Feature 073 na Agenda — as **ocorrências virtuais** (preview do futuro, nunca persistido: objeto
 * em memória criado por spread da origem em `AgendaGrid`) têm de mostrar o mesmo ícone das
 * ocorrências reais da série. Elas já herdavam o ícone pelo spread; este arquivo é o que denuncia
 * se alguém trocar o spread por uma lista explícita de campos depois — que foi exatamente o buraco
 * que existia do outro lado, na materialização.
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
  deleteProjectEvent: vi.fn(),
}));

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn(),
}));

vi.mock("@/api/health/medications", () => ({
  fetchMedications: vi.fn().mockResolvedValue([]),
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

/** Domingo, 16/08/2026 — a grade do mês vai de 26/07 a 05/09. */
const TODAY = "2026-08-16";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Academia",
    status: "todo",
    tag_ids: [],
    due_date: TODAY,
    due_time: null,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    ...overrides,
  };
}

async function renderLoaded(tasks: Task[]) {
  mockedFetchTasks.mockResolvedValue(tasks);
  const utils = render(
    <MemoryRouter>
      <AgendaGrid />
    </MemoryRouter>
  );
  await screen.findByText("Dom");
  return utils;
}

/** A célula do mês que contém o número do dia — o `<div>` da grade, não o badge do número. */
function dayCellOf(dayNumber: string): HTMLElement {
  const badge = screen
    .getAllByText(dayNumber)
    .find((node) => node.className.includes("rounded-full"));
  if (!badge) throw new Error(`célula do dia ${dayNumber} não encontrada`);
  return badge.parentElement as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 16, 9, 0, 0));
  toastMock.mockReset();
  mockedFetchTasks.mockReset();
  mockedFetchProjects.mockReset().mockResolvedValue([]);
  mockedFetchProjectEvents.mockReset().mockResolvedValue([]);
  mockedFetchTags.mockReset().mockResolvedValue([]);
  mockedFetchRecurringTransactions.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AgendaGrid — ocorrência virtual herda o ícone da série (feature 073)", () => {
  it("no mês, o preview futuro mostra o mesmo ícone da origem e da ocorrência já criada", async () => {
    await renderLoaded([
      makeTask({
        id: "origem",
        due_date: "2026-08-09",
        recurrence_rule: { frequency: "weekly", interval: 1 },
        icon_key: "star",
      }),
      // ocorrência real, já materializada, com o ícone copiado pela materialização
      makeTask({
        id: "oco-1",
        due_date: "2026-08-16",
        recurrence_origin_id: "origem",
        icon_key: "star",
      }),
    ]);

    // Dia 09 (origem) e 16 (ocorrência real) desenham o ícone…
    expect(
      within(dayCellOf("9")).getAllByLabelText("Estrela").length
    ).toBeGreaterThan(0);
    expect(
      within(dayCellOf("16")).getAllByLabelText("Estrela").length
    ).toBeGreaterThan(0);

    // …e o dia 23 é a próxima ocorrência, ainda **virtual** (nada em `fetchTasks`), com o mesmo
    // ícone e o título em itálico do preview.
    const futura = dayCellOf("23");
    expect(within(futura).getByText("Academia")).toBeInTheDocument();
    expect(within(futura).getAllByLabelText("Estrela").length).toBeGreaterThan(0);
  });

  it("na visão Semana, o bloco da ocorrência virtual também mostra o ícone da origem", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderLoaded([
      makeTask({
        id: "origem",
        due_date: "2026-08-09",
        due_time: "07:00",
        recurrence_rule: { frequency: "weekly", interval: 1, time: "07:00" },
        icon_key: "star",
      }),
    ]);

    await user.click(screen.getByRole("tab", { name: "Semana" }));
    await screen.findByText("00:00");

    // A semana de 16–22/08 só tem a ocorrência virtual do dia 16 (a origem é 09/08).
    const bloco = await screen.findByTitle(
      "Próxima ocorrência — ainda não criada, aparece automaticamente nesse dia"
    );
    expect(within(bloco).getByText("Academia")).toBeInTheDocument();
    expect(within(bloco).getByLabelText("Estrela")).toBeInTheDocument();
  });

  it("série sem ícone: o preview futuro não inventa ícone nenhum", async () => {
    await renderLoaded([
      makeTask({
        id: "origem",
        title: "Reunião",
        due_date: "2026-08-09",
        recurrence_rule: { frequency: "weekly", interval: 1 },
      }),
    ]);

    const futura = dayCellOf("23");
    expect(within(futura).getByText("Reunião")).toBeInTheDocument();
    expect(within(futura).queryByLabelText("Estrela")).toBeNull();
  });
});
