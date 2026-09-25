import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { NoteEditor } from "@/pages/admin/notes/NoteEditor";
import type { Note } from "@/types/notes";

/**
 * Os modos de visualização do editor de nota (feature 070): **Escrever | Dividir | Visualizar**,
 * com o modo na URL. Testado montando o editor de verdade — sem navegador, como manda a skill
 * `next`.
 */

const updateNote = vi.fn(async () => ({}) as Note);
vi.mock("@/api/notes/notes", () => ({
  updateNote: (...args: unknown[]) => updateNote(...(args as [])),
}));

const NOTE: Note = {
  id: "n1",
  title: "Nota",
  content: "# Titulo\n\ncorpo da nota",
  project_id: null,
  kind: "markdown",
  canvas_data: null,
  created_at: "2026-09-01T12:00:00.000Z",
  updated_at: "2026-09-01T12:00:00.000Z",
};

function renderEditor(initialEntry = "/notes/n1") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <NoteEditor note={NOTE} projects={[]} notes={[NOTE]} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  updateNote.mockClear();
});

describe("NoteEditor — modos de visualização", () => {
  it("a barra de ferramentas some no modo Visualizar e volta no Escrever", async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(screen.getByRole("toolbar", { name: "Formatação" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Visualizar" }));
    // Sem editor na tela, botão de formatação é botão que não formata nada.
    expect(screen.queryByRole("toolbar", { name: "Formatação" })).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Escrever" }));
    expect(screen.getByRole("toolbar", { name: "Formatação" })).toBeInTheDocument();
  });
});
