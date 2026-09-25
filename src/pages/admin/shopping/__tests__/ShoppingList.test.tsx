import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ShoppingList from "@/pages/admin/shopping/ShoppingList";
import {
  deleteShoppingCategory,
  fetchShoppingCategories,
} from "@/api/shopping/categories";
import {
  createTaskFromShoppingItem,
  deleteShoppingItem,
  fetchShoppingItems,
  fetchTaskLinksForItems,
  setShoppingItemStatus,
} from "@/api/shopping/items";
import type { ShoppingCategory, ShoppingItem } from "@/types/shopping";

vi.mock("@/api/shopping/categories", () => ({
  fetchShoppingCategories: vi.fn(),
  createShoppingCategory: vi.fn(),
  updateShoppingCategory: vi.fn(),
  deleteShoppingCategory: vi.fn(),
}));

vi.mock("@/api/shopping/items", () => ({
  fetchShoppingItems: vi.fn(),
  createShoppingItem: vi.fn(),
  updateShoppingItem: vi.fn(),
  deleteShoppingItem: vi.fn(),
  setShoppingItemStatus: vi.fn(),
  fetchTaskLinksForItems: vi.fn(),
  createTaskFromShoppingItem: vi.fn(),
}));

// A página carrega os projetos para o filtro e para o campo "Projeto" da categoria (feature 052).
const { projectFixtures } = vi.hoisted(() => ({
  projectFixtures: [
    { id: "p1", name: "Obra da casa" },
    { id: "p2", name: "Setup do estúdio" },
  ],
}));
vi.mock("@/api/tasks/projects", () => ({
  fetchProjects: vi.fn(async () => projectFixtures),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const mockedFetchCategories = vi.mocked(fetchShoppingCategories);
const mockedFetchItems = vi.mocked(fetchShoppingItems);
const mockedDeleteCategory = vi.mocked(deleteShoppingCategory);
const mockedDeleteItem = vi.mocked(deleteShoppingItem);
const mockedSetStatus = vi.mocked(setShoppingItemStatus);
const mockedFetchTaskLinks = vi.mocked(fetchTaskLinksForItems);
const mockedCreateTask = vi.mocked(createTaskFromShoppingItem);

const categories: ShoppingCategory[] = [
  { id: "c1", name: "Mercado", color: "#22c55e" },
  { id: "c2", name: "Escritório" },
];

function item(
  id: string,
  categoryId: string | null,
  title: string,
  status: ShoppingItem["status"] = "pending"
): ShoppingItem {
  return { id, shopping_category_id: categoryId, title, status };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedFetchCategories.mockResolvedValue(categories);
  mockedFetchItems.mockResolvedValue([]);
  mockedDeleteCategory.mockResolvedValue(undefined);
  mockedDeleteItem.mockResolvedValue(undefined);
  mockedSetStatus.mockResolvedValue(undefined);
  mockedFetchTaskLinks.mockResolvedValue(new Map());
});

function sectionFor(name: string): HTMLElement {
  return screen.getByRole("heading", { name }).closest("section") as HTMLElement;
}

/**
 * A página lê o filtro de projeto do query param (`?project=<id>`), então precisa de Router —
 * `initialEntries` é a própria URL que o usuário abriria.
 */
function renderPage(url = "/shopping-list") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ShoppingList />
    </MemoryRouter>
  );
}

describe("ShoppingList", () => {
  /**
   * Reabertura 2026-08-18: o estado vazio só aparece quando não há **nem categoria nem item**, e
   * "Novo item" nunca fica desabilitado — anotar um item não pode depender de cadastrar categoria.
   */
  it("sem categoria nem item, mostra o estado vazio com as duas ações e 'Novo item' habilitado", async () => {
    mockedFetchCategories.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("Sua lista está vazia")).toBeInTheDocument();
    // O botão do cabeçalho e o do EmptyState — os dois habilitados.
    const novoItem = screen.getAllByRole("button", { name: "Novo item" });
    expect(novoItem).toHaveLength(2);
    novoItem.forEach((button) => expect(button).toBeEnabled());
    expect(
      screen.getAllByRole("button", { name: "Nova categoria" })
    ).toHaveLength(2);
  });

  it("item sem categoria aparece na seção 'Sem categoria', por último e sem ações de categoria", async () => {
    mockedFetchItems.mockResolvedValue([
      item("i1", "c1", "Arroz"),
      item("i2", null, "Pilha AA"),
    ]);
    renderPage();

    await screen.findByRole("heading", { name: "Sem categoria" });
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)
    ).toEqual(["Mercado", "Escritório", "Sem categoria"]);

    const semCategoria = sectionFor("Sem categoria");
    expect(within(semCategoria).getByText("Pilha AA")).toBeInTheDocument();
    expect(within(semCategoria).getByText("1 pendente")).toBeInTheDocument();

    // Não há linha em shopping_category por trás: nada de editar, excluir ou "Adicionar item em…".
    expect(
      screen.queryByRole("button", { name: "Editar categoria Sem categoria" })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Excluir categoria Sem categoria" })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Adicionar item em Sem categoria" })
    ).toBeNull();
  });

  it("sem nenhum item nulo, a seção 'Sem categoria' não existe", async () => {
    mockedFetchItems.mockResolvedValue([item("i1", "c1", "Arroz")]);
    renderPage();

    await screen.findByRole("heading", { name: "Mercado" });
    expect(screen.queryByRole("heading", { name: "Sem categoria" })).toBeNull();
  });

  it("só com itens sem categoria, a lista renderiza a seção sintética em vez do estado vazio", async () => {
    mockedFetchCategories.mockResolvedValue([]);
    mockedFetchItems.mockResolvedValue([item("i2", null, "Pilha AA")]);
    renderPage();

    await screen.findByRole("heading", { name: "Sem categoria" });
    expect(screen.queryByText("Sua lista está vazia")).toBeNull();
    expect(screen.getByText("Pilha AA")).toBeInTheDocument();
  });

  it("com filtro de projeto ativo, a seção 'Sem categoria' some", async () => {
    mockedFetchCategories.mockResolvedValue([
      { id: "c1", name: "Mercado", project_id: "p1" },
    ]);
    mockedFetchItems.mockResolvedValue([
      item("i1", "c1", "Arroz"),
      item("i2", null, "Pilha AA"),
    ]);
    renderPage("/shopping-list?project=p1");

    await screen.findByRole("heading", { name: "Mercado" });
    expect(screen.queryByRole("heading", { name: "Sem categoria" })).toBeNull();
    expect(screen.queryByText("Pilha AA")).toBeNull();
  });

  it("'Novo item' do cabeçalho abre o dialog sem categoria pré-selecionada", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "Mercado" });
    await user.click(screen.getByRole("button", { name: "Novo item" }));

    expect(
      await screen.findByRole("heading", { name: "Novo item" })
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Categoria" })).toHaveTextContent(
      "Sem categoria"
    );
  });

  it("agrupa os itens por categoria, na ordem recebida, com pendentes antes dos comprados", async () => {
    mockedFetchItems.mockResolvedValue([
      item("i1", "c1", "Café comprado", "purchased"),
      item("i2", "c1", "Arroz"),
      item("i3", "c2", "Cabo HDMI"),
    ]);
    renderPage();

    await screen.findByRole("heading", { name: "Mercado" });

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual(["Mercado", "Escritório"]);

    const mercado = sectionFor("Mercado");
    const titles = within(mercado)
      .getAllByRole("listitem")
      .map((li) => within(li).getByRole("checkbox").getAttribute("aria-label"));
    expect(titles).toEqual([
      "Marcar Arroz como comprado",
      "Marcar Café comprado como comprado",
    ]);

    expect(within(sectionFor("Escritório")).getByText("Cabo HDMI")).toBeInTheDocument();
    expect(within(mercado).queryByText("Cabo HDMI")).not.toBeInTheDocument();
  });

  it("mostra a contagem de pendentes por categoria e atualiza ao marcar comprado", async () => {
    const user = userEvent.setup();
    mockedFetchItems.mockResolvedValue([
      item("i1", "c1", "Arroz"),
      item("i2", "c1", "Feijão"),
      item("i3", "c2", "Cabo HDMI"),
    ]);
    renderPage();

    await screen.findByRole("heading", { name: "Mercado" });
    expect(within(sectionFor("Mercado")).getByText("2 pendentes")).toBeInTheDocument();
    expect(within(sectionFor("Escritório")).getByText("1 pendente")).toBeInTheDocument();

    await user.click(
      screen.getByRole("checkbox", { name: "Marcar Arroz como comprado" })
    );

    await waitFor(() =>
      expect(mockedSetStatus).toHaveBeenCalledWith("i1", "purchased")
    );
    await waitFor(() =>
      expect(within(sectionFor("Mercado")).getByText("1 pendente")).toBeInTheDocument()
    );
  });

  it("categoria sem itens mostra o próprio estado vazio", async () => {
    mockedFetchItems.mockResolvedValue([item("i1", "c1", "Arroz")]);
    renderPage();

    await screen.findByRole("heading", { name: "Escritório" });
    expect(
      within(sectionFor("Escritório")).getByText("Nenhum item nesta categoria ainda.")
    ).toBeInTheDocument();
    expect(within(sectionFor("Escritório")).getByText("0 pendentes")).toBeInTheDocument();
  });

  it("excluir categoria avisa quantos itens vão junto e recarrega a lista", async () => {
    const user = userEvent.setup();
    mockedFetchItems.mockResolvedValue([
      item("i1", "c1", "Arroz"),
      item("i2", "c1", "Feijão"),
    ]);
    renderPage();

    await screen.findByRole("heading", { name: "Mercado" });
    await user.click(
      screen.getByRole("button", { name: "Excluir categoria Mercado" })
    );
    expect(
      screen.getByText("2 itens dela também serão excluídos.")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(mockedDeleteCategory).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(mockedFetchCategories).toHaveBeenCalledTimes(2));
  });

  it("excluir categoria vazia avisa que não há itens", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "Mercado" });
    await user.click(
      screen.getByRole("button", { name: "Excluir categoria Mercado" })
    );
    expect(screen.getByText("A categoria não tem itens.")).toBeInTheDocument();
  });

  it("excluir item chama a API e recarrega", async () => {
    const user = userEvent.setup();
    mockedFetchItems.mockResolvedValue([item("i1", "c1", "Arroz")]);
    renderPage();

    await screen.findByText("Arroz");
    await user.click(screen.getByRole("button", { name: "Excluir Arroz" }));
    await user.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(mockedDeleteItem).toHaveBeenCalledWith("i1"));
    await waitFor(() => expect(mockedFetchItems).toHaveBeenCalledTimes(2));
  });

  it("'Adicionar item' da categoria abre o dialog já naquela categoria", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "Escritório" });
    await user.click(
      screen.getByRole("button", { name: "Adicionar item em Escritório" })
    );

    expect(
      await screen.findByRole("heading", { name: "Novo item" })
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Categoria" })).toHaveTextContent(
      "Escritório"
    );
  });

  it("editar categoria abre o dialog preenchido", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "Mercado" });
    await user.click(
      screen.getByRole("button", { name: "Editar categoria Mercado" })
    );

    expect(await screen.findByText("Editar categoria")).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome/)).toHaveValue("Mercado");
  });

  it("editar item abre o dialog preenchido com o item clicado", async () => {
    const user = userEvent.setup();
    mockedFetchItems.mockResolvedValue([item("i1", "c1", "Arroz")]);
    renderPage();

    await screen.findByText("Arroz");
    await user.click(screen.getByRole("button", { name: "Editar Arroz" }));

    expect(await screen.findByText("Editar item")).toBeInTheDocument();
    expect(screen.getByLabelText(/Título/)).toHaveValue("Arroz");
  });

  it("erro no load mostra toast destrutivo", async () => {
    mockedFetchCategories.mockRejectedValue(new Error("offline"));
    renderPage();

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      )
    );
  });
});

/**
 * Feature 051: descobrir "quais itens já têm tarefa" custa **uma** consulta por carregamento da
 * página, não uma por item. Substitui a conferência na aba Network do navegador que a tarefa
 * original pedia (navegador está fora deste fluxo).
 */
describe("ShoppingList — carregamento dos vínculos com tarefas", () => {
  it("faz UMA chamada de vínculos por carregamento, com todos os ids, mesmo com 60 itens", async () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      item(`i${i}`, i % 2 === 0 ? "c1" : "c2", `Item ${i}`)
    );
    mockedFetchItems.mockResolvedValue(many);
    render(
      <MemoryRouter>
        <ShoppingList />
      </MemoryRouter>
    );

    await screen.findByText("Item 59");
    expect(mockedFetchTaskLinks).toHaveBeenCalledTimes(1);
    expect(mockedFetchTaskLinks).toHaveBeenCalledWith(many.map((it) => it.id));
    // 60 itens ⇒ 3 requisições no total (categorias, itens, vínculos) — nada de N+1.
    expect(mockedFetchCategories).toHaveBeenCalledTimes(1);
    expect(mockedFetchItems).toHaveBeenCalledTimes(1);
  });

  it("lista sem item nenhum ainda chama os vínculos uma vez, com lista vazia", async () => {
    mockedFetchItems.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <ShoppingList />
      </MemoryRouter>
    );

    await screen.findByRole("heading", { name: "Mercado" });
    expect(mockedFetchTaskLinks).toHaveBeenCalledTimes(1);
    expect(mockedFetchTaskLinks).toHaveBeenCalledWith([]);
  });

  it("repassa o vínculo para a linha certa: item com tarefa mostra o atalho, o outro mostra 'Criar tarefa'", async () => {
    mockedFetchItems.mockResolvedValue([
      item("i1", "c1", "Arroz"),
      item("i2", "c1", "Feijão"),
    ]);
    mockedFetchTaskLinks.mockResolvedValue(
      new Map([["i1", { taskId: "t1", title: "Comprar Arroz", status: "todo" as const }]])
    );
    render(
      <MemoryRouter>
        <ShoppingList />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole("link", { name: 'Ver tarefa "Comprar Arroz"' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Criar tarefa para Arroz" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Criar tarefa para Feijão" })
    ).toBeInTheDocument();
  });

  it("criar a tarefa de um item troca o botão pelo atalho sem refazer os fetches da página", async () => {
    const user = userEvent.setup();
    mockedFetchItems.mockResolvedValue([item("i1", "c1", "Arroz")]);
    mockedCreateTask.mockResolvedValue({
      id: "t1",
      title: "Comprar Arroz",
      status: "todo",
    } as never);
    render(
      <MemoryRouter>
        <ShoppingList />
      </MemoryRouter>
    );

    await user.click(
      await screen.findByRole("button", { name: "Criar tarefa para Arroz" })
    );

    expect(
      await screen.findByRole("link", { name: 'Ver tarefa "Comprar Arroz"' })
    ).toBeInTheDocument();
    expect(mockedFetchTaskLinks).toHaveBeenCalledTimes(1);
    expect(mockedFetchItems).toHaveBeenCalledTimes(1);
  });

  it("sem filtro, o cabeçalho da categoria vinculada mostra o nome do projeto", async () => {
    mockedFetchCategories.mockResolvedValue([
      { id: "c1", name: "Mercado", project_id: "p1" },
      { id: "c2", name: "Escritório" },
    ]);
    renderPage();

    await screen.findByRole("heading", { name: "Mercado" });
    expect(
      within(sectionFor("Mercado")).getByText("Obra da casa")
    ).toBeInTheDocument();
    // A categoria sem projeto não ganha badge nenhum.
    expect(
      within(sectionFor("Escritório")).queryByText("Obra da casa")
    ).toBeNull();
  });

  it("com filtro ativo, o nome do projeto não se repete em cada categoria", async () => {
    mockedFetchCategories.mockResolvedValue([
      { id: "c1", name: "Mercado", project_id: "p1" },
    ]);
    renderPage("/shopping-list?project=p1");

    // O projeto é dito no cabeçalho da página, e não repetido dentro da seção da categoria.
    await screen.findByRole("heading", { name: "Mercado" });
    expect(
      within(sectionFor("Mercado")).queryByText("Obra da casa")
    ).toBeNull();
    expect(
      screen.getByText(/Mostrando as compras de/)
    ).toHaveTextContent("Obra da casa");
  });
});
