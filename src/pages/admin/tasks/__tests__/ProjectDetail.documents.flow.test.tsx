import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
import { fetchShoppingCategories } from "@/api/shopping/categories";
import { fetchShoppingItems } from "@/api/shopping/items";
import type { Project } from "@/types/tasks";

/**
 * Feature 105, a verificação do pedido literal — "ter uma seção para ver todos os documentos
 * daquele projeto (aparecem aqui as notas e canvas com referência a tarefa)" — pelo caminho
 * inteiro, sem navegador: a **API de verdade** (`fetchProjectDocuments`/`countProjectDocuments`) e
 * o domínio de verdade rodando contra um Postgres falso, com a página do projeto por cima.
 *
 * O único duplo do módulo de Notas aqui é o `supabase`; tudo entre ele e a tela é o código real.
 */

interface Row {
  [column: string]: unknown;
}

const { db } = vi.hoisted(() => ({
  db: { note: [] as Row[], task: [] as Row[], note_link: [] as Row[] },
}));

/**
 * Postgres falso, pequeno mas honesto: aplica os filtros que a API monta (`eq`, `in`) e devolve as
 * colunas pedidas. É o que permite `select("id")` e `select("*")` conviverem no mesmo teste.
 */
function makeBuilder(table: keyof typeof db) {
  const filters: Array<(row: Row) => boolean> = [];
  let columns = "*";
  const run = () => {
    const rows = db[table].filter((row) => filters.every((f) => f(row)));
    if (columns.trim() === "*") return { data: rows.map((r) => ({ ...r })), error: null };
    const wanted = columns.split(",").map((c) => c.trim());
    return {
      data: rows.map((row) => Object.fromEntries(wanted.map((c) => [c, row[c]]))),
      error: null,
    };
  };
  const builder = {
    select(cols?: string) {
      if (cols) columns = cols;
      return builder;
    },
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return builder;
    },
    in(column: string, values: unknown[]) {
      filters.push((row) => values.includes(row[column]));
      return builder;
    },
    order() {
      return Promise.resolve(run());
    },
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(run()).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: keyof typeof db) => makeBuilder(table) },
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

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
  countShoppingCategoriesByProject: vi.fn(async () => 0),
}));

vi.mock("@/api/shopping/items", () => ({ fetchShoppingItems: vi.fn() }));

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchProjectById).mockResolvedValue(project);
  vi.mocked(fetchTasks).mockResolvedValue([]);
  vi.mocked(fetchTags).mockResolvedValue([]);
  vi.mocked(fetchDependencies).mockResolvedValue([]);
  vi.mocked(fetchRecurringTransactions).mockResolvedValue([]);
  vi.mocked(fetchProjectEvents).mockResolvedValue([]);
  vi.mocked(fetchShoppingCategories).mockResolvedValue([]);
  vi.mocked(fetchShoppingItems).mockResolvedValue([]);

  db.task = [{ id: "t1", user_id: "user-1", project_id: PROJECT_ID }];
  db.note = [
    // (a) nota do projeto pelo `project_id`
    {
      id: "n1",
      user_id: "user-1",
      project_id: PROJECT_ID,
      title: "Pauta da reunião",
      content: "combinar o cronograma",
      kind: "markdown",
      canvas_data: null,
      updated_at: "2026-08-30T12:00:00.000Z",
    },
    // (b) canvas vinculado a uma tarefa do projeto, **sem** project_id
    {
      id: "c1",
      user_id: "user-1",
      project_id: null,
      title: "Planta da sala",
      content: "",
      kind: "canvas",
      canvas_data: { elements: [{ id: "r1" }, { id: "r2" }, { id: "r3" }] },
      updated_at: "2026-08-29T12:00:00.000Z",
    },
    // (c) nota vinculada ao próprio projeto por note_link
    {
      id: "n2",
      user_id: "user-1",
      project_id: null,
      title: "Contrato da empreiteira",
      content: "assinado em julho",
      kind: "markdown",
      canvas_data: null,
      updated_at: "2026-08-28T12:00:00.000Z",
    },
    // Ruído: nota de outro projeto, sem vínculo nenhum com este.
    {
      id: "n9",
      user_id: "user-1",
      project_id: "p2",
      title: "Do outro projeto",
      content: "",
      kind: "markdown",
      canvas_data: null,
      updated_at: "2026-08-31T12:00:00.000Z",
    },
  ];
  db.note_link = [
    {
      note_id: "c1",
      user_id: "user-1",
      entity_type: "task",
      entity_id: "t1",
      label: "Trocar a fiação da sala",
      created_at: "2026-08-29T12:00:00.000Z",
    },
    {
      note_id: "n2",
      user_id: "user-1",
      entity_type: "project",
      entity_id: PROJECT_ID,
      label: "Obra da casa",
      created_at: "2026-08-28T12:00:00.000Z",
    },
  ];
});

function renderDetail(url = `/tasks/projects/${PROJECT_ID}?tab=documentos`) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/tasks/projects/:id" element={<ProjectDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("A aba 'Documentos' do projeto, do banco à tela (feature 105)", () => {
  it("mostra as três origens juntas, cada uma com o ícone do seu tipo", async () => {
    renderDetail();

    // (a) a nota do `project_id`
    const nota = await screen.findByRole("link", { name: /Pauta da reunião/ });
    expect(within(nota).getByLabelText("Nota")).toBeInTheDocument();
    expect(within(nota).getByText("combinar o cronograma")).toBeInTheDocument();

    // (b) o canvas da tarefa — sem `project_id`, e mesmo assim na lista
    const canvas = screen.getByRole("link", { name: /Planta da sala/ });
    expect(within(canvas).getByLabelText("Canvas")).toBeInTheDocument();
    expect(within(canvas).getByText("Canvas · 3 elementos")).toBeInTheDocument();
    // …dizendo de qual tarefa veio, que é o que o pedido queria ver aqui.
    expect(within(canvas).getByText("da tarefa Trocar a fiação da sala")).toBeInTheDocument();

    // (c) a nota vinculada ao projeto
    const contrato = screen.getByRole("link", { name: /Contrato da empreiteira/ });
    expect(within(contrato).getByLabelText("Nota")).toBeInTheDocument();

    // E nada de fora: a nota do outro projeto não entra.
    expect(screen.queryByText("Do outro projeto")).toBeNull();
    expect(screen.getAllByRole("link", { name: /Pauta|Planta|Contrato|Do outro/ })).toHaveLength(3);
  });

  it("a contagem do gatilho concorda com a lista: três", async () => {
    renderDetail();
    expect(await screen.findByRole("tab", { name: "Documentos (3)" })).toBeInTheDocument();
  });

  it("a ordem é a da última edição, com o mais recente em cima", async () => {
    renderDetail();

    await screen.findByRole("link", { name: /Pauta da reunião/ });
    const titulos = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(titulos).toEqual([
      "Pauta da reunião",
      "Planta da sala",
      "Contrato da empreiteira",
    ]);
  });
});
