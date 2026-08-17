import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TaskList from "@/pages/admin/tasks/TaskList";
import {
  fetchDependencies,
  fetchProjects,
  fetchTags,
  fetchTasks,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Task } from "@/types/tasks";

/**
 * Dialog "Ocorrências de..." exibindo histórico de doses pra séries de medicação (feature 049) —
 * "Tomado às HH:mm" + badge "Atrasada" pra ocorrências concluídas, texto vazio quando nenhuma
 * dose foi registrada ainda, e nenhuma mudança de comportamento pra séries que não são medicação.
 */

vi.mock("@/api/tasks", () => ({
  fetchTasks: vi.fn(),
  fetchProjects: vi.fn(),
  fetchTags: vi.fn(),
  fetchDependencies: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  deleteTasks: vi.fn(),
  createTag: vi.fn(),
  uploadTaskIcon: vi.fn(),
}));

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn(),
  createRecurringApi: vi.fn(),
}));

vi.mock("@/hooks/useDimensions", () => ({
  useDimensions: () => ({ dimensions: [], loading: false, error: null, refetch: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

const mockedFetchTasks = vi.mocked(fetchTasks);
const mockedFetchProjects = vi.mocked(fetchProjects);
const mockedFetchTags = vi.mocked(fetchTags);
const mockedFetchDependencies = vi.mocked(fetchDependencies);
const mockedFetchRecurringTransactions = vi.mocked(fetchRecurringTransactions);

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Tarefa",
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

async function renderWithTasks(tasks: Task[]) {
  mockedFetchTasks.mockResolvedValue(tasks);
  mockedFetchProjects.mockResolvedValue([]);
  mockedFetchTags.mockResolvedValue([]);
  mockedFetchDependencies.mockResolvedValue([]);
  mockedFetchRecurringTransactions.mockResolvedValue([]);

  const utils = render(
    <MemoryRouter>
      <TaskList />
    </MemoryRouter>
  );
  await screen.findByText(tasks.find((t) => !t.parent_task_id && t.recurrence_rule)!.title);
  return utils;
}

async function openSeriesDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Ver ocorrências" }));
  return within(screen.getByRole("dialog"));
}

describe("TaskList — histórico de doses no dialog de Ocorrências", () => {
  beforeEach(() => {
    mockedFetchTasks.mockReset();
  });

  it("série de medicação: ocorrência concluída no horário mostra 'Tomado às HH:mm' sem badge Atrasada", async () => {
    const user = userEvent.setup();
    const origin = makeTask({
      id: "origin-1",
      title: "Losartana",
      due_date: "2026-08-20",
      due_time: "08:00",
      is_medication: true,
      recurrence_rule: { frequency: "daily", interval: 1, time: "08:00" },
    });
    const dose = makeTask({
      id: "dose-1",
      title: "Losartana",
      recurrence_origin_id: "origin-1",
      due_date: "2026-08-16",
      due_time: "08:00",
      is_medication: true,
      status: "done",
      completed_at: "2026-08-16T08:05:00.000",
    });
    await renderWithTasks([origin, dose]);

    const dialog = await openSeriesDialog(user);

    expect(dialog.getByText(/Tomado às 08:05/)).toBeInTheDocument();
    expect(dialog.queryByText("Atrasada")).not.toBeInTheDocument();
  });

  it("série de medicação: ocorrência concluída bem depois do horário mostra badge Atrasada", async () => {
    const user = userEvent.setup();
    const origin = makeTask({
      id: "origin-1",
      title: "Losartana",
      due_date: "2026-08-20",
      due_time: "08:00",
      is_medication: true,
      recurrence_rule: { frequency: "daily", interval: 1, time: "08:00" },
    });
    const dose = makeTask({
      id: "dose-1",
      title: "Losartana",
      recurrence_origin_id: "origin-1",
      due_date: "2026-08-16",
      due_time: "08:00",
      is_medication: true,
      status: "done",
      completed_at: "2026-08-16T10:30:00.000",
    });
    await renderWithTasks([origin, dose]);

    const dialog = await openSeriesDialog(user);

    expect(dialog.getByText(/Tomado às 10:30/)).toBeInTheDocument();
    expect(dialog.getByText("Atrasada")).toBeInTheDocument();
  });

  it("série de medicação sem nenhuma dose concluída mostra o texto vazio", async () => {
    const user = userEvent.setup();
    const origin = makeTask({
      id: "origin-1",
      title: "Losartana",
      due_date: "2026-08-20",
      due_time: "08:00",
      is_medication: true,
      recurrence_rule: { frequency: "daily", interval: 1, time: "08:00" },
    });
    const pendingDose = makeTask({
      id: "dose-1",
      title: "Losartana",
      recurrence_origin_id: "origin-1",
      due_date: "2026-08-21",
      due_time: "08:00",
      is_medication: true,
      status: "todo",
    });
    await renderWithTasks([origin, pendingDose]);

    const dialog = await openSeriesDialog(user);

    expect(dialog.getByText("Nenhuma dose registrada ainda.")).toBeInTheDocument();
    // Ocorrência não concluída continua mostrando o horário agendado normalmente.
    expect(dialog.getByText("21/08/2026 08:00")).toBeInTheDocument();
  });

  it("série que não é de medicação: comportamento inalterado (sem 'Tomado às', sem texto vazio)", async () => {
    const user = userEvent.setup();
    const origin = makeTask({
      id: "origin-1",
      title: "Reunião semanal",
      due_date: "2026-08-20",
      due_time: "09:00",
      recurrence_rule: { frequency: "weekly", interval: 1, time: "09:00" },
    });
    const occurrence = makeTask({
      id: "occ-1",
      title: "Reunião semanal",
      recurrence_origin_id: "origin-1",
      due_date: "2026-08-13",
      due_time: "09:00",
      status: "done",
      completed_at: "2026-08-13T09:10:00.000",
    });
    await renderWithTasks([origin, occurrence]);

    const dialog = await openSeriesDialog(user);

    expect(dialog.queryByText(/Tomado às/)).not.toBeInTheDocument();
    expect(dialog.queryByText("Nenhuma dose registrada ainda.")).not.toBeInTheDocument();
    expect(dialog.getByText("13/08/2026 09:00")).toBeInTheDocument();
  });
});
