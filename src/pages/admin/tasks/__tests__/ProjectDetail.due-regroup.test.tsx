import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProjectDetail from "@/pages/admin/tasks/ProjectDetail";
import {
  fetchDependencies,
  fetchProjectById,
  fetchProjectEvents,
  fetchTags,
  fetchTasks,
  updateTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Project, Task } from "@/types/tasks";

/**
 * Feature 081 na página do projeto — a Lista daqui repete a mecânica da Lista principal: com o
 * popover de prazo aberto o card fica parado (feature 029), ao fechar ele cai na caixa certa, o
 * toast diz para onde foi, e uma falha no `updateTask` desfaz o otimismo.
 */

vi.mock("@/api/tasks", () => ({
  // Feature 106: o formulário em edição procura quem cita a tarefa ("Referenciada em").
  fetchTasksMentioningTask: vi.fn(async () => []),
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
  deleteTaskSeries: vi.fn(),
  createTag: vi.fn(),
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
  updateProject: vi.fn(),
  createProjectEvent: vi.fn(),
  deleteProjectEvent: vi.fn(),
}));

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn(),
  createRecurringApi: vi.fn(),
}));

vi.mock("@/api/shopping/categories", () => ({
  fetchShoppingCategories: vi.fn(async () => []),
  countShoppingCategoriesByProject: vi.fn(async () => 0),
}));

vi.mock("@/api/shopping/items", () => ({
  fetchShoppingItems: vi.fn(async () => []),
}));

vi.mock("@/api/notes/notes", () => ({
  // Feature 106: a outra metade de "Referenciada em".
  fetchNotesMentioningTask: vi.fn(async () => []),
  fetchNotes: vi.fn(async () => []),
  createNote: vi.fn(),
  countNotesByProject: vi.fn(async () => 0),
}));

vi.mock("@/hooks/useDimensions", () => ({
  useDimensions: () => ({ dimensions: [], loading: false, error: null, refetch: vi.fn() }),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const PROJECT_ID = "p1";

const project: Project = {
  id: PROJECT_ID,
  name: "Obra da casa",
  description: "Reforma",
  color: null,
  goal_id: null,
  status: "active",
  tag_ids: [],
};

/** "Servidor" em memória: `updateTask` grava aqui e o `load()` seguinte relê daqui. */
let store: Task[] = [];
let updateShouldFail = false;

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

function bucketSection(label: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: new RegExp(`^${label}`) });
  return heading.parentElement as HTMLElement;
}

function hasBucket(label: string): boolean {
  return screen.queryByRole("heading", { name: new RegExp(`^${label}`) }) !== null;
}

async function pickDay(user: ReturnType<typeof userEvent.setup>, iso: string) {
  await screen.findByRole("dialog");
  const day = document.querySelector(`[data-day="${iso}"] button`);
  expect(day).not.toBeNull();
  await user.click(day as HTMLButtonElement);
}

async function renderLista(user: ReturnType<typeof userEvent.setup>) {
  render(
    <MemoryRouter initialEntries={[`/tasks/projects/${PROJECT_ID}`]}>
      <Routes>
        <Route path="/tasks/projects/:id" element={<ProjectDetail />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByText(project.name);
  // Kanban é a aba inicial; a Lista é a que agrupa por prazo.
  await user.click(screen.getByRole("tab", { name: "Lista" }));
}

describe("ProjectDetail — alterar o prazo reagrupa a Lista do projeto (feature 081)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // 20/08/2026 (quinta) — a semana termina no sábado 22, então 27/08 cai em "Este mês".
    vi.setSystemTime(new Date(2026, 7, 20, 10, 0, 0));
    localStorage.clear();
    updateShouldFail = false;
    store = [];
    vi.mocked(fetchProjectById).mockResolvedValue(project);
    vi.mocked(fetchTasks).mockImplementation(async () => store.map((t) => ({ ...t })));
    vi.mocked(fetchTags).mockResolvedValue([]);
    vi.mocked(fetchDependencies).mockResolvedValue([]);
    vi.mocked(fetchRecurringTransactions).mockResolvedValue([]);
    vi.mocked(fetchProjectEvents).mockResolvedValue([]);
    vi.mocked(updateTask).mockImplementation(async (payload) => {
      if (updateShouldFail) throw new Error("falha de rede");
      const index = store.findIndex((t) => t.id === payload.id);
      if (index >= 0) store[index] = { ...store[index], ...payload } as Task;
      return undefined as never;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("com o popover aberto o card fica parado; ao fechar, cai em «Hoje» e o toast diz para onde foi", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    store = [makeTask({ title: "Comprar cimento" })];
    await renderLista(user);

    expect(within(bucketSection("Sem prazo")).getByText("Comprar cimento")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /\+ Prazo/ }));
    await pickDay(user, "2026-08-20");

    await waitFor(() => expect(store[0].due_date).toBe("2026-08-20"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(bucketSection("Sem prazo")).getByText("Comprar cimento")).toBeInTheDocument();
    expect(hasBucket("Hoje")).toBe(false);

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(within(bucketSection("Hoje")).getByText("Comprar cimento")).toBeInTheDocument()
    );
    expect(hasBucket("Sem prazo")).toBe(false);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Movida para «Hoje»" })
    );
  });

  it("erro no updateTask desfaz o otimismo e nada reagrupa", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    store = [makeTask({ title: "Pintar parede", due_date: "2026-08-27" })];
    await renderLista(user);

    expect(within(bucketSection("Este mês")).getByText("Pintar parede")).toBeInTheDocument();

    updateShouldFail = true;
    await user.click(screen.getByRole("button", { name: /27\/08\/2026/ }));
    await pickDay(user, "2026-08-20");

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      )
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /27\/08\/2026/ })).toBeInTheDocument()
    );

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(bucketSection("Este mês")).getByText("Pintar parede")).toBeInTheDocument();
    expect(hasBucket("Hoje")).toBe(false);
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("Movida para") })
    );
  });
});
