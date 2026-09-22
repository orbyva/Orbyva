import { beforeEach, describe, expect, it, vi } from "vitest";
import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, matchRoutes } from "react-router-dom";
import { appRoutes } from "@/routes";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { fetchNote, fetchNotes } from "@/api/notes/notes";
import { fetchProjects } from "@/api/tasks/projects";

/**
 * Substitui a "navegação manual pelo menu" da tarefa de registro das rotas: `/notes` e `/notes/:id`
 * são resolvidas de verdade contra a árvore de rotas do app e o elemento casado é montado, e a
 * sidebar é renderizada pra provar que o link do grupo Produtividade existe e aponta pra essa URL.
 */

vi.mock("@/api/notes/notes", () => ({
  fetchNotes: vi.fn(),
  fetchNote: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}));

vi.mock("@/api/tasks/projects", () => ({
  fetchProjects: vi.fn(),
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
  vi.mocked(fetchNotes).mockResolvedValue([]);
  vi.mocked(fetchNote).mockResolvedValue({
    id: "n1",
    title: "Pauta da reunião",
    content: "",
    project_id: null,
    kind: "markdown",
    canvas_data: null,
  });
  vi.mocked(fetchProjects).mockResolvedValue([]);
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

/**
 * Monta o elemento que a árvore de rotas do app casou com `url` — sob um `Route` com o mesmo
 * padrão, senão `useParams` volta vazio e a página de detalhe não teria `:id`.
 */
function renderMatched(url: string, pattern: string) {
  const matches = matchRoutes(appRoutes, url)!;
  const element = matches[matches.length - 1].route.element;
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Suspense fallback={<p>carregando</p>}>
        <Routes>
          <Route path={pattern} element={element} />
        </Routes>
      </Suspense>
    </MemoryRouter>
  );
}

describe("rotas /notes e /notes/:id", () => {
  it("as URLs resolvem para rotas registradas no app, não para o 404", () => {
    for (const [url, expected] of [
      ["/notes", undefined],
      ["/notes/n1", ":id"],
    ] as const) {
      const matches = matchRoutes(appRoutes, url);
      expect(matches).not.toBeNull();
      const paths = matches!.map((m) => m.route.path);
      expect(paths).toContain("notes");
      expect(paths).not.toContain("*");
      if (expected) expect(paths).toContain(expected);
    }
  });

  it("o elemento casado com /notes renderiza a página de Notas", async () => {
    renderMatched("/notes", "/notes");
    expect(
      await screen.findByRole("heading", { name: "Notas", level: 1 })
    ).toBeInTheDocument();
  });

  it("o elemento casado com /notes/:id monta o editor da nota", async () => {
    renderMatched("/notes/n1", "/notes/:id");
    // Timeout explícito: a rota é `lazy()`, então o `findBy` espera o chunk inteiro do editor de
    // notas ser importado e transformado. O padrão de 1 s ficou apertado quando a 104 somou os
    // módulos do `TASK->` ao grafo (medido isolado: 848 ms antes, ~1,04 s depois) e, sob a suíte
    // inteira em paralelo, estourava. A assertiva é a mesma; só a janela de espera mudou.
    expect(
      await screen.findByLabelText("Título", undefined, { timeout: 5000 })
    ).toHaveValue("Pauta da reunião");
    expect(screen.getByLabelText("Conteúdo")).toBeInTheDocument();
  });
});

describe("sidebar", () => {
  function renderSidebar(url: string) {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </MemoryRouter>
    );
  }

  it("lista 'Notas' apontando para /notes, dentro de Produtividade", () => {
    renderSidebar("/notes");
    expect(screen.getByRole("link", { name: "Notas" })).toHaveAttribute(
      "href",
      "/notes"
    );
    // Vizinhança: o item entrou no grupo que já tem Tarefas/Projetos.
    expect(screen.getByRole("link", { name: "Projetos" })).toBeInTheDocument();
  });

  it("o grupo Produtividade fica ativo quando a URL é /notes", () => {
    renderSidebar("/notes");
    expect(screen.getByRole("link", { name: "Notas" })).toHaveAttribute(
      "data-active",
      "true"
    );
    expect(screen.getByRole("link", { name: "Projetos" })).toHaveAttribute(
      "data-active",
      "false"
    );
  });
});
