import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Projects from "@/pages/admin/tasks/Projects";
import { fetchProjects } from "@/api/tasks";

/**
 * Feature 055: as notas de projeto saíram para o módulo de Notas, e a UI parou de ler e escrever
 * `project.notes`. A coluna **continua no banco**, com o conteúdo original — é a rede de segurança
 * até o usuário confirmar a migração (o `drop column` é a última tarefa da 058).
 *
 * Por isso o teste alimenta a página com uma linha que **ainda tem** `notes` preenchido, como o
 * `select("*")` vai devolver de verdade: o que se prova aqui não é que o dado sumiu, é que a UI
 * ignora ele. Só o `npm run build` não provaria isso — tipo removido não impede o valor de chegar
 * em runtime.
 */

vi.mock("@/api/tasks", () => ({
  // Feature 085: os donos do formulário/lista carregam e gravam os links externos.
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchProjects: vi.fn(),
  fetchProjectEvents: vi.fn(async () => []),
  fetchTags: vi.fn(async () => []),
  fetchTasks: vi.fn(async () => []),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  createProjectEvent: vi.fn(),
  deleteProjectEvent: vi.fn(),
  createTag: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const NOTES_IN_DB = "anotação antiga que ficou na coluna project.notes";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchProjects).mockResolvedValue([
    {
      id: "p1",
      name: "Obra da casa",
      description: "reforma inteira",
      color: null,
      goal_id: null,
      status: "active",
      tag_ids: [],
      // A coluna continua existindo no banco e `select("*")` a traz — de propósito.
      notes: NOTES_IN_DB,
    } as never,
  ]);
});

function renderPage() {
  return render(
    <MemoryRouter>
      <Projects />
    </MemoryRouter>
  );
}

describe("Projetos — depois da migração das notas (feature 055)", () => {
  it("o card do projeto não mostra mais o conteúdo de project.notes", async () => {
    renderPage();
    await screen.findByText("Obra da casa");
    expect(screen.queryByText(NOTES_IN_DB)).toBeNull();
    // O resto do card continua igual — a remoção foi cirúrgica.
    expect(screen.getByText("reforma inteira")).toBeInTheDocument();
  });

  it("o formulário de projeto não tem mais o campo Notas", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      (await screen.findAllByRole("button", { name: "Novo projeto" }))[0]
    );

    // O dialog abriu…
    expect(
      await screen.findByRole("heading", { name: "Novo projeto" })
    ).toBeInTheDocument();
    // …e o campo Notas não está nele.
    expect(screen.queryByText("Notas")).toBeNull();
    expect(
      screen.queryByPlaceholderText("Contexto, decisões, links úteis…")
    ).toBeNull();
  });

  it("editar um projeto que ainda tem notes no banco também não expõe o campo", async () => {
    const user = userEvent.setup();
    renderPage();

    // O botão de editar é só um ícone, sem nome acessível: chega-se a ele pelo card.
    const card = (await screen.findByText("Obra da casa")).closest(
      "article"
    ) as HTMLElement;
    await user.click(within(card).getAllByRole("button")[0]);

    expect(
      await screen.findByRole("heading", { name: "Editar projeto" })
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Obra da casa")).toBeInTheDocument();
    // O conteúdo que ainda está na coluna não chega a nenhum campo do formulário.
    expect(screen.queryByDisplayValue(NOTES_IN_DB)).toBeNull();
    expect(screen.queryByText("Notas")).toBeNull();
  });
});
