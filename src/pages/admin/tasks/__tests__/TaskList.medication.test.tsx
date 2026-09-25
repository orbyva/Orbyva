import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
 * O **oposto** do que este arquivo assegurava até 2026-08-18: a tela de Tarefas não oferece mais o
 * atalho "Nova medicação".
 *
 * Reabertura da feature 064 — medicação é assunto de Vida > Saúde, e o cadastro vive em
 * `/life/health/medications` (com item próprio na sidebar, coberto por
 * `src/pages/admin/life/__tests__/health-navigation.test.tsx`). Os botões foram **removidos**, não
 * escondidos: um atalho que sobrevive "por precaução" é uma quarta entrada para o mesmo dialog.
 *
 * O que continua sendo comportamento de tarefa — a dose aparecendo na lista, o dialog
 * "Ocorrências de..." — segue coberto por `TaskList.medication-occurrences.test.tsx` e
 * `ProjectDetail.medication-occurrences.test.tsx`, que não mudaram.
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

describe("TaskList — sem atalho de medicação", () => {
  beforeEach(() => {
    toastMock.mockReset();
    mockedFetchTasks.mockReset();
  });

  it("o cabeçalho não oferece 'Nova medicação'", async () => {
    mockLoad([makeTask()]);
    render(
      <MemoryRouter>
        <TaskList />
      </MemoryRouter>
    );
    await screen.findByText("Minha tarefa");

    expect(screen.queryByRole("button", { name: "Nova medicação" })).toBeNull();
    // Controle: a tela renderizou mesmo — a ausência acima não é de página vazia.
    expect(screen.getByRole("button", { name: "Nova tarefa" })).toBeInTheDocument();
  });

  it("o EmptyState da lista vazia também não oferece 'Nova medicação'", async () => {
    mockLoad([]);
    render(
      <MemoryRouter>
        <TaskList />
      </MemoryRouter>
    );
    await screen.findByText("Nenhuma tarefa");

    expect(screen.queryByRole("button", { name: "Nova medicação" })).toBeNull();
    // A ação que sobrou no EmptyState é a de tarefa, e ela continua lá.
    expect(
      screen.getAllByRole("button", { name: "Nova tarefa" }).length
    ).toBeGreaterThan(0);
  });

  it("nenhum dialog de medicação é montado a partir desta tela", async () => {
    mockLoad([makeTask()]);
    render(
      <MemoryRouter>
        <TaskList />
      </MemoryRouter>
    );
    await screen.findByText("Minha tarefa");

    // Título do `MedicationQuickCreateDialog`, que antes ficava montado (fechado) aqui.
    expect(screen.queryByText("Nova medicação", { selector: "h2" })).toBeNull();
    expect(screen.queryByLabelText(/Nome do remédio/)).toBeNull();
  });
});
