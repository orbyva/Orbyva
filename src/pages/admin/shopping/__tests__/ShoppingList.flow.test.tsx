import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShoppingList from "@/pages/admin/shopping/ShoppingList";
import type { ShoppingCategory, ShoppingItem } from "@/types/shopping";

/**
 * Fluxo fim a fim da Lista de Compras contra um backend falso em memória que imita o schema real
 * (inclusive o `on delete cascade` de categoria→itens). Substitui a "verificação manual no
 * navegador" da última tarefa da feature 050: cria duas categorias, cria itens em cada uma,
 * marca/desmarca comprado, edita um item, exclui uma categoria com itens e "recarrega a página"
 * (remonta o componente, refazendo os fetches) conferindo que tudo persistiu no store.
 */

const { store } = vi.hoisted(() => ({
  store: { categories: [] as ShoppingCategory[], items: [] as ShoppingItem[], seq: 0 },
}));

vi.mock("@/api/shopping/categories", () => ({
  fetchShoppingCategories: vi.fn(async () =>
    [...store.categories].sort((a, b) => a.name.localeCompare(b.name))
  ),
  createShoppingCategory: vi.fn(async (payload: Partial<ShoppingCategory>) => {
    const created = { id: `c${++store.seq}`, name: "", ...payload } as ShoppingCategory;
    store.categories.push(created);
    return created;
  }),
  updateShoppingCategory: vi.fn(
    async ({ id, ...fields }: { id: string } & Partial<ShoppingCategory>) => {
      const target = store.categories.find((c) => c.id === id);
      if (target) Object.assign(target, fields);
    }
  ),
  deleteShoppingCategory: vi.fn(async (id: string) => {
    store.categories = store.categories.filter((c) => c.id !== id);
    // on delete cascade
    store.items = store.items.filter((i) => i.shopping_category_id !== id);
  }),
}));

vi.mock("@/api/shopping/items", () => ({
  fetchShoppingItems: vi.fn(async () => store.items.map((i) => ({ ...i }))),
  createShoppingItem: vi.fn(async (payload: Partial<ShoppingItem>) => {
    const created = {
      id: `i${++store.seq}`,
      status: "pending",
      ...payload,
    } as ShoppingItem;
    store.items.push(created);
    return created;
  }),
  updateShoppingItem: vi.fn(
    async ({ id, ...fields }: { id: string } & Partial<ShoppingItem>) => {
      const target = store.items.find((i) => i.id === id);
      if (target) Object.assign(target, fields);
    }
  ),
  deleteShoppingItem: vi.fn(async (id: string) => {
    store.items = store.items.filter((i) => i.id !== id);
  }),
  setShoppingItemStatus: vi.fn(async (id: string, status: ShoppingItem["status"]) => {
    const target = store.items.find((i) => i.id === id);
    if (target) target.status = status;
  }),
  // Feature 051: nenhum item deste fluxo tem tarefa; o vínculo em si é coberto por
  // `ShoppingList.task-link.flow.test.tsx`, que roda contra um backend falso de Supabase.
  fetchTaskLinksForItems: vi.fn(async () => new Map()),
  createTaskFromShoppingItem: vi.fn(),
}));

// A página carrega os projetos para o filtro e para o campo "Projeto" da categoria (feature 052);
// este fluxo é sobre o núcleo da 050, então nenhum projeto existe.
vi.mock("@/api/tasks/projects", () => ({
  fetchProjects: vi.fn(async () => []),
}));

// `toast` precisa ter identidade estável: o `load` da página é um `useCallback([toast])`, então
// um mock novo a cada render dispararia refetch em loop.
const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

beforeEach(() => {
  store.categories = [];
  store.items = [];
  store.seq = 0;
});

const user = () => userEvent.setup();

async function createCategory(name: string) {
  const u = user();
  // Com a lista vazia o botão aparece no header e no EmptyState — o do header serve pros dois.
  await u.click(screen.getAllByRole("button", { name: "Nova categoria" })[0]);
  await u.type(await screen.findByLabelText(/Nome/), name);
  await u.click(screen.getByRole("button", { name: "Criar categoria" }));
  await screen.findByRole("heading", { name, level: 2 });
}

async function createItem(categoryName: string, title: string) {
  const u = user();
  await u.click(
    screen.getByRole("button", { name: `Adicionar item em ${categoryName}` })
  );
  await u.type(await screen.findByLabelText(/Título/), title);
  await u.click(screen.getByRole("button", { name: "Criar item" }));
  await screen.findByText(title);
}

function sectionFor(name: string): HTMLElement {
  return screen
    .getByRole("heading", { name, level: 2 })
    .closest("section") as HTMLElement;
}

describe("Lista de Compras — fluxo completo", () => {
  it("cria categorias e itens, marca/desmarca comprado, edita, exclui em cascata e persiste após recarregar", async () => {
    const { unmount } = render(<ShoppingList />);

    // Estado inicial: nenhuma categoria.
    expect(await screen.findByText("Nenhuma categoria ainda")).toBeInTheDocument();

    // 1) Duas categorias.
    await createCategory("Mercado");
    await createCategory("Escritório");
    expect(store.categories.map((c) => c.name)).toEqual(["Mercado", "Escritório"]);

    // 2) Itens em cada uma.
    await createItem("Mercado", "Arroz");
    await createItem("Mercado", "Feijão");
    await createItem("Escritório", "Cabo HDMI");
    expect(store.items).toHaveLength(3);
    expect(within(sectionFor("Mercado")).getByText("2 pendentes")).toBeInTheDocument();

    // 3) Marca comprado e desmarca.
    const u = user();
    await u.click(
      screen.getByRole("checkbox", { name: "Marcar Arroz como comprado" })
    );
    await waitFor(() =>
      expect(store.items.find((i) => i.title === "Arroz")?.status).toBe("purchased")
    );
    await waitFor(() =>
      expect(within(sectionFor("Mercado")).getByText("1 pendente")).toBeInTheDocument()
    );
    expect(screen.getByText("Arroz").className).toContain("line-through");

    await u.click(
      screen.getByRole("checkbox", { name: "Marcar Arroz como comprado" })
    );
    await waitFor(() =>
      expect(store.items.find((i) => i.title === "Arroz")?.status).toBe("pending")
    );
    await waitFor(() =>
      expect(within(sectionFor("Mercado")).getByText("2 pendentes")).toBeInTheDocument()
    );

    // 4) Edita um item (título + quantidade).
    await u.click(screen.getByRole("button", { name: "Editar Feijão" }));
    const titleField = await screen.findByLabelText(/Título/);
    await u.clear(titleField);
    await u.type(titleField, "Feijão preto");
    await u.type(screen.getByLabelText(/Quantidade/), "2");
    await u.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByText("Feijão preto")).toBeInTheDocument();
    expect(store.items.find((i) => i.id === "i4")).toMatchObject({
      title: "Feijão preto",
      quantity: 2,
    });

    // 5) Exclui a categoria com itens — aviso de cascata + itens somem junto.
    await u.click(screen.getByRole("button", { name: "Excluir categoria Mercado" }));
    expect(screen.getByText("2 itens dela também serão excluídos.")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Mercado", level: 2 })).toBeNull()
    );
    expect(screen.queryByText("Arroz")).toBeNull();
    expect(screen.queryByText("Feijão preto")).toBeNull();
    expect(store.items.map((i) => i.title)).toEqual(["Cabo HDMI"]);

    // 6) "Recarrega a página": remonta e refaz os fetches.
    unmount();
    render(<ShoppingList />);

    expect(
      await screen.findByRole("heading", { name: "Escritório", level: 2 })
    ).toBeInTheDocument();
    expect(screen.getByText("Cabo HDMI")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Mercado", level: 2 })).toBeNull();
    expect(
      within(sectionFor("Escritório")).getByText("1 pendente")
    ).toBeInTheDocument();
  }, 30000);
});
