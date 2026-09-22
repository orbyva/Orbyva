import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import ProjectDetail from "@/pages/admin/tasks/ProjectDetail";
import {
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
import { countNotesByProject, fetchNotes } from "@/api/notes/notes";
import type { Project } from "@/types/tasks";

/**
 * Feature 069 — a página do projeto passa a ter cinco abas (Kanban | Lista | Gantt | Compras |
 * Notas). Compras e notas saíram de baixo do quadro, onde comiam o espaço vertical das tarefas, e
 * viraram abas: só carregam quando alguém as abre.
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
  // Feature 106: a outra metade de "Referenciada em".
  fetchNotesMentioningTask: vi.fn(async () => []),
  fetchNotes: vi.fn(),
  createNote: vi.fn(),
  countNotesByProject: vi.fn(),
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

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="url">{`${location.pathname}${location.search}`}</output>
      {/* O "voltar" do navegador, que o MemoryRouter só expõe por `navigate(-1)`. */}
      <button onClick={() => navigate(-1)}>voltar no histórico</button>
    </>
  );
}

function renderDetail(url = `/tasks/projects/${PROJECT_ID}`) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/tasks/projects/:id" element={<ProjectDetail />} />
        <Route path="/shopping-list" element={<p>lista de compras</p>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}

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
  vi.mocked(fetchNotes).mockResolvedValue([]);
  vi.mocked(countShoppingCategoriesByProject).mockResolvedValue(0);
  vi.mocked(countNotesByProject).mockResolvedValue(0);
});

describe("ProjectDetail — abas (feature 069)", () => {
  /**
   * O ponto da tarefa: a `TabsList` fica de pé desde o primeiro render, com o esqueleto **dentro**
   * do conteúdo da aba. Antes, a lista inteira de abas sumia durante o carregamento e reaparecia,
   * empurrando o conteúdo para baixo em toda abertura de projeto.
   */
  it("os gatilhos das abas existem no primeiro render, antes de qualquer await", async () => {
    renderDetail();

    for (const name of ["Kanban", "Lista", "Gantt", "Compras", "Notas"]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    }
    // E o esqueleto de carregamento está *dentro* do painel da aba, não em volta das abas.
    expect(screen.getByRole("tabpanel").querySelector(".animate-pulse")).not.toBeNull();

    await screen.findByText(project.name);
  });

  /**
   * O ganho de carga da feature 069, e o que uma regressão futura mais provavelmente desfaz: antes,
   * abrir *qualquer* projeto disparava `fetchShoppingCategories` + `fetchShoppingItems` +
   * `fetchNotes`, mesmo para quem só ia olhar o quadro. Agora só quando a aba abre.
   */
  it("as requisições de compras e notas não acontecem enquanto a aba não é aberta", async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText(project.name);
    expect(fetchShoppingCategories).not.toHaveBeenCalled();
    expect(fetchShoppingItems).not.toHaveBeenCalled();
    expect(fetchNotes).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "Compras" }));
    expect(fetchShoppingCategories).toHaveBeenCalledWith({ projectId: PROJECT_ID });
    expect(fetchShoppingItems).toHaveBeenCalled();
    // Abrir compras não puxa as notas junto.
    expect(fetchNotes).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "Notas" }));
    expect(fetchNotes).toHaveBeenCalledWith({ projectId: PROJECT_ID });
  });

  it("as cinco abas aparecem: Kanban, Lista, Gantt, Compras e Notas", async () => {
    renderDetail();

    await screen.findByText(project.name);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Kanban",
      "Lista",
      "Gantt",
      "Compras",
      "Notas",
    ]);
  });

  it("as contagens saem nos gatilhos de Compras e Notas", async () => {
    vi.mocked(countShoppingCategoriesByProject).mockResolvedValue(7);
    vi.mocked(countNotesByProject).mockResolvedValue(2);

    renderDetail();

    expect(await screen.findByRole("tab", { name: "Compras (7)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Notas (2)" })).toBeInTheDocument();
    expect(countShoppingCategoriesByProject).toHaveBeenCalledWith(PROJECT_ID);
    expect(countNotesByProject).toHaveBeenCalledWith(PROJECT_ID);
  });

  it("contagem zero não mostra número", async () => {
    renderDetail();

    await screen.findByText(project.name);
    expect(screen.getByRole("tab", { name: "Compras" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Notas" })).toBeInTheDocument();
  });

  it("abrir com ?tab=notas já carrega na aba de notas", async () => {
    renderDetail(`/tasks/projects/${PROJECT_ID}?tab=notas`);

    const notas = await screen.findByRole("tab", { name: "Notas" });
    expect(notas).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Kanban" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("?tab=foo (valor inválido) cai no Kanban, sem quebrar", async () => {
    renderDetail(`/tasks/projects/${PROJECT_ID}?tab=foo`);

    await screen.findByText(project.name);
    expect(screen.getByRole("tab", { name: "Kanban" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("trocar de aba escreve o ?tab= na URL", async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText(project.name);
    await user.click(screen.getByRole("tab", { name: "Compras" }));

    expect(screen.getByTestId("url")).toHaveTextContent(
      `/tasks/projects/${PROJECT_ID}?tab=compras`
    );
    expect(screen.getByRole("tab", { name: "Compras" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  /**
   * O pedido literal: "preciso do espaço para poder visualizar as tarefas". Na aba Kanban, o
   * quadro é o único conteúdo abaixo das abas — nem a seção de compras nem a de notas ocupam
   * altura ali (não estão no documento).
   */
  it("na aba Kanban, compras e notas não estão no documento — o quadro é o único conteúdo", async () => {
    renderDetail();

    await screen.findByText(project.name);

    // O quadro está lá, com as três colunas de status.
    expect(screen.getByRole("heading", { name: /A fazer/ })).toBeInTheDocument();

    // E nada das duas seções: nem região, nem título, nem estado vazio delas.
    expect(screen.queryByRole("region", { name: "Compras do projeto" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Notas do projeto" })).toBeNull();
    expect(screen.queryByText("Compras do projeto")).toBeNull();
    expect(screen.queryByText("Notas do projeto")).toBeNull();
    expect(screen.queryByText("Nenhuma categoria de compras neste projeto")).toBeNull();
    expect(screen.queryByText("Nenhuma nota neste projeto")).toBeNull();
    expect(screen.queryByRole("link", { name: "Ver na Lista de Compras" })).toBeNull();

    // Um único painel montado abaixo das abas: o da aba aberta.
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });

  /**
   * O caminho de ida e volta que a feature 069 promete: da aba "Compras" para a Lista de Compras
   * já filtrada e, no botão voltar do navegador, de volta para a aba "Compras" — não para o Kanban.
   * É a razão de a aba viver na URL em vez de em `useState`.
   */
  it("ir para a Lista de Compras e voltar devolve a aba 'Compras', não o Kanban", async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText(project.name);
    await user.click(screen.getByRole("tab", { name: "Compras" }));

    const link = await screen.findByRole("link", { name: "Ver na Lista de Compras" });
    expect(link).toHaveAttribute("href", `/shopping-list?project=${PROJECT_ID}`);
    await user.click(link);
    expect(screen.getByTestId("url")).toHaveTextContent(
      `/shopping-list?project=${PROJECT_ID}`
    );

    await user.click(screen.getByRole("button", { name: "voltar no histórico" }));

    expect(screen.getByTestId("url")).toHaveTextContent(
      `/tasks/projects/${PROJECT_ID}?tab=compras`
    );
    expect(await screen.findByRole("tab", { name: "Compras" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("falha na contagem não derruba a página nem esconde a aba — só fica sem número", async () => {
    vi.mocked(countShoppingCategoriesByProject).mockRejectedValue(new Error("offline"));
    vi.mocked(countNotesByProject).mockRejectedValue(new Error("offline"));

    renderDetail();

    // A página carregou (o nome do projeto está lá) e as abas continuam de pé, sem número.
    expect(await screen.findByText(project.name)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Compras" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Notas" })).toBeInTheDocument();
    // E sem toast de erro: contagem que falha é silenciosa.
    expect(toastMock).not.toHaveBeenCalled();
  });
});
