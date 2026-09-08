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
import { fetchNotes } from "@/api/notes/notes";
import {
  countProjectDocuments,
  fetchProjectDocuments,
} from "@/api/notes/projectDocuments";
import type { Project } from "@/types/tasks";

/**
 * Feature 069 — a página do projeto passa a ter cinco abas (Kanban | Lista | Gantt | Compras |
 * Documentos). Compras e documentos saíram de baixo do quadro, onde comiam o espaço vertical das
 * tarefas, e viraram abas: só carregam quando alguém as abre.
 *
 * Feature 105 — a última aba passa a se chamar "Documentos" (nota **e** canvas), mas o valor no
 * `?tab=` continua `notas`, que é contrato público desde a 069; `?tab=documentos` é apelido.
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
  fetchProjectDocuments: vi.fn(),
  countProjectDocuments: vi.fn(),
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
  vi.mocked(countProjectDocuments).mockResolvedValue(0);
  vi.mocked(fetchProjectDocuments).mockResolvedValue([]);
});

describe("ProjectDetail — abas (feature 069)", () => {
  /**
   * O ponto da tarefa: a `TabsList` fica de pé desde o primeiro render, com o esqueleto **dentro**
   * do conteúdo da aba. Antes, a lista inteira de abas sumia durante o carregamento e reaparecia,
   * empurrando o conteúdo para baixo em toda abertura de projeto.
   */
  it("os gatilhos das abas existem no primeiro render, antes de qualquer await", async () => {
    renderDetail();

    for (const name of ["Kanban", "Lista", "Gantt", "Compras", "Documentos"]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    }
    // E o esqueleto de carregamento está *dentro* do painel da aba, não em volta das abas.
    expect(screen.getByRole("tabpanel").querySelector(".animate-pulse")).not.toBeNull();

    await screen.findByText(project.name);
  });

  /**
   * O ganho de carga da feature 069, e o que uma regressão futura mais provavelmente desfaz: antes,
   * abrir *qualquer* projeto disparava `fetchShoppingCategories` + `fetchShoppingItems` + a busca
   * das notas, mesmo para quem só ia olhar o quadro. Agora só quando a aba abre — e a 105, que
   * trocou `fetchNotes` pela união de `fetchProjectDocuments`, não pode desfazer isso.
   */
  it("as requisições de compras e documentos não acontecem enquanto a aba não é aberta", async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText(project.name);
    expect(fetchShoppingCategories).not.toHaveBeenCalled();
    expect(fetchShoppingItems).not.toHaveBeenCalled();
    expect(fetchProjectDocuments).not.toHaveBeenCalled();
    expect(fetchNotes).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "Compras" }));
    expect(fetchShoppingCategories).toHaveBeenCalledWith({ projectId: PROJECT_ID });
    expect(fetchShoppingItems).toHaveBeenCalled();
    // Abrir compras não puxa os documentos junto.
    expect(fetchProjectDocuments).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "Documentos" }));
    expect(fetchProjectDocuments).toHaveBeenCalledWith(PROJECT_ID);
    // E a lista antiga por `project_id` não é mais usada: quem monta a aba é a união.
    expect(fetchNotes).not.toHaveBeenCalled();
  });

  it("as cinco abas aparecem: Kanban, Lista, Gantt, Compras e Documentos", async () => {
    renderDetail();

    await screen.findByText(project.name);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Kanban",
      "Lista",
      "Gantt",
      "Compras",
      "Documentos",
    ]);
  });

  it("as contagens saem nos gatilhos de Compras e Documentos", async () => {
    vi.mocked(countShoppingCategoriesByProject).mockResolvedValue(7);
    vi.mocked(countProjectDocuments).mockResolvedValue(2);

    renderDetail();

    expect(await screen.findByRole("tab", { name: "Compras (7)" })).toBeInTheDocument();
    // A contagem é a da união das três origens (feature 105), não a de `project_id`.
    expect(screen.getByRole("tab", { name: "Documentos (2)" })).toBeInTheDocument();
    expect(countShoppingCategoriesByProject).toHaveBeenCalledWith(PROJECT_ID);
    expect(countProjectDocuments).toHaveBeenCalledWith(PROJECT_ID);
  });

  it("contagem zero não mostra número", async () => {
    renderDetail();

    await screen.findByText(project.name);
    expect(screen.getByRole("tab", { name: "Compras" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Documentos" })).toBeInTheDocument();
  });

  it("abrir com ?tab=notas já carrega na aba de documentos (o valor antigo continua valendo)", async () => {
    renderDetail(`/tasks/projects/${PROJECT_ID}?tab=notas`);

    const documentos = await screen.findByRole("tab", { name: "Documentos" });
    expect(documentos).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Kanban" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  /** O apelido da 105: o rótulo novo também funciona como link, e cai na mesma aba. */
  it("?tab=documentos abre a mesma aba que ?tab=notas", async () => {
    renderDetail(`/tasks/projects/${PROJECT_ID}?tab=documentos`);

    expect(await screen.findByRole("tab", { name: "Documentos" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    // E é a aba de verdade, com a seção montada dentro dela.
    expect(
      await screen.findByRole("heading", { name: "Documentos do projeto", level: 2 })
    ).toBeInTheDocument();
    expect(fetchProjectDocuments).toHaveBeenCalledWith(PROJECT_ID);
  });

  /**
   * Feature 105: com a aba hospedando mais de uma seção (a 106 pendura ali links e arquivos), o
   * cabeçalho interno volta — a 069 o tinha desligado porque o gatilho da aba já era o título.
   */
  it("a aba mostra o cabeçalho da seção de documentos", async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText(project.name);
    await user.click(screen.getByRole("tab", { name: "Documentos" }));

    expect(
      await screen.findByRole("heading", { name: "Documentos do projeto", level: 2 })
    ).toBeInTheDocument();
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
  it("na aba Kanban, compras e documentos não estão no documento — o quadro é o único conteúdo", async () => {
    renderDetail();

    await screen.findByText(project.name);

    // O quadro está lá, com as três colunas de status.
    expect(screen.getByRole("heading", { name: /A fazer/ })).toBeInTheDocument();

    // E nada das duas seções: nem região, nem título, nem estado vazio delas.
    expect(screen.queryByRole("region", { name: "Compras do projeto" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Documentos do projeto" })).toBeNull();
    expect(screen.queryByText("Compras do projeto")).toBeNull();
    expect(screen.queryByText("Documentos do projeto")).toBeNull();
    expect(screen.queryByText("Nenhuma categoria de compras neste projeto")).toBeNull();
    expect(screen.queryByText("Nenhum documento neste projeto")).toBeNull();
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
    vi.mocked(countProjectDocuments).mockRejectedValue(new Error("offline"));

    renderDetail();

    // A página carregou (o nome do projeto está lá) e as abas continuam de pé, sem número.
    expect(await screen.findByText(project.name)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Compras" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Documentos" })).toBeInTheDocument();
    // E sem toast de erro: contagem que falha é silenciosa.
    expect(toastMock).not.toHaveBeenCalled();
  });
});
