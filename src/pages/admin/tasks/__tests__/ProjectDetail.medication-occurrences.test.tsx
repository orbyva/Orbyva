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
 * Mesmo histórico de doses da feature 049 (ver `TaskList.medication-occurrences.test.tsx`),
 * agora em `ProjectDetail.tsx` — cobre só o suficiente pra pegar erro de digitação/import
 * específico deste arquivo (a lógica de `isDoseLate`/`formatTimeOfDay` já é testada isoladamente).
 */

vi.mock("@/api/tasks", () => ({
  // Feature 085: os donos do formulário/lista carregam e gravam os links externos.
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchProjectById: vi.fn(),
  fetchTasks: vi.fn(),
  fetchTags: vi.fn(),
  fetchDependencies: vi.fn(),
  fetchProjectEvents: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  deleteTasks: vi.fn(),
  createTag: vi.fn(),
  updateProject: vi.fn(),
  createProjectEvent: vi.fn(),
  deleteProjectEvent: vi.fn(),
}));

// Feature 131: a biblioteca de assets importa `@/api/tasks/iconAssets` direto (nunca o barril, que
// arrastaria a API de tarefas inteira para o chunk de quem a monta) — é este mock que a intercepta.
vi.mock("@/api/tasks/iconAssets", () => ({
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

describe("ProjectDetail — histórico de doses no dialog de Ocorrências", () => {
  beforeEach(() => {
    mockedFetchTasks.mockReset();
  });

  it("série de medicação: dose concluída fora do horário mostra 'Tomado às' + badge Atrasada", async () => {
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
    const user = await renderInListaView([origin, dose]);

    await user.click(screen.getByRole("button", { name: "Ver ocorrências" }));
    const dialog = within(screen.getByRole("dialog"));

    expect(dialog.getByText(/Tomado às 10:30/)).toBeInTheDocument();
    expect(dialog.getByText("Atrasada")).toBeInTheDocument();
  });

  it("série que não é de medicação: comportamento inalterado", async () => {
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
    const user = await renderInListaView([origin, occurrence]);

    await user.click(screen.getByRole("button", { name: "Ver ocorrências" }));
    const dialog = within(screen.getByRole("dialog"));

    expect(dialog.queryByText(/Tomado às/)).not.toBeInTheDocument();
    expect(dialog.getByText("13/08/2026 09:00")).toBeInTheDocument();
  });
});
