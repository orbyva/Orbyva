import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Notes from "@/pages/admin/notes/Notes";
import NoteDetail from "@/pages/admin/notes/NoteDetail";
import { normalizeNoteDraft } from "@/domain/notes/noteDraft";
import { reparentChildren } from "@/domain/notes/folders";
import type {
  Note,
  NoteDraft,
  NoteFolder,
  NoteFolderDraft,
  NoteFolderUpdateRequest,
  NoteUpdateRequest,
} from "@/types/notes";

/**
 * Fluxo das pastas (feature 099) contra um backend falso que imita reparent + `on delete set
 * null` de `note.folder_id`. Substitui a verificação no navegador.
 */

type NoteRow = Partial<Note> & Pick<Note, "id" | "title" | "content" | "project_id">;

const { store } = vi.hoisted(() => ({
  store: {
    notes: [] as NoteRow[],
    folders: [] as NoteFolder[],
    projects: [] as { id: string; name: string }[],
    tags: [] as { id: string; name: string; color: string }[],
    seq: 0,
    clock: 0,
  },
}));

function stamp(): string {
  store.clock += 1;
  return new Date(Date.UTC(2026, 8, 17, 12, store.clock)).toISOString();
}

vi.mock("@/components/ModuleGuide", () => ({
  ModuleGuide: () => null,
  ModuleGuideButton: () => null,
}));

vi.mock("@/api/notes/notes", () => ({
  fetchNotes: vi.fn(async () =>
    store.notes
      .map(
        (n): Note => ({
          kind: "markdown",
          canvas_data: null,
          folder_id: null,
          ...n,
        })
      )
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
  ),
  fetchNote: vi.fn(async (id: string) => {
    const found = store.notes.find((n) => n.id === id);
    return found
      ? ({ kind: "markdown", canvas_data: null, folder_id: null, ...found } as Note)
      : null;
  }),
  createNote: vi.fn(async (draft: NoteDraft) => {
    const at = stamp();
    const created: Note = {
      id: `n${++store.seq}`,
      ...normalizeNoteDraft(draft),
      created_at: at,
      updated_at: at,
    };
    store.notes.push(created);
    return { ...created };
  }),
  updateNote: vi.fn(async ({ id, ...fields }: NoteUpdateRequest) => {
    const target = store.notes.find((n) => n.id === id);
    if (!target) return;
    Object.assign(target, fields, { updated_at: stamp() });
  }),
  deleteNote: vi.fn(async (id: string) => {
    store.notes = store.notes.filter((n) => n.id !== id);
  }),
  fetchNotesMentioning: vi.fn(async () => []),
}));

vi.mock("@/api/notes/folders", () => ({
  fetchNoteFolders: vi.fn(async () => store.folders.map((f) => ({ ...f }))),
  createNoteFolder: vi.fn(async (draft: NoteFolderDraft) => {
    const created: NoteFolder = {
      id: `f${++store.seq}`,
      name: draft.name.trim(),
      parent_id: draft.parent_id,
      project_id: draft.project_id,
      tag_id: draft.tag_id,
    };
    store.folders.push(created);
    return { ...created };
  }),
  updateNoteFolder: vi.fn(async ({ id, ...fields }: NoteFolderUpdateRequest) => {
    const target = store.folders.find((f) => f.id === id);
    if (target) Object.assign(target, fields);
  }),
  deleteNoteFolder: vi.fn(async (id: string) => {
    const patch = reparentChildren(store.folders, id);
    store.folders = store.folders
      .filter((f) => f.id !== id)
      .map((f) =>
        Object.prototype.hasOwnProperty.call(patch, f.id)
          ? { ...f, parent_id: patch[f.id] }
          : f
      );
    for (const note of store.notes) {
      if (note.folder_id === id) note.folder_id = null;
    }
  }),
}));

vi.mock("@/api/notes/noteLinks", () => ({
  fetchLinksForNote: vi.fn(async () => []),
  fetchNotesLinkedTo: vi.fn(async () => []),
  addNoteLink: vi.fn(),
  removeNoteLink: vi.fn(),
  fetchNotesSharingEntity: vi.fn(async () => []),
}));

vi.mock("@/api/tasks/projects", () => ({
  fetchProjects: vi.fn(async () => store.projects.map((p) => ({ ...p }))),
}));

vi.mock("@/api/tasks/tags", () => ({
  fetchTags: vi.fn(async () => store.tags.map((t) => ({ ...t }))),
  createTag: vi.fn(async ({ name, color }: { name: string; color: string }) => {
    const tag = { id: `t${++store.seq}`, name, color };
    store.tags.push(tag);
    return tag;
  }),
}));

vi.mock("@/pages/admin/notes/ExcalidrawCanvas", () => ({
  default: () => <div data-testid="excalidraw" />,
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

function renderApp(url = "/notes") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/notes" element={<Notes />} />
        <Route path="/notes/:id" element={<NoteDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  store.notes = [];
  store.folders = [];
  store.projects = [{ id: "p1", name: "Obra da casa" }];
  store.tags = [];
  store.seq = 0;
  store.clock = 0;
});

describe("Notas — pastas", () => {
  it("cria pasta, cria nota dentro, e a nota nasce com folder_id e o projeto da pasta", async () => {
    const user = userEvent.setup();
    store.folders = [
      {
        id: "f1",
        name: "Obra",
        parent_id: null,
        project_id: "p1",
        tag_id: null,
      },
    ];
    renderApp("/notes?folder=f1");

    expect(await screen.findByRole("button", { name: "Pasta Obra" })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Nova nota" })[0]);

    await waitFor(() => expect(store.notes).toHaveLength(1));
    expect(store.notes[0].folder_id).toBe("f1");
    expect(store.notes[0].project_id).toBe("p1");
  });

  it("mover a nota para outra pasta não muda o project_id", async () => {
    const user = userEvent.setup();
    store.folders = [
      {
        id: "f1",
        name: "Obra",
        parent_id: null,
        project_id: "p1",
        tag_id: null,
      },
      {
        id: "f2",
        name: "Saúde",
        parent_id: null,
        project_id: null,
        tag_id: null,
      },
    ];
    store.notes = [
      {
        id: "n1",
        title: "Pauta",
        content: "cimento",
        project_id: "p1",
        folder_id: "f1",
        updated_at: stamp(),
      },
    ];
    renderApp("/notes/n1");

    expect(await screen.findByLabelText("Título")).toHaveValue("Pauta");
    const pasta = screen.getByLabelText("Pasta");
    await user.click(pasta);
    await user.click(await screen.findByRole("option", { name: "Saúde" }));

    await waitFor(() => expect(store.notes[0].folder_id).toBe("f2"));
    expect(store.notes[0].project_id).toBe("p1");
  });

  it("apagar a pasta manda a nota para Sem pasta", async () => {
    const user = userEvent.setup();
    store.folders = [
      {
        id: "f1",
        name: "Obra",
        parent_id: null,
        project_id: "p1",
        tag_id: null,
      },
    ];
    store.notes = [
      {
        id: "n1",
        title: "Pauta",
        content: "",
        project_id: "p1",
        folder_id: "f1",
        updated_at: stamp(),
      },
    ];
    renderApp("/notes");

    expect(await screen.findByRole("button", { name: "Pasta Obra" })).toBeInTheDocument();
    await user.hover(screen.getByRole("button", { name: "Pasta Obra" }));
    await user.click(screen.getByRole("button", { name: "Excluir pasta Obra" }));
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(store.folders).toHaveLength(0));
    expect(store.notes[0].folder_id).toBeNull();
    expect(store.notes[0].title).toBe("Pauta");
  });

  it("?folder= abre a lista já recortada, sem as notas das subpastas", async () => {
    store.folders = [
      {
        id: "f1",
        name: "Obra",
        parent_id: null,
        project_id: null,
        tag_id: null,
      },
      {
        id: "f2",
        name: "Banheiro",
        parent_id: "f1",
        project_id: null,
        tag_id: null,
      },
    ];
    store.notes = [
      {
        id: "n1",
        title: "Na obra",
        content: "",
        project_id: null,
        folder_id: "f1",
        updated_at: stamp(),
      },
      {
        id: "n2",
        title: "No banheiro",
        content: "",
        project_id: null,
        folder_id: "f2",
        updated_at: stamp(),
      },
      {
        id: "n3",
        title: "Solta",
        content: "",
        project_id: null,
        folder_id: null,
        updated_at: stamp(),
      },
    ];
    renderApp("/notes?folder=f1");

    expect(await screen.findByText("Na obra")).toBeInTheDocument();
    expect(screen.queryByText("No banheiro")).not.toBeInTheDocument();
    expect(screen.queryByText("Solta")).not.toBeInTheDocument();
  });

  it("visão Todas mostra o nome da pasta no card", async () => {
    store.folders = [
      {
        id: "f1",
        name: "Obra",
        parent_id: null,
        project_id: null,
        tag_id: null,
      },
    ];
    store.notes = [
      {
        id: "n1",
        title: "Pauta",
        content: "",
        project_id: null,
        folder_id: "f1",
        updated_at: stamp(),
      },
    ];
    renderApp("/notes");
    expect(await screen.findByText("Pauta")).toBeInTheDocument();
    expect(screen.getByText("Pauta").closest("article")).toHaveTextContent("Obra");
  });

  it("arrastar a nota para a pasta só troca folder_id, não o projeto", async () => {
    store.folders = [
      {
        id: "f1",
        name: "Obra",
        parent_id: null,
        project_id: "p1",
        tag_id: null,
      },
    ];
    store.notes = [
      {
        id: "n1",
        title: "Pauta",
        content: "",
        project_id: "p1",
        folder_id: null,
        updated_at: stamp(),
      },
    ];
    renderApp("/notes");
    expect(await screen.findByText("Pauta")).toBeInTheDocument();

    fireEvent.dragStart(screen.getByText("Pauta").closest("article")!);
    fireEvent.drop(document.querySelector('[data-drop-zone="note-folder|f1"]')!);

    await waitFor(() => expect(store.notes[0].folder_id).toBe("f1"));
    expect(store.notes[0].project_id).toBe("p1");
  });

  it("arrastar para Sem pasta tira a nota da pasta e preserva o projeto", async () => {
    store.folders = [
      {
        id: "f1",
        name: "Obra",
        parent_id: null,
        project_id: "p1",
        tag_id: null,
      },
    ];
    store.notes = [
      {
        id: "n1",
        title: "Pauta",
        content: "",
        project_id: "p1",
        folder_id: "f1",
        updated_at: stamp(),
      },
    ];
    renderApp("/notes");
    expect(await screen.findByText("Pauta")).toBeInTheDocument();

    fireEvent.dragStart(screen.getByText("Pauta").closest("article")!);
    fireEvent.drop(document.querySelector('[data-drop-zone="note-folder|inbox"]')!);

    await waitFor(() => expect(store.notes[0].folder_id).toBeNull());
    expect(store.notes[0].project_id).toBe("p1");
  });
});
