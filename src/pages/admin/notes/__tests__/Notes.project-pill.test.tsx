import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Notes from "@/pages/admin/notes/Notes";
import type { Note } from "@/types/notes";
import type { Project } from "@/types/tasks";

/**
 * Feature 112 — o pill de projeto na lista de Notas. Chrome é proibido na esteira, então este
 * arquivo é a única prova de que (a) a bolinha sai na cor do projeto, (b) o pill leva ao projeto,
 * (c) ele não é mais filho do `<button>` que abre a nota (`<a>` dentro de `<button>` é markup
 * inválido: o clique some), (d) clicar no pill não abre o editor da nota e (e) o título continua
 * abrindo o editor.
 */

const { store } = vi.hoisted(() => ({
  store: {
    notes: [] as Note[],
    projects: [] as Project[],
  },
}));

// O guia do módulo depende do `AuthProvider` e não tem nada a ver com o que este teste afirma.
vi.mock("@/components/ModuleGuide", () => ({
  ModuleGuide: () => null,
  ModuleGuideButton: () => null,
}));

vi.mock("@/api/notes/notes", () => ({
  fetchNotes: vi.fn(async () => store.notes.map((n) => ({ ...n }))),
  createNote: vi.fn(),
  deleteNote: vi.fn(),
}));

vi.mock("@/api/notes/folders", () => ({
  fetchNoteFolders: vi.fn(async () => []),
  deleteNoteFolder: vi.fn(),
  updateNoteFolder: vi.fn(),
}));

vi.mock("@/api/tasks/tags", () => ({
  fetchTags: vi.fn(async () => []),
  createTag: vi.fn(),
}));

vi.mock("@/api/tasks/projects", () => ({
  fetchProjects: vi.fn(async () => store.projects.map((p) => ({ ...p }))),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

function makeNote(over: Partial<Note> = {}): Note {
  return {
    id: "n1",
    title: "Materiais",
    content: "cimento e areia",
    project_id: "p1",
    kind: "markdown",
    canvas_data: null,
    updated_at: new Date(Date.UTC(2026, 7, 16, 12, 0)).toISOString(),
    ...over,
  };
}

/** Mostra a rota atual: é o que prova para onde o clique levou — ou que ele não levou a lugar nenhum. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderList() {
  return render(
    <MemoryRouter initialEntries={["/notes"]}>
      <Routes>
        <Route
          path="/notes"
          element={
            <>
              <Notes />
              <LocationProbe />
            </>
          }
        />
        <Route path="/notes/:id" element={<LocationProbe />} />
        <Route path="/tasks/projects/:id" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  store.projects = [
    { id: "p1", name: "Obra da casa", color: "#ff6600", status: "active", tag_ids: [] },
  ];
  store.notes = [makeNote()];
});

describe("Notas — pill do projeto (feature 112)", () => {
  it("(a) a bolinha do pill tem a cor do projeto, não o cinza do badge antigo", async () => {
    const { container } = renderList();

    const pill = await screen.findByRole("link", { name: /Obra da casa/ });
    const dot = pill.querySelector<HTMLElement>('span[aria-hidden="true"]');
    expect(dot).not.toBeNull();
    expect(dot).toHaveStyle({ backgroundColor: "#ff6600" });
    // Blindagem contra "bolinha existe mas sem cor inline".
    expect(dot!.style.backgroundColor).not.toBe("");
    // O badge cinza de antes não sobreviveu em lugar nenhum do cartão.
    expect(container.querySelector(".bg-secondary")).toBeNull();
  });

  it("(b) o pill é um <a> para a página do projeto", async () => {
    renderList();

    const pill = await screen.findByRole("link", { name: /Obra da casa/ });
    expect(pill.tagName).toBe("A");
    expect(pill).toHaveAttribute("href", "/tasks/projects/p1");
  });

  it("(c) nenhum link dentro de botão — markup válido no cartão da nota", async () => {
    const { container } = renderList();

    await screen.findByRole("link", { name: /Obra da casa/ });
    expect(container.querySelector("button a")).toBeNull();
    // E o inverso também: o botão do título não virou filho do link.
    expect(container.querySelector("a button")).toBeNull();
  });

  it("(d) clicar no pill vai para o projeto e NÃO abre o editor da nota", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(await screen.findByRole("link", { name: /Obra da casa/ }));

    expect(screen.getByTestId("location")).toHaveTextContent("/tasks/projects/p1");
    expect(screen.getByTestId("location")).not.toHaveTextContent("/notes/n1");
  });

  it("(e) clicar no título abre o editor da nota", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(await screen.findByRole("button", { name: "Materiais" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/notes/n1");
  });

  it("nota sem projeto não ganha pill nenhum — nem cinza, nem 'Sem projeto'", async () => {
    store.notes = [makeNote({ id: "n2", title: "Solta", project_id: null })];
    renderList();

    await screen.findByRole("button", { name: "Solta" });
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText("Sem projeto")).toBeNull();
  });

  it("projeto apagado (fora de fetchProjects) não vira pill vazio nem link quebrado", async () => {
    store.notes = [makeNote({ project_id: "p-apagado" })];
    renderList();

    await screen.findByRole("button", { name: "Materiais" });
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("o resumo/data é alvo de clique, mas não um segundo tab stop da mesma nota", async () => {
    const user = userEvent.setup();
    const { container } = renderList();

    await screen.findByRole("button", { name: "Materiais" });
    const resumo = screen.getByText("cimento e areia").closest("div[aria-hidden='true']");
    expect(resumo).not.toBeNull();
    expect(resumo).toHaveAttribute("tabindex", "-1");
    // Só um elemento focável por nota (o título) — o botão de excluir mora fora do cartão de texto.
    const article = container.querySelector("article") as HTMLElement;
    expect(article.querySelectorAll("button:not([aria-hidden='true'])").length).toBeGreaterThan(0);

    await user.click(resumo as HTMLElement);
    expect(screen.getByTestId("location")).toHaveTextContent("/notes/n1");
  });
});
