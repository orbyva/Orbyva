import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProjectShoppingSection } from "@/pages/admin/shopping/ProjectShoppingSection";
import { fetchShoppingCategories } from "@/api/shopping/categories";
import { fetchShoppingItems } from "@/api/shopping/items";
import type { ShoppingCategory, ShoppingItem } from "@/types/shopping";

vi.mock("@/api/shopping/categories", () => ({
  fetchShoppingCategories: vi.fn(),
}));
vi.mock("@/api/shopping/items", () => ({
  fetchShoppingItems: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const mockedFetchCategories = vi.mocked(fetchShoppingCategories);
const mockedFetchItems = vi.mocked(fetchShoppingItems);

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
});

function renderSection(projectId = "p1") {
  return render(
    <MemoryRouter>
      <ProjectShoppingSection projectId={projectId} />
    </MemoryRouter>
  );
}

describe("ProjectShoppingSection", () => {
  it("pede ao backend só as categorias do projeto e as mostra agrupadas com seus itens", async () => {
    const categories: ShoppingCategory[] = [
      { id: "c1", name: "Materiais", project_id: "p1" },
      { id: "c2", name: "Ferramentas", project_id: "p1" },
    ];
    mockedFetchCategories.mockResolvedValue(categories);
    mockedFetchItems.mockResolvedValue([
      item("i1", "c1", "Cimento"),
      item("i2", "c1", "Areia", "purchased"),
      item("i3", "c2", "Furadeira"),
      // Item de uma categoria de outro projeto: não deve aparecer.
      item("i4", "c9", "Item alheio"),
    ]);

    renderSection();

    // O recorte por projeto é do backend, não filtragem no cliente.
    expect(mockedFetchCategories).toHaveBeenCalledWith({ projectId: "p1" });

    const materiais = (
      await screen.findByRole("heading", { name: "Materiais" })
    ).closest("div.rounded-lg") as HTMLElement;
    expect(within(materiais).getByText("Cimento")).toBeInTheDocument();
    expect(within(materiais).getByText("Areia")).toBeInTheDocument();
    // Um pendente em Materiais (Areia já foi comprada).
    expect(within(materiais).getByText("1 pendente")).toBeInTheDocument();

    expect(
      await screen.findByRole("heading", { name: "Ferramentas" })
    ).toBeInTheDocument();
    expect(screen.getByText("Furadeira")).toBeInTheDocument();
    expect(screen.queryByText("Item alheio")).toBeNull();
  });

  it("sem categoria vinculada, mostra o estado vazio", async () => {
    mockedFetchCategories.mockResolvedValue([]);
    mockedFetchItems.mockResolvedValue([]);

    renderSection();

    expect(
      await screen.findByText("Nenhuma categoria de compras neste projeto")
    ).toBeInTheDocument();
  });

  it("o link leva à Lista de Compras já filtrada por este projeto", async () => {
    mockedFetchCategories.mockResolvedValue([]);
    mockedFetchItems.mockResolvedValue([]);

    renderSection("p42");

    const link = await screen.findByRole("link", {
      name: "Ver na Lista de Compras",
    });
    expect(link).toHaveAttribute("href", "/shopping-list?project=p42");
  });

  it("erro no carregamento vira toast destrutivo, sem quebrar a página do projeto", async () => {
    mockedFetchCategories.mockRejectedValue(new Error("sem conexão"));
    mockedFetchItems.mockResolvedValue([]);

    renderSection();

    await vi.waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      )
    );
  });
});
