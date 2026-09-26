import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProjectDetail from "@/pages/admin/tasks/ProjectDetail";
import {
  createTask,
  fetchDependencies,
  fetchExternalLinksForTask,
  fetchExternalLinksForTasks,
  fetchProjectById,
  fetchProjectEvents,
  fetchTags,
  fetchTasks,
  saveExternalLinksForTask,
  updateTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Project, Task, TaskExternalLink } from "@/types/tasks";

/**
 * Feature 085 — `ProjectDetail.tsx` é o **segundo** dono do formulário completo, e a fiação dos
 * links tem de ser a mesma de `TaskList.tsx`: carregar ao abrir, gravar depois do
 * `createTask`/`updateTask`, e alimentar os chips dos cards por uma consulta em lote no `load()`.
 * Sem este arquivo, a tela do projeto podia ficar meio-fiada sem ninguém notar.
 */

vi.mock("@/api/tasks", () => ({
  fetchProjectById: vi.fn(),
  fetchTasks: vi.fn(),
  fetchTags: vi.fn(),
  fetchDependencies: vi.fn(),
  fetchProjectEvents: vi.fn(),
  fetchExternalLinksForTask: vi.fn(),
  fetchExternalLinksForTasks: vi.fn(),
  saveExternalLinksForTask: vi.fn(),
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
  fetchEntriesForTask: vi.fn().mockResolvedValue([]),
  updateTimeEntry: vi.fn(),
  deleteTimeEntry: vi.fn(),
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

const PROJECT_ID = "project-1";
const mockedFetchLinksForTask = vi.mocked(fetchExternalLinksForTask);
const mockedFetchLinksForTasks = vi.mocked(fetchExternalLinksForTasks);
const mockedSaveLinks = vi.mocked(saveExternalLinksForTask);
const mockedCreateTask = vi.mocked(createTask);

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

function makeLink(over: Partial<TaskExternalLink> & { url: string }): TaskExternalLink {
  return { id: `l-${over.url}`, task_id: "task-1", comment: null, position: 0, ...over };
}

const PROJECT: Project = { id: PROJECT_ID, name: "Projeto X", status: "active", tag_ids: [] };

async function renderWithTasks(tasks: Task[]) {
  vi.mocked(fetchProjectById).mockResolvedValue(PROJECT);
  vi.mocked(fetchTasks).mockResolvedValue(tasks);
  vi.mocked(fetchTags).mockResolvedValue([]);
  vi.mocked(fetchDependencies).mockResolvedValue([]);
  vi.mocked(fetchRecurringTransactions).mockResolvedValue([]);
  vi.mocked(fetchProjectEvents).mockResolvedValue([]);
  render(
    <MemoryRouter initialEntries={[`/tasks/projects/${PROJECT_ID}`]}>
      <Routes>
        <Route path="/tasks/projects/:id" element={<ProjectDetail />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByRole("button", { name: "Nova tarefa" });
}

beforeEach(() => {
  toastMock.mockReset();
  mockedCreateTask.mockReset();
  vi.mocked(updateTask).mockReset();
  mockedSaveLinks.mockReset();
  mockedFetchLinksForTask.mockReset();
  mockedFetchLinksForTasks.mockReset();
  mockedCreateTask.mockResolvedValue(makeTask({ id: "novo-1" }));
  vi.mocked(updateTask).mockResolvedValue(undefined);
  mockedSaveLinks.mockResolvedValue([]);
  mockedFetchLinksForTask.mockResolvedValue([]);
  mockedFetchLinksForTasks.mockResolvedValue({});
});

describe("ProjectDetail — links externos (feature 085)", () => {
  it("criar tarefa com link grava depois do createTask, com o id novo", async () => {
    const user = userEvent.setup();
    await renderWithTasks([]);

    await user.click(screen.getByRole("button", { name: "Nova tarefa" }));
    const panel = within(await screen.findByRole("dialog"));
    await user.type(panel.getByLabelText(/^Título/), "Tarefa do projeto");
    await user.click(panel.getByRole("button", { name: /Links externos/ }));
    await user.click(panel.getByRole("button", { name: "Adicionar link" }));
    await user.type(panel.getByLabelText("URL do link 1 de 1"), "https://a.com");
    await user.type(panel.getByLabelText("Comentário do link 1 de 1"), "por que importa");

    await user.click(screen.getByRole("button", { name: "Criar tarefa" }));

    expect(mockedSaveLinks).toHaveBeenCalledWith("novo-1", [
      { url: "https://a.com", comment: "por que importa", position: 0 },
    ]);
    expect(mockedCreateTask.mock.invocationCallOrder[0]).toBeLessThan(
      mockedSaveLinks.mock.invocationCallOrder[0]
    );
  });

  it("editar carrega os links da tarefa e salvar manda a lista editada", async () => {
    const user = userEvent.setup();
    mockedFetchLinksForTask.mockResolvedValue([
      makeLink({ url: "https://a.com", comment: "antigo", position: 0 }),
    ]);
    await renderWithTasks([makeTask({ title: "Tarefa com link" })]);

    await user.click(screen.getByText("Tarefa com link"));
    const panel = within(await screen.findByRole("dialog"));
    expect(mockedFetchLinksForTask).toHaveBeenCalledWith("task-1");

    await user.click(await panel.findByRole("button", { name: /Links externos/ }));
    const comment = panel.getByLabelText("Comentário do link 1 de 1");
    await user.clear(comment);
    await user.type(comment, "novo comentário");

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(mockedSaveLinks).toHaveBeenCalledWith("task-1", [
      { id: "l-https://a.com", url: "https://a.com", comment: "novo comentário", position: 0 },
    ]);
  });

  it("o load() busca os links das tarefas do projeto em lote e os chips aparecem nos cards", async () => {
    mockedFetchLinksForTasks.mockResolvedValue({
      "task-1": [makeLink({ url: "https://github.com/owner/repo/issues/9", comment: "issue" })],
    });
    await renderWithTasks([makeTask({ title: "Tarefa com link" })]);

    expect(mockedFetchLinksForTasks).toHaveBeenCalledTimes(1);
    expect(mockedFetchLinksForTasks).toHaveBeenCalledWith(["task-1"]);
    expect(await screen.findByRole("link", { name: "owner/repo#9" })).toHaveAttribute(
      "title",
      "issue"
    );
  });

  it("falha na consulta em lote não derruba a página do projeto", async () => {
    mockedFetchLinksForTasks.mockRejectedValue(new Error("boom"));
    await renderWithTasks([makeTask({ title: "Continua aparecendo" })]);

    expect(await screen.findByText("Continua aparecendo")).toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Erro", variant: "destructive" })
    );
  });
});
