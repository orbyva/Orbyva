import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ShoppingList from "@/pages/admin/shopping/ShoppingList";
import { ProjectShoppingSection } from "@/pages/admin/shopping/ProjectShoppingSection";
import { PROJECT_FALLBACK_COLOR } from "@/lib/design-tokens";
import type { ShoppingCategory, ShoppingItem } from "@/types/shopping";

/**
 * Verificação do pedido literal da feature 052 — "ver os itens, POR CATEGORIAS, de um projeto em
 * específico" — contra um backend falso em memória que imita o schema real, inclusive o
 * `on delete set null` de `shopping_category.project_id`.
 *
 * Substitui a "verificação manual" da última tarefa: a skill `next` proíbe navegador, então o
 * roteiro que a tarefa descreve (duas categorias em projetos diferentes e uma sem projeto, filtrar,
 * abrir a URL já filtrada, ver na página do projeto, excluir o projeto) roda aqui como teste.
 */

const { store } = vi.hoisted(() => ({
  store: {
    categories: [] as ShoppingCategory[],
    items: [] as ShoppingItem[],
    projects: [] as { id: string; name: string; color?: string | null }[],
  },
}));


// O guia do módulo depende do `AuthProvider` e não tem nada a ver com o que este teste afirma.
vi.mock("@/components/ModuleGuide", () => ({
  ModuleGuide: () => null,
  ModuleGuideButton: () => null,
}));

vi.mock("@/api/shopping/categories", () => ({
  fetchShoppingCategories: vi.fn(
    async ({ projectId }: { projectId?: string | null } = {}) =>
      store.categories
        .filter((c) => (projectId ? c.project_id === projectId : true))
        .map((c) => ({ ...c }))
        .sort((a, b) => a.name.localeCompare(b.name))
  ),
  createShoppingCategory: vi.fn(),
  updateShoppingCategory: vi.fn(),
  deleteShoppingCategory: vi.fn(),
}));

vi.mock("@/api/shopping/items", () => ({
  fetchShoppingItems: vi.fn(async () => store.items.map((i) => ({ ...i }))),
  createShoppingItem: vi.fn(),
  updateShoppingItem: vi.fn(),
  deleteShoppingItem: vi.fn(),
  setShoppingItemStatus: vi.fn(),
  fetchTaskLinksForItems: vi.fn(async () => new Map()),
  createTaskFromShoppingItem: vi.fn(),
}));

vi.mock("@/api/tasks/projects", () => ({
  fetchProjects: vi.fn(async () => store.projects.map((p) => ({ ...p }))),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

/** O que a migration faz ao excluir um projeto: zera o vínculo, preserva categoria e itens. */
function deleteProject(projectId: string) {
  store.projects = store.projects.filter((p) => p.id !== projectId);
  for (const category of store.categories) {
    if (category.project_id === projectId) category.project_id = null;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  store.projects = [
    // Cor de verdade: é ela que o pill do projeto (feature 112) tem de pintar na bolinha.
    { id: "p1", name: "Obra da casa", color: "#ff6600" },
    { id: "p2", name: "Setup do estúdio", color: "#2266ff" },
  ];
  store.categories = [
    { id: "c1", name: "Materiais", project_id: "p1" },
    { id: "c2", name: "Áudio", project_id: "p2" },
    { id: "c3", name: "Mercado" },
  ];
  store.items = [
    { id: "i1", shopping_category_id: "c1", title: "Cimento", status: "pending" },
    { id: "i2", shopping_category_id: "c1", title: "Areia", status: "purchased" },
    { id: "i3", shopping_category_id: "c2", title: "Interface", status: "pending" },
    { id: "i4", shopping_category_id: "c3", title: "Café", status: "pending" },
  ];
});

function renderList(url = "/shopping-list") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ShoppingList />
    </MemoryRouter>
  );
}

function sectionFor(name: string): HTMLElement {
  return screen
    .getByRole("heading", { name, level: 2 })
    .closest("section") as HTMLElement;
}

describe("Lista de Compras — itens por categoria de um projeto específico", () => {
  it("sem filtro, mostra as três categorias, cada uma com seus itens", async () => {
    renderList();

    await screen.findByRole("heading", { name: "Materiais", level: 2 });
    expect(within(sectionFor("Materiais")).getByText("Cimento")).toBeInTheDocument();
    expect(within(sectionFor("Áudio")).getByText("Interface")).toBeInTheDocument();
    expect(within(sectionFor("Mercado")).getByText("Café")).toBeInTheDocument();
  });

  it("abrir /shopping-list?project=p1 já carrega filtrado, e a lista continua agrupada por categoria", async () => {
    renderList("/shopping-list?project=p1");

    // Só a categoria do projeto — e ainda como seção agrupada, não uma lista achatada de itens.
    await screen.findByRole("heading", { name: "Materiais", level: 2 });
    const materiais = sectionFor("Materiais");
    expect(within(materiais).getByText("Cimento")).toBeInTheDocument();
    expect(within(materiais).getByText("Areia")).toBeInTheDocument();

    // As outras somem: a de outro projeto e a sem projeto nenhum.
    expect(
      screen.queryByRole("heading", { name: "Áudio", level: 2 })
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Mercado", level: 2 })
    ).toBeNull();
    expect(screen.queryByText("Interface")).toBeNull();
    expect(screen.queryByText("Café")).toBeNull();
  });

  it("categoria sem projeto não aparece em filtro de projeto nenhum", async () => {
    renderList("/shopping-list?project=p2");

    await screen.findByRole("heading", { name: "Áudio", level: 2 });
    expect(
      screen.queryByRole("heading", { name: "Mercado", level: 2 })
    ).toBeNull();
  });

  it("a página do projeto mostra o mesmo conteúdo da lista filtrada", async () => {
    render(
      <MemoryRouter>
        <ProjectShoppingSection projectId="p1" />
      </MemoryRouter>
    );

    await screen.findByRole("heading", { name: "Materiais" });
    expect(screen.getByText("Cimento")).toBeInTheDocument();
    expect(screen.getByText("Areia")).toBeInTheDocument();
    // Nada do outro projeto nem da categoria sem projeto.
    expect(screen.queryByText("Interface")).toBeNull();
    expect(screen.queryByText("Café")).toBeNull();
  });

  it("excluir o projeto preserva a categoria e seus itens, agora entre as categorias sem projeto", async () => {
    deleteProject("p1");

    renderList();

    // A categoria sobreviveu, com os itens.
    await screen.findByRole("heading", { name: "Materiais", level: 2 });
    expect(within(sectionFor("Materiais")).getByText("Cimento")).toBeInTheDocument();
    expect(within(sectionFor("Materiais")).getByText("Areia")).toBeInTheDocument();

    // E o projeto sumiu do seletor de filtro, já que não existe mais.
    expect(screen.queryByText("Obra da casa")).toBeNull();
  });

  it("depois de excluir o projeto, a categoria não aparece mais no filtro daquele projeto", async () => {
    deleteProject("p1");

    renderList("/shopping-list?project=p1");

    // O único conteúdo possível agora é o estado vazio do filtro.
    expect(
      await screen.findByText("Nenhuma categoria neste projeto")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Materiais", level: 2 })
    ).toBeNull();
  });
});

/**
 * Feature 112: o nome do projeto na seção deixou de ser um `Badge` cinza morto e virou o
 * `ProjectPill` — bolinha na cor do projeto e link para a página dele. Como Chrome é proibido na
 * esteira, é aqui que isso fica provado.
 */
describe("Lista de Compras — pill do projeto na seção da categoria (feature 112)", () => {
  /** A bolinha do pill: o span decorativo de dentro do link. */
  function dotOf(pill: HTMLElement): HTMLElement {
    const dot = pill.querySelector<HTMLElement>('span[aria-hidden="true"]');
    if (!dot) throw new Error("bolinha do pill não encontrada");
    return dot;
  }

  it("sem filtro, a categoria de projeto mostra o pill com a cor do projeto e link para ele", async () => {
    renderList();

    await screen.findByRole("heading", { name: "Materiais", level: 2 });
    const pill = within(sectionFor("Materiais")).getByRole("link", {
      name: /Obra da casa/,
    });
    expect(pill).toHaveAttribute("href", "/tasks/projects/p1");
    expect(dotOf(pill)).toHaveStyle({ backgroundColor: "#ff6600" });
    // Cada seção leva ao **seu** projeto, não ao primeiro da lista.
    const outro = within(sectionFor("Áudio")).getByRole("link", {
      name: /Setup do estúdio/,
    });
    expect(outro).toHaveAttribute("href", "/tasks/projects/p2");
    expect(dotOf(outro)).toHaveStyle({ backgroundColor: "#2266ff" });
  });

  it("o badge cinza sem cor não existe mais na seção", async () => {
    const { container } = renderList();

    await screen.findByRole("heading", { name: "Materiais", level: 2 });
    expect(container.querySelector(".bg-secondary")).toBeNull();
  });

  it("com ?project=p1 na URL, o pill some das seções — o nome já está no topo", async () => {
    renderList("/shopping-list?project=p1");

    await screen.findByRole("heading", { name: "Materiais", level: 2 });
    expect(
      within(sectionFor("Materiais")).queryByRole("link", { name: /Obra da casa/ })
    ).toBeNull();
  });

  it("categoria sem projeto não ganha pill nenhum", async () => {
    renderList();

    await screen.findByRole("heading", { name: "Mercado", level: 2 });
    expect(within(sectionFor("Mercado")).queryByRole("link")).toBeNull();
    expect(within(sectionFor("Mercado")).queryByText("Sem projeto")).toBeNull();
  });

  it("projeto sem cor cai no cinza padrão, e o pill continua clicável", async () => {
    store.projects = [{ id: "p1", name: "Obra da casa", color: null }];
    renderList();

    await screen.findByRole("heading", { name: "Materiais", level: 2 });
    const pill = within(sectionFor("Materiais")).getByRole("link", {
      name: /Obra da casa/,
    });
    expect(dotOf(pill)).toHaveStyle({ backgroundColor: PROJECT_FALLBACK_COLOR });
    expect(pill).toHaveAttribute("href", "/tasks/projects/p1");
  });
});
