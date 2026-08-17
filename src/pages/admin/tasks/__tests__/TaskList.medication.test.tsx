import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TaskList from "@/pages/admin/tasks/TaskList";
import {
  fetchDependencies,
  fetchProjects,
  fetchTags,
  fetchTasks,
} from "@/api/tasks";
import { createMedicationWithDoses } from "@/api/health/medications";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Task } from "@/types/tasks";

/**
 * Atalho "Nova medicação" (features 049 e 064) — cobre a abertura do dialog a partir do header e
 * do botão que aparece no `EmptyState` (lista vazia), e que criar com sucesso recarrega a lista
 * (novo `fetchTasks`) e fecha o dialog. O conteúdo do form em si (validação, payload) já é coberto
 * isoladamente em `MedicationQuickCreateDialog.test.tsx`.
 *
 * Desde a 064 o dialog grava numa `medication` (`createMedicationWithDoses`), não mais numa tarefa
 * recorrente — daí o mock de `@/api/health/medications` no lugar do de `createTask`.
 */

vi.mock("@/api/health/medications", () => ({
  createMedicationWithDoses: vi.fn(async () => ({ id: "med-1" })),
  updateMedication: vi.fn(),
}));

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

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const mockedFetchTasks = vi.mocked(fetchTasks);
const mockedFetchProjects = vi.mocked(fetchProjects);
const mockedFetchTags = vi.mocked(fetchTags);
const mockedFetchDependencies = vi.mocked(fetchDependencies);
const mockedFetchRecurringTransactions = vi.mocked(fetchRecurringTransactions);
const mockedCreateMedication = vi.mocked(createMedicationWithDoses);

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Minha tarefa",
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

function mockLoad(tasks: Task[]) {
  mockedFetchTasks.mockResolvedValue(tasks);
  mockedFetchProjects.mockResolvedValue([]);
  mockedFetchTags.mockResolvedValue([]);
  mockedFetchDependencies.mockResolvedValue([]);
  mockedFetchRecurringTransactions.mockResolvedValue([]);
}

describe("TaskList — atalho Nova medicação", () => {
  beforeEach(() => {
    toastMock.mockReset();
    mockedFetchTasks.mockReset();
    mockedCreateMedication.mockClear();
  });

  it("clicar em 'Nova medicação' no header abre o MedicationQuickCreateDialog", async () => {
    const user = userEvent.setup();
    mockLoad([makeTask()]);
    render(
      <MemoryRouter>
        <TaskList />
      </MemoryRouter>
    );
    await screen.findByText("Minha tarefa");

    await user.click(screen.getAllByRole("button", { name: "Nova medicação" })[0]);

    expect(screen.getByText("Nova medicação", { selector: "h2" })).toBeInTheDocument();
  });

  it("lista vazia mostra o botão 'Nova medicação' no EmptyState também", async () => {
    mockLoad([]);
    render(
      <MemoryRouter>
        <TaskList />
      </MemoryRouter>
    );
    await screen.findByText("Nenhuma tarefa");

    expect(screen.getAllByRole("button", { name: "Nova medicação" }).length).toBeGreaterThan(1);
  });

  it("criar medicação com sucesso recarrega a lista e fecha o dialog", async () => {
    const user = userEvent.setup();
    mockLoad([makeTask()]);
    render(
      <MemoryRouter>
        <TaskList />
      </MemoryRouter>
    );
    await screen.findByText("Minha tarefa");

    await user.click(screen.getAllByRole("button", { name: "Nova medicação" })[0]);
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText(/Nome do remédio/), "Losartana");
    await user.type(dialog.getByLabelText("Horário 1"), "08:00");
    await user.click(dialog.getByRole("button", { name: "Criar" }));

    await waitFor(() => expect(mockedCreateMedication).toHaveBeenCalled());
    await waitFor(() => expect(mockedFetchTasks).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Nova medicação", { selector: "h2" })).not.toBeInTheDocument();
  });
});
