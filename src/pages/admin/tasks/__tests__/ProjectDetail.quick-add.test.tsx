import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProjectDetail from "@/pages/admin/tasks/ProjectDetail";
import {
  createTask,
  fetchDependencies,
  fetchProjectById,
  fetchProjectEvents,
  fetchTags,
  fetchTasks,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import {
  countShoppingCategoriesByProject,
  fetchShoppingCategories,
} from "@/api/shopping/categories";
import { fetchShoppingItems } from "@/api/shopping/items";
import { fetchNotes } from "@/api/notes/notes";
import { countProjectDocuments } from "@/api/notes/projectDocuments";
import type { Project, Task } from "@/types/tasks";

/**
 * Feature 098 — o mesmo `+` de quick add na aba Lista da página do projeto. O que muda em relação
 * a `/tasks` é o projeto: aqui ele é o da rota, então a tarefa criada tem de nascer com
 * `project_id` preenchido, sem o usuário escolher nada.
 */

vi.mock("@/api/tasks", () => ({
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
  fetchShoppingCategories: vi.fn(),
  countShoppingCategoriesByProject: vi.fn(),
}));

vi.mock("@/api/shopping/items", () => ({
  fetchShoppingItems: vi.fn(),
}));

vi.mock("@/api/notes/notes", () => ({
  fetchNotes: vi.fn(),
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
    title: "Tarefa existente",
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

const store: { tasks: Task[] } = { tasks: [] };

function renderDetail(url = `/tasks/projects/${PROJECT_ID}?tab=lista`) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/tasks/projects/:id" element={<ProjectDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

function quickAddButton() {
  return screen.getByRole("button", { name: "Adicionar tarefa rápida" });
}

beforeEach(() => {
  vi.clearAllMocks();
  toastMock.mockReset();
  store.tasks = [makeTask()];
  vi.mocked(fetchProjectById).mockResolvedValue(project);
  vi.mocked(fetchTasks).mockImplementation(async () => store.tasks.map((t) => ({ ...t })));
  vi.mocked(fetchTags).mockResolvedValue([]);
  vi.mocked(fetchDependencies).mockResolvedValue([]);
  vi.mocked(fetchRecurringTransactions).mockResolvedValue([]);
  vi.mocked(fetchProjectEvents).mockResolvedValue([]);
  vi.mocked(fetchShoppingCategories).mockResolvedValue([]);
  vi.mocked(fetchShoppingItems).mockResolvedValue([]);
  vi.mocked(fetchNotes).mockResolvedValue([]);
  vi.mocked(countShoppingCategoriesByProject).mockResolvedValue(0);
  vi.mocked(countProjectDocuments).mockResolvedValue(0);
  vi.mocked(createTask).mockImplementation(async (payload) => {
    const created = makeTask({ ...payload, id: `nova-${store.tasks.length + 1}` }) as Task;
    store.tasks.push(created);
    return created;
  });
});

describe("ProjectDetail — quick add na aba Lista (feature 098)", () => {
  it("o `+` aparece na aba Lista do projeto (e não no Kanban)", async () => {
    renderDetail(`/tasks/projects/${PROJECT_ID}?tab=kanban`);

    await screen.findByText(project.name);
    expect(screen.queryByRole("button", { name: "Adicionar tarefa rápida" })).toBeNull();

    renderDetail();
    expect(await screen.findAllByRole("button", { name: "Adicionar tarefa rápida" })).toHaveLength(
      1
    );
  });

  it("criar pelo `+` grava a tarefa já com o project_id da rota", async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText("Tarefa existente");
    await user.click(quickAddButton());
    await user.keyboard("Comprar cimento{Enter}");

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: PROJECT_ID,
        parent_task_id: null,
        title: "Comprar cimento",
        description: "",
        status: "todo",
        due_date: null,
        priority: null,
      })
    );

    // Ela entra na lista do projeto, na caixa "Sem prazo", sem o dialog completo ter aberto.
    const semPrazo = screen.getByRole("heading", { name: /^Sem prazo/ })
      .parentElement as HTMLElement;
    expect(within(semPrazo).getByText("Comprar cimento")).toBeInTheDocument();
    expect(screen.queryByText("Criar tarefa")).toBeNull();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Criada em «Sem prazo»" })
    );
  });

  it("a descrição digitada na tira vai junto", async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText("Tarefa existente");
    await user.click(quickAddButton());
    await user.keyboard("Comprar cimento");
    await user.click(screen.getByRole("button", { name: "Adicionar descrição" }));
    await user.keyboard("50kg, marca qualquer");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: PROJECT_ID,
        title: "Comprar cimento",
        description: "50kg, marca qualquer",
      })
    );
  });

  it("falha do createTask: toast destrutivo e o título continua no campo", async () => {
    const user = userEvent.setup();
    vi.mocked(createTask).mockRejectedValue(new Error("sem rede"));
    renderDetail();

    await screen.findByText("Tarefa existente");
    await user.click(quickAddButton());
    await user.keyboard("Comprar cimento{Enter}");

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Erro", variant: "destructive" })
    );
    expect(screen.getByRole("textbox", { name: "Título da tarefa" })).toHaveValue(
      "Comprar cimento"
    );
  });
});
