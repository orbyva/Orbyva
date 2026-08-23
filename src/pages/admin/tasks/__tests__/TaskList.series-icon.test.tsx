import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TaskList from "@/pages/admin/tasks/TaskList";
import {
  fetchDependencies,
  fetchProjects,
  fetchTags,
  fetchTasks,
  updateTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Task } from "@/types/tasks";

/**
 * Feature 073 — o caminho de UI completo da Lista: trocar o ícone numa **ocorrência** manda o id da
 * própria ocorrência pro `updateTask` (é o servidor que resolve a origem e espalha pra série) e,
 * logo depois, refaz a busca (`load()`), que é o que faz Lista, Kanban, Gantt e chips da Agenda
 * mostrarem o ícone novo sem reload manual.
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

vi.mock("@/api/health/medications", () => ({
  createMedicationWithDoses: vi.fn(),
  updateMedication: vi.fn(),
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
const mockedUpdateTask = vi.mocked(updateTask);

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Academia",
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

beforeEach(() => {
  toastMock.mockReset();
  mockedFetchTasks.mockReset();
  mockedUpdateTask.mockReset().mockResolvedValue(undefined);
  vi.mocked(fetchProjects).mockResolvedValue([]);
  vi.mocked(fetchTags).mockResolvedValue([]);
  vi.mocked(fetchDependencies).mockResolvedValue([]);
  vi.mocked(fetchRecurringTransactions).mockResolvedValue([]);
});

describe("TaskList — trocar o ícone de uma ocorrência recorrente (feature 073)", () => {
  it("manda o id da ocorrência, refaz a busca e a lista já mostra o ícone novo", async () => {
    const user = userEvent.setup();
    const ocorrencia = makeTask({ id: "oco-2", recurrence_origin_id: "origem" });
    // Primeira carga: série sem ícone. Segunda carga (depois do `load()`): o servidor já propagou
    // o ícone para a série inteira — é o estado que a Lista tem de refletir sozinha.
    mockedFetchTasks
      .mockResolvedValueOnce([ocorrencia])
      .mockResolvedValue([{ ...ocorrencia, icon_key: "star" }]);

    render(
      <MemoryRouter>
        <TaskList />
      </MemoryRouter>
    );
    await screen.findByText("Academia");

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    await user.click(await screen.findByRole("button", { name: "Estrela" }));

    // O id enviado é o da ocorrência: quem resolve a origem e espalha é `propagateIconToSeries`,
    // no servidor — a UI não precisa saber quem é a origem para gravar.
    expect(mockedUpdateTask).toHaveBeenCalledWith({
      id: "oco-2",
      icon_key: "star",
      icon_url: null,
    });

    // `load()` disparado: a segunda busca é o que traz a série já uniformizada.
    await waitFor(() => expect(mockedFetchTasks).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Trocar ícone" })).toBeInTheDocument()
    );
    expect(await screen.findByLabelText("Estrela")).toBeInTheDocument();
  });

  it("falha ao gravar mostra toast de erro (a propagação não é engolida em silêncio)", async () => {
    const user = userEvent.setup();
    mockedFetchTasks.mockResolvedValue([makeTask({ id: "oco-2", recurrence_origin_id: "origem" })]);
    mockedUpdateTask.mockRejectedValue(new Error("falha na propagação"));

    render(
      <MemoryRouter>
        <TaskList />
      </MemoryRouter>
    );
    await screen.findByText("Academia");

    await user.click(screen.getByRole("button", { name: "Definir ícone" }));
    await user.click(await screen.findByRole("button", { name: "Estrela" }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      )
    );
  });
});
