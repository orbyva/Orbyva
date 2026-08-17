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
 * Dialog "Ocorrências de..." para séries de consulta médica (feature 061), pelo `TaskList` — mesmo
 * lugar em que a 049 mostra o histórico de doses, agora com a semântica de consulta: "Compareceu
 * às HH:mm" na ocorrência concluída, "Nenhuma consulta registrada ainda." enquanto não houver
 * nenhuma, e sem o badge "Atrasada" (que é critério de dose, não de consulta).
 *
 * O dialog virou o componente compartilhado `SeriesOccurrencesDialog`, usado por `TaskList` e
 * `ProjectDetail` — a não-regressão da medicação continua provada por
 * `TaskList.medication-occurrences.test.tsx` e `ProjectDetail.medication-occurrences.test.tsx`.
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

/** Série de retorno a cada 6 meses com o especialista no título (decisão da feature). */
function consultationOrigin(overrides: Partial<Task> = {}): Task {
  return makeTask({
    id: "origin-1",
    title: "Cardiologista — Dr. Silva",
    due_date: "2026-08-20",
    due_time: "14:30",
    is_consultation: true,
    recurrence_rule: { frequency: "monthly", interval: 6, time: "14:30" },
    ...overrides,
  });
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

describe("TaskList — histórico de consultas no dialog de Ocorrências", () => {
  beforeEach(() => {
    mockedFetchTasks.mockReset();
  });

  it("consulta concluída mostra 'Compareceu às HH:mm' a partir do completed_at", async () => {
    const user = userEvent.setup();
    const attended = makeTask({
      id: "occ-1",
      title: "Cardiologista — Dr. Silva",
      recurrence_origin_id: "origin-1",
      due_date: "2026-02-20",
      due_time: "14:30",
      is_consultation: true,
      status: "done",
      completed_at: "2026-02-20T15:10:00.000",
    });
    await renderWithTasks([consultationOrigin(), attended]);

    const dialog = await openSeriesDialog(user);

    expect(dialog.getByText(/Compareceu às 15:10/)).toBeInTheDocument();
    // O horário agendado dá lugar ao horário real — não aparecem os dois.
    expect(dialog.queryByText("20/02/2026 14:30")).not.toBeInTheDocument();
    // "Tomado às" é de medicação; consulta não empresta o texto da 049.
    expect(dialog.queryByText(/Tomado às/)).not.toBeInTheDocument();
  });

  it("chegar bem depois do horário marcado não vira badge 'Atrasada' (isso é critério de dose)", async () => {
    const user = userEvent.setup();
    const attended = makeTask({
      id: "occ-1",
      title: "Cardiologista — Dr. Silva",
      recurrence_origin_id: "origin-1",
      due_date: "2026-02-20",
      due_time: "14:30",
      is_consultation: true,
      status: "done",
      // Quase 3h depois do horário marcado — para uma dose isso seria "Atrasada".
      completed_at: "2026-02-20T17:20:00.000",
    });
    await renderWithTasks([consultationOrigin(), attended]);

    const dialog = await openSeriesDialog(user);

    expect(dialog.getByText(/Compareceu às 17:20/)).toBeInTheDocument();
    expect(dialog.queryByText("Atrasada")).not.toBeInTheDocument();
  });

  it("série de consulta sem nenhum comparecimento mostra o texto vazio próprio", async () => {
    const user = userEvent.setup();
    const pending = makeTask({
      id: "occ-1",
      title: "Cardiologista — Dr. Silva",
      recurrence_origin_id: "origin-1",
      due_date: "2026-08-21",
      due_time: "14:30",
      is_consultation: true,
      status: "todo",
    });
    await renderWithTasks([consultationOrigin(), pending]);

    const dialog = await openSeriesDialog(user);

    expect(dialog.getByText("Nenhuma consulta registrada ainda.")).toBeInTheDocument();
    expect(dialog.queryByText("Nenhuma dose registrada ainda.")).not.toBeInTheDocument();
    // Ocorrência ainda não realizada continua mostrando o horário agendado.
    expect(dialog.getByText("21/08/2026 14:30")).toBeInTheDocument();
  });

  it("série comum continua sem 'Compareceu às' e sem texto vazio", async () => {
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

    expect(dialog.queryByText(/Compareceu às/)).not.toBeInTheDocument();
    expect(dialog.queryByText("Nenhuma consulta registrada ainda.")).not.toBeInTheDocument();
    expect(dialog.getByText("13/08/2026 09:00")).toBeInTheDocument();
  });
});
