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


// O guia do módulo depende do `AuthProvider` e não tem nada a ver com o que este teste afirma.
vi.mock("@/components/ModuleGuide", () => ({
  ModuleGuide: () => null,
  ModuleGuideButton: () => null,
}));

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
  it("lista totalmente vazia mostra 'Sua lista está vazia' com as duas ações", async () => {
    mockedFetchCategories.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("Sua lista está vazia")).toBeInTheDocument();
    // "Novo item" e "Nova categoria" no estado vazio, além dos dois do cabeçalho da página.
    expect(screen.getAllByRole("button", { name: "Novo item" })).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: "Nova categoria" })
    ).toHaveLength(2);
    expect(screen.getByText(/são opcionais/)).toBeInTheDocument();
  });

  it("'Novo item' fica habilitado mesmo com zero categorias e abre o dialog", async () => {
    const user = userEvent.setup();
    mockedFetchCategories.mockResolvedValue([]);
    renderPage();

    await screen.findByText("Sua lista está vazia");
    const [newItem] = screen.getAllByRole("button", { name: "Novo item" });
    expect(newItem).toBeEnabled();

    await user.click(newItem);
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

/**
 * Feature 066: categoria virou organização opcional. Item sem categoria aparece num pseudo-grupo
 * "Sem categoria", sempre por último, que não é editável nem excluível — e que não entra em
 * recorte de projeto nenhum (o vínculo com projeto é da categoria, feature 052).
 */
describe("ShoppingList — grupo 'Sem categoria'", () => {
  it("mostra o grupo dos itens soltos por último, depois das categorias reais", async () => {
    mockedFetchItems.mockResolvedValue([
      item("solto", null, "Pilha AA"),
      item("i1", "c1", "Arroz"),
    ]);
    renderPage();

    await screen.findByRole("heading", { name: "Mercado" });
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)
    ).toEqual(["Mercado", "Escritório", "Sem categoria"]);
    expect(
      within(sectionFor("Sem categoria")).getByText("Pilha AA")
    ).toBeInTheDocument();
    expect(
      within(sectionFor("Sem categoria")).getByText("1 pendente")
    ).toBeInTheDocument();
  });

  it("o grupo não existe quando nenhum item está solto", async () => {
    mockedFetchItems.mockResolvedValue([item("i1", "c1", "Arroz")]);
    renderPage();

    await screen.findByRole("heading", { name: "Mercado" });
    expect(
      screen.queryByRole("heading", { name: "Sem categoria" })
    ).toBeNull();
  });

  it("o cabeçalho do grupo não oferece editar nem excluir, só adicionar item", async () => {
    mockedFetchItems.mockResolvedValue([item("solto", null, "Pilha AA")]);
    renderPage();

    const grupo = await screen
      .findByRole("heading", { name: "Sem categoria" })
      .then((h) => h.closest("section") as HTMLElement);

    expect(
      within(grupo).getByRole("button", { name: "Adicionar item sem categoria" })
    ).toBeInTheDocument();
    expect(
      within(grupo).queryByRole("button", { name: /Editar categoria/ })
    ).toBeNull();
    expect(
      within(grupo).queryByRole("button", { name: /Excluir categoria/ })
    ).toBeNull();
    // A linha do item continua completa: editar, excluir e marcar comprado.
    expect(
      within(grupo).getByRole("button", { name: "Editar Pilha AA" })
    ).toBeInTheDocument();
    expect(
      within(grupo).getByRole("button", { name: "Excluir Pilha AA" })
    ).toBeInTheDocument();
    expect(
      within(grupo).getByRole("checkbox", {
        name: "Marcar Pilha AA como comprado",
      })
    ).toBeInTheDocument();
  });

  it("some quando há filtro de projeto ativo — item solto não pertence a projeto nenhum", async () => {
    mockedFetchCategories.mockResolvedValue([
      { id: "c1", name: "Mercado", project_id: "p1" },
      { id: "c2", name: "Escritório" },
    ]);
    mockedFetchItems.mockResolvedValue([
      item("solto", null, "Pilha AA"),
      item("i1", "c1", "Cimento"),
    ]);
    renderPage("/shopping-list?project=p1");

    await screen.findByRole("heading", { name: "Mercado" });
    expect(screen.queryByRole("heading", { name: "Sem categoria" })).toBeNull();
    expect(screen.queryByText("Pilha AA")).toBeNull();
    expect(screen.getByText("Cimento")).toBeInTheDocument();
  });

  it("com zero categorias mas com item solto, mostra o grupo e nenhum estado vazio", async () => {
    mockedFetchCategories.mockResolvedValue([]);
    mockedFetchItems.mockResolvedValue([item("solto", null, "Pilha AA")]);
    renderPage();

    await screen.findByRole("heading", { name: "Sem categoria" });
    expect(screen.getByText("Pilha AA")).toBeInTheDocument();
    expect(screen.queryByText("Sua lista está vazia")).toBeNull();
    expect(screen.queryByText("Nenhuma categoria ainda")).toBeNull();
  });

  it("'Adicionar item sem categoria' abre o dialog já em 'Sem categoria'", async () => {
    const user = userEvent.setup();
    mockedFetchItems.mockResolvedValue([item("solto", null, "Pilha AA")]);
    renderPage();

    await screen.findByRole("heading", { name: "Sem categoria" });
    await user.click(
      screen.getByRole("button", { name: "Adicionar item sem categoria" })
    );

    expect(
      await screen.findByRole("heading", { name: "Novo item" })
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Categoria" })).toHaveTextContent(
      "Sem categoria"
    );
  });

  it("com filtro de projeto sem categoria nenhuma, segue o estado vazio do projeto", async () => {
    mockedFetchCategories.mockResolvedValue([{ id: "c2", name: "Escritório" }]);
    mockedFetchItems.mockResolvedValue([item("solto", null, "Pilha AA")]);
    renderPage("/shopping-list?project=p1");

    expect(
      await screen.findByText("Nenhuma categoria neste projeto")
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sem categoria" })).toBeNull();
  });
});
