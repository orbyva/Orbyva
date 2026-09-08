import { beforeEach, describe, expect, it, vi } from "vitest";
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
import {
  countShoppingCategoriesByProject,
  fetchShoppingCategories,
} from "@/api/shopping/categories";
import { fetchShoppingItems } from "@/api/shopping/items";
import { fetchNotes } from "@/api/notes/notes";
import { countProjectDocuments } from "@/api/notes/projectDocuments";
import type { Project, Task } from "@/types/tasks";

/**
 * Feature 100 — a mesma edição inline de título/descrição na Lista **de um projeto**, incluindo
 * dentro da seção "Concluídas" (tarefa concluída continua editável: corrigir o nome de algo já
 * feito faz sentido; o que não faz é reagendar, e por isso só o prazo trava quando `done`).
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

/** Troca o `<Select>` de status da aba Lista (é o combobox que mostra "Pendentes"). */
async function switchStatusView(
  user: ReturnType<typeof userEvent.setup>,
  option: "Concluídas" | "Todas"
) {
  const statusSelect = screen
    .getAllByRole("combobox")
    .find((el) => el.textContent?.includes("Pendentes")) as HTMLElement;
  await user.click(statusSelect);
  await user.click(await screen.findByRole("option", { name: option }));
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
  vi.mocked(updateTask).mockResolvedValue(undefined as never);
});

describe("ProjectDetail — título e descrição inline na Lista do projeto (feature 100)", () => {
  it("clicar no título edita ali mesmo e grava `updateTask({ id, title })`, sem abrir o dialog", async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "Editar título: Tarefa existente" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.keyboard(" (revisada){Enter}");

    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith({
        id: "task-1",
        title: "Tarefa existente (revisada)",
      })
    );
    expect(
      await screen.findByRole("button", { name: "Editar título: Tarefa existente (revisada)" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clicar em «+ Descrição» abre a textarea e Ctrl+Enter grava a descrição", async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByRole("button", { name: "Editar título: Tarefa existente" });
    await user.click(screen.getByRole("button", { name: "Adicionar descrição: Tarefa existente" }));
    await user.keyboard("com **cimento**{Control>}{Enter}{/Control}");

    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith({ id: "task-1", description: "com **cimento**" })
    );
    // Volta como prévia sem markdown.
    expect(
      await screen.findByRole("button", { name: "Editar descrição: com cimento" })
    ).toBeInTheDocument();
  });

  it("dentro da seção «Concluídas», a tarefa concluída também é editável (com o line-through)", async () => {
    const user = userEvent.setup();
    store.tasks = [
      makeTask({ id: "t-done", title: "Ja feita", status: "done", completed_at: "2026-08-25T10:00:00.000Z" }),
    ];
    renderDetail();

    await screen.findByText(project.name);
    await switchStatusView(user, "Concluídas");

    const titleButton = await screen.findByRole("button", { name: "Editar título: Ja feita" });
    expect(titleButton.className).toContain("line-through");

    await user.click(titleButton);
    await user.clear(screen.getByRole("textbox", { name: "Título" }));
    await user.keyboard("Já feita{Enter}");

    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith({ id: "t-done", title: "Já feita" })
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a linha aninhada de subtarefa edita o título com o id da **subtarefa**", async () => {
    const user = userEvent.setup();
    store.tasks = [
      makeTask({ id: "mae", title: "Tarefa mãe" }),
      makeTask({ id: "filha", title: "Subtarefa", parent_task_id: "mae" }),
    ];
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "Expandir subtarefas" }));

    const subtaskButton = await screen.findByRole("button", { name: "Editar título: Subtarefa" });
    await user.click(subtaskButton);
    await user.keyboard(" A{Enter}");

    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith({ id: "filha", title: "Subtarefa A" })
    );
  });

  it("falha do updateTask devolve o título antigo e mostra toast destrutivo", async () => {
    const user = userEvent.setup();
    vi.mocked(updateTask).mockRejectedValue(new Error("sem rede"));
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "Editar título: Tarefa existente" }));
    await user.keyboard(" quebrada{Enter}");

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      )
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Editar título: Tarefa existente" })
      ).toBeInTheDocument()
    );
  });

  it("no Kanban do projeto a edição inline também está lá (mesma simetria da 033)", async () => {
    const user = userEvent.setup();
    renderDetail(`/tasks/projects/${PROJECT_ID}?tab=kanban`);

    const card = (await screen.findByRole("button", { name: "Editar título: Tarefa existente" }))
      .closest("article") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "Editar título: Tarefa existente" }));
    await user.keyboard(" no quadro{Enter}");

    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith({
        id: "task-1",
        title: "Tarefa existente no quadro",
      })
    );
  });
});
