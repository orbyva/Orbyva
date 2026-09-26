import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import NoteDetail from "@/pages/admin/notes/NoteDetail";
import { fetchNote, fetchNotes, updateNote } from "@/api/notes/notes";
import { fetchNoteFolders } from "@/api/notes/folders";
import { fetchProjects } from "@/api/tasks/projects";
import { fetchTags } from "@/api/tasks/tags";
import type { Note, NoteFolder } from "@/types/notes";

vi.mock("@/api/notes/notes", () => ({
  fetchNotes: vi.fn(),
  fetchNote: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}));

vi.mock("@/api/notes/folders", () => ({
  fetchNoteFolders: vi.fn(),
  createNoteFolder: vi.fn(),
  updateNoteFolder: vi.fn(),
  deleteNoteFolder: vi.fn(),
}));

vi.mock("@/api/tasks/tags", () => ({
  fetchTags: vi.fn(),
  createTag: vi.fn(),
}));

vi.mock("@/api/tasks/projects", () => ({
  fetchProjects: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

vi.mock("@/hooks/useBreadcrumbTitle", () => ({
  useBreadcrumbTitle: () => {},
}));

const note: Note = {
  id: "n1",
  title: "Pauta",
  content: "corpo",
  project_id: null,
  folder_id: "f1",
  kind: "markdown",
  canvas_data: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const folders: NoteFolder[] = [
  {
    id: "f1",
    name: "Obra",
    parent_id: null,
    project_id: null,
    tag_id: null,
    user_id: "u1",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "f2",
    name: "Arquivo",
    parent_id: null,
    project_id: null,
    tag_id: null,
    user_id: "u1",
    created_at: "2026-01-01T00:00:00Z",
  },
];

function LocationLabel() {
  const location = useLocation();
  return (
    <output aria-label="caminho">{`${location.pathname}${location.search}`}</output>
  );
}

function renderDetail(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <LocationLabel />
      <Routes>
        <Route path="/notes/:id" element={<NoteDetail />} />
        <Route path="/notes" element={<p>Lista</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(fetchNote).mockResolvedValue(note);
  vi.mocked(fetchNotes).mockResolvedValue([note]);
  vi.mocked(fetchNoteFolders).mockResolvedValue(folders);
  vi.mocked(fetchProjects).mockResolvedValue([]);
  vi.mocked(fetchTags).mockResolvedValue([]);
  vi.mocked(updateNote).mockResolvedValue();
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  } else {
    window.matchMedia = ((query: string) => ({
      matches: true,
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

describe("NoteDetail — pastas ao lado da nota", () => {
  it("mostra a árvore de pastas e o editor juntos", async () => {
    renderDetail("/notes/n1");
    expect(
      await screen.findByRole("navigation", { name: "Pastas" })
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("Título")).toHaveValue("Pauta");
  });

  it("clicar uma pasta troca o filtro e volta à lista — sem alterar folder_id da nota", async () => {
    const user = userEvent.setup();
    renderDetail("/notes/n1");
    await screen.findByLabelText("Título");

    await user.click(
      within(screen.getByRole("navigation", { name: "Pastas" })).getByRole(
        "button",
        { name: "Pasta Arquivo" }
      )
    );

    await waitFor(() => {
      expect(screen.getByLabelText("caminho")).toHaveTextContent(
        "/notes?folder=f2"
      );
    });
    expect(screen.getByText("Lista")).toBeInTheDocument();
    expect(updateNote).not.toHaveBeenCalled();
  });

  it("Todas as notas leva de volta à lista com o ?folder= atual", async () => {
    renderDetail("/notes/n1?folder=f1");
    const back = await screen.findByRole("link", { name: /Todas as notas/i });
    expect(back).toHaveAttribute("href", "/notes?folder=f1");
  });
});
