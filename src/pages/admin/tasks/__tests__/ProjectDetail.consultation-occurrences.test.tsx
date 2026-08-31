import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProjectDetail from "@/pages/admin/tasks/ProjectDetail";
import {
  fetchDependencies,
  fetchProjectById,
  fetchProjectEvents,
  fetchTags,
  fetchTasks,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Project, Task } from "@/types/tasks";

/**
 * Mesmo histórico de consultas de `TaskList.consultation-occurrences.test.tsx` (feature 061), agora
 * em `ProjectDetail.tsx`. Cobre só o suficiente pra pegar erro de wiring deste arquivo — as duas
 * telas passaram a usar o mesmo `SeriesOccurrencesDialog`, e a semântica em si já está coberta lá.
 * Uma consulta é gestão pessoal, mas nada impede que ela acabe associada a um projeto (edição
 * manual da tarefa), e nesse caso o histórico precisa ler igual dos dois lados.
 */

vi.mock("@/api/tasks", () => ({
  // Feature 085: os donos do formulário/lista carregam e gravam os links externos.
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchProjectById: vi.fn(),
  fetchProjectEvents: vi.fn(),
  fetchTasks: vi.fn(),
  fetchTags: vi.fn(),
  fetchDependencies: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  updateProject: vi.fn(),
  deleteTask: vi.fn(),
  deleteTasks: vi.fn(),
  createTag: vi.fn(),
  createProjectEvent: vi.fn(),
  deleteProjectEvent: vi.fn(),
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
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

const PROJECT_ID = "project-1";
const mockedFetchProjectById = vi.mocked(fetchProjectById);
const mockedFetchTasks = vi.mocked(fetchTasks);
const mockedFetchTags = vi.mocked(fetchTags);
const mockedFetchDependencies = vi.mocked(fetchDependencies);
const mockedFetchRecurringTransactions = vi.mocked(fetchRecurringTransactions);
const mockedFetchProjectEvents = vi.mocked(fetchProjectEvents);

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: PROJECT_ID,
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

function makeProject(overrides: Partial<Project> = {}): Project {
  return { id: PROJECT_ID, name: "Projeto X", status: "active", tag_ids: [], ...overrides };
}

async function renderInListaView(tasks: Task[]) {
  mockedFetchProjectById.mockResolvedValue(makeProject());
  mockedFetchTasks.mockResolvedValue(tasks);
  mockedFetchTags.mockResolvedValue([]);
  mockedFetchDependencies.mockResolvedValue([]);
  mockedFetchRecurringTransactions.mockResolvedValue([]);
  mockedFetchProjectEvents.mockResolvedValue([]);

  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[`/tasks/projects/${PROJECT_ID}`]}>
      <Routes>
        <Route path="/tasks/projects/:id" element={<ProjectDetail />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findAllByText(tasks.find((t) => !t.parent_task_id && t.recurrence_rule)!.title);
  await user.click(screen.getByRole("tab", { name: "Lista" }));
  return user;
}

describe("ProjectDetail — histórico de consultas no dialog de Ocorrências", () => {
  beforeEach(() => {
    mockedFetchTasks.mockReset();
  });

  it("série de consulta: ocorrência concluída mostra 'Compareceu às', sem badge Atrasada", async () => {
    const origin = makeTask({
      id: "origin-1",
      title: "Cardiologista — Dr. Silva",
      due_date: "2026-08-20",
      due_time: "14:30",
      is_consultation: true,
      recurrence_rule: { frequency: "monthly", interval: 6, time: "14:30" },
    });
    const attended = makeTask({
      id: "occ-1",
      title: "Cardiologista — Dr. Silva",
      recurrence_origin_id: "origin-1",
      due_date: "2026-02-20",
      due_time: "14:30",
      is_consultation: true,
      status: "done",
      completed_at: "2026-02-20T17:20:00.000",
    });
    const user = await renderInListaView([origin, attended]);

    await user.click(screen.getByRole("button", { name: "Ver ocorrências" }));
    const dialog = within(screen.getByRole("dialog"));

    expect(dialog.getByText(/Compareceu às 17:20/)).toBeInTheDocument();
    expect(dialog.queryByText(/Tomado às/)).not.toBeInTheDocument();
    expect(dialog.queryByText("Atrasada")).not.toBeInTheDocument();
  });

  it("série de consulta sem comparecimento mostra 'Nenhuma consulta registrada ainda.'", async () => {
    const origin = makeTask({
      id: "origin-1",
      title: "Cardiologista — Dr. Silva",
      due_date: "2026-08-20",
      due_time: "14:30",
      is_consultation: true,
      recurrence_rule: { frequency: "monthly", interval: 6, time: "14:30" },
    });
    const pending = makeTask({
      id: "occ-1",
      title: "Cardiologista — Dr. Silva",
      recurrence_origin_id: "origin-1",
      due_date: "2026-08-21",
      due_time: "14:30",
      is_consultation: true,
      status: "todo",
    });
    const user = await renderInListaView([origin, pending]);

    await user.click(screen.getByRole("button", { name: "Ver ocorrências" }));
    const dialog = within(screen.getByRole("dialog"));

    expect(dialog.getByText("Nenhuma consulta registrada ainda.")).toBeInTheDocument();
    expect(dialog.getByText("21/08/2026 14:30")).toBeInTheDocument();
  });
});
