import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import ProjectDetail from "@/pages/admin/tasks/ProjectDetail";
import {
  fetchDependencies,
  fetchProjectById,
  fetchProjectEvents,
  fetchTags,
  fetchTasks,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import { fetchShoppingCategories } from "@/api/shopping/categories";
import { fetchShoppingItems } from "@/api/shopping/items";
import { fetchNotes } from "@/api/notes/notes";
import type { Project } from "@/types/tasks";

/**
 * Feature 071 — a página do projeto passa a ter **cinco** abas (Kanban | Lista | Gantt | Compras |
 * Notas) e a aba ativa mora no `?tab=` da URL. Testado montando a tela de verdade, sem navegador:
 * as assertivas leem a URL por um `LocationProbe` e conferem o que está (e o que **não** está) no
 * DOM de cada aba.
 */

vi.mock("@/api/tasks", () => ({
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
  uploadTaskIcon: vi.fn(),
  updateProject: vi.fn(),
  createProjectEvent: vi.fn(),
  updateProjectEvent: vi.fn(),
  deleteProjectEvent: vi.fn(),
}));

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn(),
  createRecurringApi: vi.fn(),
}));

vi.mock("@/api/shopping/categories", () => ({
  fetchShoppingCategories: vi.fn(),
}));

vi.mock("@/api/shopping/items", () => ({
  fetchShoppingItems: vi.fn(),
  fetchTaskLinksForItems: vi.fn(),
}));

vi.mock("@/api/notes/notes", () => ({
  fetchNotes: vi.fn(),
  createNote: vi.fn(),
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

const PROJECT: Project = {
  id: PROJECT_ID,
  name: "Projeto Alpha",
  description: "Descrição",
  color: "#94a3b8",
  goal_id: null,
  status: "active",
  tag_ids: [],
};

/** Espelha a URL atual na tela — é por ele que as assertivas leem o `?tab=`. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="url">{`${location.pathname}${location.search}`}</output>;
}

function url(): string {
  return screen.getByTestId("url").textContent ?? "";
}

function tab(name: string): HTMLElement {
  return screen.getByRole("tab", { name });
}

async function renderDetail(search = "") {
  render(
    <MemoryRouter initialEntries={[`/tasks/projects/${PROJECT_ID}${search}`]}>
      <Routes>
        <Route path="/tasks/projects/:id" element={<ProjectDetail />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
  await screen.findByText(PROJECT.name);
}

describe("ProjectDetail — abas na URL (feature 071)", () => {
  beforeEach(() => {
    toastMock.mockReset();
    vi.mocked(fetchProjectById).mockReset().mockResolvedValue(PROJECT);
    vi.mocked(fetchTasks).mockReset().mockResolvedValue([]);
    vi.mocked(fetchTags).mockReset().mockResolvedValue([]);
    vi.mocked(fetchDependencies).mockReset().mockResolvedValue([]);
    vi.mocked(fetchProjectEvents).mockReset().mockResolvedValue([]);
    vi.mocked(fetchRecurringTransactions).mockReset().mockResolvedValue([]);
    vi.mocked(fetchShoppingCategories).mockReset().mockResolvedValue([]);
    vi.mocked(fetchShoppingItems).mockReset().mockResolvedValue([]);
    vi.mocked(fetchNotes).mockReset().mockResolvedValue([]);
  });

  it("sem `?tab=` abre no Kanban", async () => {
    await renderDetail();

    expect(tab("Kanban")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: /A fazer/ })).toBeInTheDocument();
    expect(url()).toBe(`/tasks/projects/${PROJECT_ID}`);
  });

  it("`?tab=lista` já renderiza a Lista no primeiro paint", async () => {
    await renderDetail("?tab=lista");

    expect(tab("Lista")).toHaveAttribute("aria-selected", "true");
    expect(tab("Kanban")).toHaveAttribute("aria-selected", "false");
    // Conteúdo exclusivo da Lista: o estado vazio dela (o Kanban usa colunas por status).
    expect(screen.getByText("Nenhuma tarefa")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /A fazer/ })).not.toBeInTheDocument();
  });

  it("`?tab=gantt` já renderiza o Gantt no primeiro paint", async () => {
    await renderDetail("?tab=gantt");

    expect(tab("Gantt")).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("heading", { name: /A fazer/ })).not.toBeInTheDocument();
  });

  it("valor desconhecido de `?tab=` cai no Kanban, sem tela vazia", async () => {
    await renderDetail("?tab=inexistente");

    expect(tab("Kanban")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: /A fazer/ })).toBeInTheDocument();
  });

  it("trocar de aba escreve o parâmetro na URL", async () => {
    const user = userEvent.setup();
    await renderDetail();

    await user.click(tab("Lista"));

    expect(url()).toBe(`/tasks/projects/${PROJECT_ID}?tab=lista`);
    expect(tab("Lista")).toHaveAttribute("aria-selected", "true");
  });

  it("voltar para o Kanban remove o parâmetro da URL", async () => {
    const user = userEvent.setup();
    await renderDetail("?tab=gantt");

    await user.click(tab("Kanban"));

    expect(url()).toBe(`/tasks/projects/${PROJECT_ID}`);
    expect(tab("Kanban")).toHaveAttribute("aria-selected", "true");
  });

  it("o `?tab=` convive com outros parâmetros da URL, sem apagá-los", async () => {
    const user = userEvent.setup();
    await renderDetail("?foo=bar");

    await user.click(tab("Lista"));

    expect(url()).toBe(`/tasks/projects/${PROJECT_ID}?foo=bar&tab=lista`);
  });
});
