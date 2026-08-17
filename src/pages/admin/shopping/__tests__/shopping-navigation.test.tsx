import { beforeEach, describe, expect, it, vi } from "vitest";
import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, matchRoutes } from "react-router-dom";
import { appRoutes } from "@/routes";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { fetchShoppingCategories } from "@/api/shopping/categories";
import { fetchShoppingItems } from "@/api/shopping/items";

/**
 * Substitui a "navegação manual pelo menu" da tarefa de registro da rota: aqui a URL
 * `/shopping-list` é resolvida de verdade contra a árvore de rotas do app e o elemento casado é
 * montado, e a sidebar é renderizada pra provar que o link do grupo Produtividade existe e aponta
 * pra essa URL.
 */

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

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { email: "eu@example.com", user_metadata: { full_name: "Eu" } },
    loading: false,
  }),
}));

beforeEach(() => {
  vi.mocked(fetchShoppingCategories).mockResolvedValue([]);
  vi.mocked(fetchShoppingItems).mockResolvedValue([]);
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

describe("rota /shopping-list", () => {
  it("a URL resolve para uma rota registrada no app", () => {
    const matches = matchRoutes(appRoutes, "/shopping-list");
    expect(matches).not.toBeNull();
    const paths = matches!.map((m) => m.route.path);
    expect(paths).toContain("shopping-list");
    expect(paths).not.toContain("*");
  });

  it("o elemento casado com /shopping-list renderiza a página da Lista de Compras", async () => {
    const matches = matchRoutes(appRoutes, "/shopping-list")!;
    const element = matches[matches.length - 1].route.element;

    render(
      <MemoryRouter initialEntries={["/shopping-list"]}>
        <Suspense fallback={<p>carregando</p>}>{element}</Suspense>
      </MemoryRouter>
    );

    expect(
      await screen.findByRole("heading", { name: "Lista de Compras", level: 1 })
    ).toBeInTheDocument();
  });
});

describe("sidebar", () => {
  it("lista 'Lista de Compras' apontando para /shopping-list", () => {
    render(
      <MemoryRouter initialEntries={["/shopping-list"]}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </MemoryRouter>
    );

    const link = screen.getByRole("link", { name: "Lista de Compras" });
    expect(link).toHaveAttribute("href", "/shopping-list");
  });

  it("o grupo Produtividade fica ativo quando a URL é /shopping-list", () => {
    render(
      <MemoryRouter initialEntries={["/shopping-list"]}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </MemoryRouter>
    );

    expect(
      screen.getByRole("link", { name: "Lista de Compras" })
    ).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Projetos" })).toHaveAttribute(
      "data-active",
      "false"
    );
  });
});
