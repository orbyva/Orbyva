import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoteFolderTree } from "@/pages/admin/notes/NoteFolderTree";
import type { Note, NoteFolder } from "@/types/notes";
import type { Project, Tag } from "@/types/tasks";

function folder(over: Partial<NoteFolder> & Pick<NoteFolder, "id" | "name">): NoteFolder {
  return { parent_id: null, project_id: null, tag_id: null, ...over };
}

function note(over: Partial<Note> & Pick<Note, "id" | "title">): Note {
  return {
    content: "",
    project_id: null,
    folder_id: null,
    kind: "markdown",
    canvas_data: null,
    ...over,
  };
}

const folders: NoteFolder[] = [
  folder({
    id: "f1",
    name: "Obra",
    project_id: "p1",
    tag_id: "t1",
  }),
  folder({ id: "f2", name: "Banheiro", parent_id: "f1" }),
];
const notes: Note[] = [
  note({ id: "n1", title: "Cimento", folder_id: "f1" }),
  note({ id: "n2", title: "Solta" }),
];
const projects: Project[] = [
  {
    id: "p1",
    name: "Obra da casa",
    status: "active",
    tag_ids: [],
  } as Project,
];
const tags: Tag[] = [{ id: "t1", name: "reforma", color: "#ef4444" }];

beforeEach(() => {
  localStorage.removeItem("orbyva_note_folder_collapsed_v1");
});

describe("NoteFolderTree", () => {
  it("mostra Todas, Sem pasta e a árvore com a contagem direta", () => {
    const onSelect = vi.fn();
    render(
      <NoteFolderTree
        folders={folders}
        notes={notes}
        projects={projects}
        tags={tags}
        selected={null}
        onSelect={onSelect}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByRole("navigation", { name: "Pastas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Todas/ })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /Sem pasta/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: "Pasta Obra" })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: "Pasta Banheiro" })).toHaveTextContent("0");
  });

  it("mostra o nome do projeto e da etiqueta, cada um com o próprio sinal", () => {
    render(
      <NoteFolderTree
        folders={folders}
        notes={notes}
        projects={projects}
        tags={tags}
        selected="f1"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByTitle("Projeto Obra da casa")).toHaveTextContent(
      "Obra da casa"
    );
    expect(screen.getByTitle("Etiqueta reforma")).toHaveTextContent("reforma");
  });

  it("clicar uma pasta seleciona só ela", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <NoteFolderTree
        folders={folders}
        notes={notes}
        projects={projects}
        tags={tags}
        selected={null}
        onSelect={onSelect}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: "Pasta Obra" }));
    expect(onSelect).toHaveBeenCalledWith("f1");
  });

  it("o diálogo de excluir avisa que as notas vão para Sem pasta", async () => {
    const user = userEvent.setup();
    render(
      <NoteFolderTree
        folders={folders}
        notes={notes}
        projects={projects}
        tags={tags}
        selected={null}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await user.hover(screen.getByRole("button", { name: "Pasta Obra" }));
    await user.click(screen.getByRole("button", { name: "Excluir pasta Obra" }));
    const dialog = screen.getByRole("alertdialog");
    expect(
      within(dialog).getByText(
        "As notas desta pasta vão para Sem pasta. Subpastas sobem um nível."
      )
    ).toBeInTheDocument();
  });

  it("soltar na pasta e em Sem pasta dispara onDropNote; Todas não é alvo", () => {
    const onDropNote = vi.fn();
    render(
      <NoteFolderTree
        folders={folders}
        notes={notes}
        projects={projects}
        tags={tags}
        selected={null}
        draggingNote
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onDropNote={onDropNote}
      />
    );
    fireEvent.drop(document.querySelector('[data-drop-zone="note-folder|f1"]')!);
    expect(onDropNote).toHaveBeenCalledWith("f1");
    fireEvent.drop(document.querySelector('[data-drop-zone="note-folder|inbox"]')!);
    expect(onDropNote).toHaveBeenCalledWith(null);
    expect(
      screen.getByRole("button", { name: /Todas/ }).closest("[data-drop-zone]")
    ).toBeNull();
  });

  it("recolhe e expande as subpastas pelo chevron", async () => {
    const user = userEvent.setup();
    render(
      <NoteFolderTree
        folders={folders}
        notes={notes}
        projects={projects}
        tags={tags}
        selected={null}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Pasta Banheiro" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Recolher Obra" }));
    expect(screen.queryByRole("button", { name: "Pasta Banheiro" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expandir Obra" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    await user.click(screen.getByRole("button", { name: "Expandir Obra" }));
    expect(screen.getByRole("button", { name: "Pasta Banheiro" })).toBeInTheDocument();
  });

  it("pasta aberta na URL expande os ancestrais recolhidos", () => {
    localStorage.setItem(
      "orbyva_note_folder_collapsed_v1",
      JSON.stringify(["f1"])
    );
    render(
      <NoteFolderTree
        folders={folders}
        notes={notes}
        projects={projects}
        tags={tags}
        selected="f2"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Pasta Banheiro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recolher Obra" })).toBeInTheDocument();
  });
});
