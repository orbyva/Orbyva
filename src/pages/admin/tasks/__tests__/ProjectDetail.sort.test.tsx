import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { TASK_SORT_STORAGE_KEY } from "@/lib/taskSortPreference";
import type { Project, Task } from "@/types/tasks";

/**
 * Feature 079 na página do projeto: a Lista e o Kanban do projeto usam o mesmo seletor
 * "Ordenar por" da Lista principal, lendo e gravando **a mesma** preferência de navegador.
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
  fetchNotes: vi.fn(async () => []),
  createNote: vi.fn(),
}));

vi.mock("@/api/notes/projectDocuments", () => ({
  fetchProjectDocuments: vi.fn(async () => []),
  countProjectDocuments: vi.fn(async () => 0),
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

/**
 * Chegam na ordem de prazo; a ordem por atualização é outra (Beta, Gama, Alfa).
 *
 * Os prazos precisam cair **no mesmo balde** de `AGENDA_BUCKET_ORDER`: a Lista do projeto agrupa
 * por balde antes de ordenar, então tarefas espalhadas em `overdue`/`today`/`this_week` fariam a
 * ordem dos baldes atropelar o comparador e o teste mediria outra coisa. Fev/2027 é depois do fim
 * do mês corrente do relógio congelado abaixo (20/08/2026) → as três caem em `later` juntas.
 */
const TASKS: Task[] = [
  makeTask({
    id: "t-alfa",
    title: "Alfa",
    due_date: "2027-02-10",
    created_at: "2026-08-01T08:00:00Z",
    updated_at: "2026-08-19T09:00:00Z",
  }),
  makeTask({
    id: "t-beta",
    title: "Beta",
    due_date: "2027-02-11",
    created_at: "2026-08-02T08:00:00Z",
    updated_at: "2026-08-19T11:00:00Z",
  }),
  makeTask({
    id: "t-gama",
    title: "Gama",
    due_date: "2027-02-12",
    created_at: "2026-08-03T08:00:00Z",
    updated_at: "2026-08-19T10:00:00Z",
  }),
];

const TITLES = ["Alfa", "Beta", "Gama"];

function titlesIn(section: HTMLElement): string[] {
  return within(section)
    .getAllByText(new RegExp(`^(${TITLES.join("|")})$`))
    .map((el) => el.textContent ?? "");
}

function listPanel(): HTMLElement {
  return screen.getByRole("tabpanel");
}

function sortButton(label: string): HTMLElement {
  return within(screen.getByRole("group", { name: "Ordenar por" })).getByRole("button", {
    name: label,
  });
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/tasks/projects/${PROJECT_ID}`]}>
      <Routes>
        <Route path="/tasks/projects/:id" element={<ProjectDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProjectDetail — ordenar por última atualização (feature 079)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Relógio congelado como nos vizinhos (`TaskList.sort`, `ProjectDetail.due-regroup`): sem isso
    // os baldes da agenda mudam conforme o dia real e a ordem esperada aqui deixa de valer.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 7, 20, 10, 0, 0));
    localStorage.clear();
    vi.mocked(fetchProjectById).mockResolvedValue(project);
    vi.mocked(fetchTasks).mockResolvedValue(TASKS.map((t) => ({ ...t })));
    vi.mocked(fetchTags).mockResolvedValue([]);
    vi.mocked(fetchDependencies).mockResolvedValue([]);
    vi.mocked(fetchRecurringTransactions).mockResolvedValue([]);
    vi.mocked(fetchProjectEvents).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("a Lista do projeto abre ordenada por última atualização", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDetail();
    await screen.findByText(project.name);

    await user.click(screen.getByRole("tab", { name: "Lista" }));

    expect(sortButton("Última atualização")).toHaveAttribute("aria-pressed", "true");
    expect(titlesIn(listPanel())).toEqual(["Beta", "Gama", "Alfa"]);
  });

  it("trocar para «Prazo» reordena a Lista do projeto e grava a preferência compartilhada", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDetail();
    await screen.findByText(project.name);
    await user.click(screen.getByRole("tab", { name: "Lista" }));

    await user.click(sortButton("Prazo"));

    expect(titlesIn(listPanel())).toEqual(["Alfa", "Beta", "Gama"]);
    // Mesma chave que a Lista principal lê: escolher aqui vale lá.
    expect(localStorage.getItem(TASK_SORT_STORAGE_KEY)).toBe("due");
  });

  it("a preferência já salva pela Lista principal vale ao abrir o projeto", async () => {
    localStorage.setItem(TASK_SORT_STORAGE_KEY, "due");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDetail();
    await screen.findByText(project.name);

    await user.click(screen.getByRole("tab", { name: "Lista" }));

    expect(sortButton("Prazo")).toHaveAttribute("aria-pressed", "true");
    expect(titlesIn(listPanel())).toEqual(["Alfa", "Beta", "Gama"]);
  });

  it("o Kanban do projeto segue a mesma preferência", async () => {
    renderDetail();
    await screen.findByText(project.name);

    // Kanban é a aba inicial: sem preferência salva, a coluna sai por última atualização.
    expect(titlesIn(listPanel())).toEqual(["Beta", "Gama", "Alfa"]);
  });
});
