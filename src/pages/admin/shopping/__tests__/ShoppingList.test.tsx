import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShoppingList from "@/pages/admin/shopping/ShoppingList";
import {
  deleteShoppingCategory,
  fetchShoppingCategories,
} from "@/api/shopping/categories";
import {
  deleteShoppingItem,
  fetchShoppingItems,
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

const categories: ShoppingCategory[] = [
  { id: "c1", name: "Mercado", color: "#22c55e" },
  { id: "c2", name: "Escritório" },
];

function item(
  id: string,
  categoryId: string,
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
});

function sectionFor(name: string): HTMLElement {
  return screen.getByRole("heading", { name }).closest("section") as HTMLElement;
}

describe("ShoppingList", () => {
  it("sem categoria nenhuma, mostra o estado vazio e desabilita 'Novo item'", async () => {
    mockedFetchCategories.mockResolvedValue([]);
    render(<ShoppingList />);

    expect(await screen.findByText("Nenhuma categoria ainda")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Novo item" })).toBeDisabled();
  });

  it("agrupa os itens por categoria, na ordem recebida, com pendentes antes dos comprados", async () => {
    mockedFetchItems.mockResolvedValue([
      item("i1", "c1", "Café comprado", "purchased"),
      item("i2", "c1", "Arroz"),
      item("i3", "c2", "Cabo HDMI"),
    ]);
    render(<ShoppingList />);

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
    render(<ShoppingList />);

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
    render(<ShoppingList />);

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
    render(<ShoppingList />);

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
    render(<ShoppingList />);

    await screen.findByRole("heading", { name: "Mercado" });
    await user.click(
      screen.getByRole("button", { name: "Excluir categoria Mercado" })
    );
    expect(screen.getByText("A categoria não tem itens.")).toBeInTheDocument();
  });

  it("excluir item chama a API e recarrega", async () => {
    const user = userEvent.setup();
    mockedFetchItems.mockResolvedValue([item("i1", "c1", "Arroz")]);
    render(<ShoppingList />);

    await screen.findByText("Arroz");
    await user.click(screen.getByRole("button", { name: "Excluir Arroz" }));
    await user.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(mockedDeleteItem).toHaveBeenCalledWith("i1"));
    await waitFor(() => expect(mockedFetchItems).toHaveBeenCalledTimes(2));
  });

  it("'Adicionar item' da categoria abre o dialog já naquela categoria", async () => {
    const user = userEvent.setup();
    render(<ShoppingList />);

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
    render(<ShoppingList />);

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
    render(<ShoppingList />);

    await screen.findByText("Arroz");
    await user.click(screen.getByRole("button", { name: "Editar Arroz" }));

    expect(await screen.findByText("Editar item")).toBeInTheDocument();
    expect(screen.getByLabelText(/Título/)).toHaveValue("Arroz");
  });

  it("erro no load mostra toast destrutivo", async () => {
    mockedFetchCategories.mockRejectedValue(new Error("offline"));
    render(<ShoppingList />);

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      )
    );
  });
});
