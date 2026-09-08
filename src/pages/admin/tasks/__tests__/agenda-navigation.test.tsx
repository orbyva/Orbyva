import { beforeEach, describe, expect, it, vi } from "vitest";
import { Suspense } from "react";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, matchRoutes } from "react-router-dom";
import { appRoutes } from "@/routes";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

/**
 * Feature 102 — o caminho até a Agenda, sem navegador.
 *
 * A página `/tasks/agenda` já existia desde a 016, mas a feature 023 tirou o item da sidebar e
 * deixou a rota sem link nenhum no app: era alcançável só digitando a URL. O que esta feature faz é
 * exatamente isso — devolver a porta —, então o que precisa de prova é a porta: o item existe no
 * grupo Produtividade, aponta para a URL certa, a URL casa com uma rota registrada de verdade (e
 * monta a página, não o 404) e o realce da sidebar distingue Agenda de Tarefas.
 *
 * O conteúdo da página (quais itens ela mostra) é assunto de `AgendaCalendar.test.tsx`.
 */

vi.mock("@/api/tasks", () => ({
  fetchTasks: vi.fn().mockResolvedValue([]),
  fetchProjects: vi.fn().mockResolvedValue([]),
  fetchProjectEvents: vi.fn().mockResolvedValue([]),
  fetchTags: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  createTag: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  updateTask: vi.fn(),
  deleteProjectEvent: vi.fn(),
}));

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/api/health/medications", () => ({
  fetchMedications: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/hooks/useDimensions", () => ({
  useDimensions: () => ({ dimensions: [], loading: false, error: null, refetch: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { email: "eu@example.com", user_metadata: { full_name: "Eu" } },
    loading: false,
  }),
}));

beforeEach(() => {
  localStorage.clear();
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

function renderSidebar(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </MemoryRouter>
  );
}

/** O `<li>` do grupo da sidebar — o gatilho e o submenu moram nele. */
function groupItem(title: string): HTMLElement {
  const label = screen.getByText(title);
  return label.closest("li") as HTMLElement;
}

describe("item 'Agenda' na sidebar", () => {
  it("existe dentro do grupo Produtividade e aponta para /tasks/agenda", () => {
    renderSidebar("/tasks/agenda");

    const produtividade = groupItem("Produtividade");
    const agenda = within(produtividade).getByRole("link", { name: "Agenda" });
    expect(agenda).toHaveAttribute("href", "/tasks/agenda");
  });

  it("fica entre 'Tarefas' e 'Projetos', a posição que a feature 016 usava", () => {
    renderSidebar("/tasks/agenda");

    const hrefs = within(groupItem("Produtividade"))
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/tasks",
      "/tasks/agenda",
      "/tasks/projects",
      "/notes",
      "/shopping-list",
    ]);
  });
});

describe("rota /tasks/agenda", () => {
  it("a URL resolve para uma rota registrada, não para o 404", () => {
    const matches = matchRoutes(appRoutes, "/tasks/agenda");
    expect(matches).not.toBeNull();
    const paths = matches!.map((m) => m.route.path);
    expect(paths).toContain("tasks");
    expect(paths).toContain("agenda");
    expect(paths).not.toContain("*");
  });

  it("o elemento casado monta a página de verdade (título 'Agenda', eyebrow 'Produtividade')", async () => {
    const matches = matchRoutes(appRoutes, "/tasks/agenda")!;
    const element = matches[matches.length - 1].route.element;

    render(
      <MemoryRouter initialEntries={["/tasks/agenda"]}>
        <Suspense fallback={<p>carregando</p>}>
          <Routes>
            <Route path="/tasks/agenda" element={element} />
          </Routes>
        </Suspense>
      </MemoryRouter>
    );

    expect(
      // O elemento da rota é `lazy()`: o `import()` do módulo da página passa do timeout padrão de
      // 1s do `findBy*` na primeira transformação do Vite.
      await screen.findByRole("heading", { name: "Agenda", level: 1 }, { timeout: 15000 })
    ).toBeInTheDocument();
    expect(screen.getByText("Produtividade")).toBeInTheDocument();
  });
});

describe("estado ativo — Agenda e Tarefas não acendem juntas", () => {
  /**
   * `isNavItemActive` compara `"/tasks"` por igualdade exata justamente por causa dos irmãos mais
   * específicos. Sem isso, abrir a Agenda deixaria dois itens realçados ao mesmo tempo e o realce
   * pararia de dizer onde se está — o motivo de a regra existir some se ninguém a testa.
   */
  it("em /tasks/agenda: 'Agenda' ativo, 'Tarefas' não", () => {
    renderSidebar("/tasks/agenda");

    expect(screen.getByRole("link", { name: "Agenda" })).toHaveAttribute(
      "data-active",
      "true"
    );
    expect(screen.getByRole("link", { name: "Tarefas" })).toHaveAttribute(
      "data-active",
      "false"
    );
  });

  it("em /tasks: 'Tarefas' ativo, 'Agenda' não", () => {
    renderSidebar("/tasks");

    expect(screen.getByRole("link", { name: "Tarefas" })).toHaveAttribute(
      "data-active",
      "true"
    );
    expect(screen.getByRole("link", { name: "Agenda" })).toHaveAttribute(
      "data-active",
      "false"
    );
  });
});
