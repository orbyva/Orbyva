import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { email: "eu@example.com", user_metadata: { full_name: "Eu" } },
    loading: false,
  }),
}));

beforeEach(() => {
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

const SIDEBAR_HREFS = [
  "/home",
  "/finance/dashboard",
  "/finance/transactions",
  "/finance/recurring",
  "/finance/budget",
  "/finance/categories",
  "/tasks",
  "/tasks/projects",
  "/notes",
  "/shopping-list",
  "/habits",
  "/life/health",
  "/goals",
  "/places",
  "/travel",
  "/car",
  "/movies",
  "/books",
  "/music",
  "/links",
] as const;

describe("ordem da sidebar", () => {
  it("lista grupos e submódulos na ordem operacionais → vida → conteúdo", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </MemoryRouter>
    );

    // Só o grupo ativo (Início) começa aberto; os outros só montam os links depois do expand.
    for (const group of ["Finanças", "Produtividade", "Vida", "Conteúdo"]) {
      await user.click(screen.getByRole("button", { name: group }));
    }

    const hrefs = Array.from(document.querySelectorAll("a[href]"))
      .map((a) => a.getAttribute("href"))
      .filter((href): href is string => href != null)
      .filter((href) => (SIDEBAR_HREFS as readonly string[]).includes(href));

    expect(hrefs).toEqual([...SIDEBAR_HREFS]);
  });
});
