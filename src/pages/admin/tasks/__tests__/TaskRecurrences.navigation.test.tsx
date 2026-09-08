import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, matchRoutes } from "react-router-dom";
import { appRoutes } from "@/routes";
import TaskList from "@/pages/admin/tasks/TaskList";
import { ActiveTimerProvider } from "@/hooks/useActiveTimer";

vi.mock("@/api/tasks", () => ({
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchTasks: vi.fn().mockResolvedValue([]),
  fetchProjects: vi.fn().mockResolvedValue([]),
  fetchTags: vi.fn().mockResolvedValue([]),
  fetchDependencies: vi.fn().mockResolvedValue([]),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  deleteTasks: vi.fn(),
  deleteTaskSeries: vi.fn(),
  updateTasksSortOrder: vi.fn(),
  createTag: vi.fn(),
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
  fetchRunningEntry: vi.fn().mockResolvedValue(null),
  startTimer: vi.fn(),
  stopTimer: vi.fn(),
}));

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn().mockResolvedValue([]),
  createRecurringApi: vi.fn(),
}));

vi.mock("@/api/health/medications", () => ({
  endMedicationAndDeleteFutureDoses: vi.fn(),
  EndMedicationError: class extends Error {},
}));

vi.mock("@/hooks/useDimensions", () => ({
  useDimensions: () => ({ dimensions: [], loading: false, error: null, refetch: vi.fn() }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

/**
 * Feature 101 — a porta de entrada da tela de recorrências, sem navegador: a URL resolve contra a
 * árvore de rotas de verdade do app (não contra um router montado à mão no teste), e o botão do
 * cabeçalho de Tarefas aponta exatamente para ela.
 */

describe("rota /tasks/recurrences", () => {
  it("a URL resolve para uma rota registrada, não para o 404", () => {
    const matches = matchRoutes(appRoutes, "/tasks/recurrences");
    expect(matches).not.toBeNull();
    const paths = matches!.map((m) => m.route.path);
    expect(paths).toContain("tasks");
    expect(paths).toContain("recurrences");
    expect(paths).not.toContain("*");
  });

  it("fica **dentro** de /tasks, ao lado de tags e link-icons (e não é a index de /tasks)", () => {
    const tasksRoute = matchRoutes(appRoutes, "/tasks")!
      .map((m) => m.route)
      .find((r) => r.path === "tasks")!;
    const childPaths = (tasksRoute.children ?? []).map((c) => c.path);
    expect(childPaths).toEqual(expect.arrayContaining(["tags", "link-icons", "recurrences"]));

    // A index de /tasks continua sendo a Lista — registrar a irmã não pode ter roubado a raiz.
    const indexMatches = matchRoutes(appRoutes, "/tasks")!;
    expect(indexMatches[indexMatches.length - 1].route.index).toBe(true);
  });
});

describe("botão 'Recorrências' no cabeçalho de Tarefas", () => {
  /**
   * A tela fica **fora da sidebar** (como Live e Tags): este botão é a única porta para ela. Se ele
   * sumir do cabeçalho, a página existe e é inalcançável — daí a asserção ser sobre o `href`, e não
   * só sobre o texto.
   */
  it("renderiza um link 'Recorrências' apontando para /tasks/recurrences", async () => {
    render(
      <MemoryRouter>
        <ActiveTimerProvider>
          <TaskList />
        </ActiveTimerProvider>
      </MemoryRouter>
    );

    const link = await screen.findByRole("link", { name: /Recorrências/ });
    expect(link).toHaveAttribute("href", "/tasks/recurrences");
  });

  it("fica entre 'Live' e 'Tags', que é a ordem do cabeçalho do módulo", async () => {
    render(
      <MemoryRouter>
        <ActiveTimerProvider>
          <TaskList />
        </ActiveTimerProvider>
      </MemoryRouter>
    );

    await screen.findByRole("link", { name: /Recorrências/ });
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"))
      .filter((h): h is string => h === "/tasks/live" || h === "/tasks/recurrences" || h === "/tasks/tags");
    expect(hrefs).toEqual(["/tasks/live", "/tasks/recurrences", "/tasks/tags"]);
  });
});
