import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ProjectNotesSection } from "@/pages/admin/notes/ProjectNotesSection";
import type { Note, NoteDraft } from "@/types/notes";

/**
 * O vínculo no sentido projeto → nota (feature 055): a página do projeto lista só as notas daquele
 * projeto e cria uma nova já vinculada. Backend falso em memória, como no fluxo da lista.
 */

const { store } = vi.hoisted(() => ({
  store: { notes: [] as Note[], seq: 0 },
}));

vi.mock("@/api/notes/notes", () => ({
  fetchNotes: vi.fn(async ({ projectId }: { projectId?: string | null } = {}) =>
    store.notes
      .filter((n) => (projectId ? n.project_id === projectId : true))
      .map((n) => ({ ...n }))
  ),
  createNote: vi.fn(async (draft: NoteDraft) => {
    const created: Note = { id: `n${++store.seq}`, ...draft, title: "Sem título" };
    store.notes.push(created);
    return { ...created };
  }),
  fetchNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

function LocationProbe() {
  return <output data-testid="url">{useLocation().pathname}</output>;
}

function renderSection(projectId = "p1") {
  return render(
    <MemoryRouter initialEntries={["/tasks/projects/p1"]}>
      <Routes>
        <Route
          path="/tasks/projects/:id"
          element={<ProjectNotesSection projectId={projectId} />}
        />
        <Route path="/notes/:id" element={<p>editor da nota</p>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  store.notes = [];
  store.seq = 0;
});

describe("Notas do projeto (dentro da página do projeto)", () => {
  it("lista só as notas daquele projeto", async () => {
    store.notes = [
      { id: "n1", title: "Pauta da obra", content: "- pedreiro", project_id: "p1" },
      { id: "n2", title: "Do outro projeto", content: "", project_id: "p2" },
      { id: "n3", title: "Nota solta", content: "", project_id: null },
    ];
    renderSection();

    expect(await screen.findByText("Pauta da obra")).toBeInTheDocument();
    // O excerpt vem sem a marcação de lista.
    expect(screen.getByText("pedreiro")).toBeInTheDocument();
    expect(screen.queryByText("Do outro projeto")).toBeNull();
    expect(screen.queryByText("Nota solta")).toBeNull();
  });

  it("cada nota leva ao editor dela", async () => {
    store.notes = [
      { id: "n1", title: "Pauta da obra", content: "", project_id: "p1" },
    ];
    renderSection();

    expect(await screen.findByRole("link", { name: /Pauta da obra/ })).toHaveAttribute(
      "href",
      "/notes/n1"
    );
  });

  it("projeto sem nota mostra o estado vazio com a ação de criar", async () => {
    renderSection();
    expect(await screen.findByText("Nenhuma nota neste projeto")).toBeInTheDocument();
  });

  it("criar pela página do projeto já nasce vinculada e abre o editor", async () => {
    const user = userEvent.setup();
    renderSection();

    await screen.findByText("Nenhuma nota neste projeto");
    await user.click(screen.getAllByRole("button", { name: "Nova nota" })[0]);

    await waitFor(() => expect(store.notes).toHaveLength(1));
    // O vínculo já vem no create, não num update depois.
    expect(store.notes[0].project_id).toBe("p1");
    expect(await screen.findByText("editor da nota")).toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("/notes/n1");
  });
});
