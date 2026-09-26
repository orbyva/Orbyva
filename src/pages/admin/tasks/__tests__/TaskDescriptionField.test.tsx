import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { TaskDescriptionField } from "@/pages/admin/tasks/TaskDescriptionField";
import { fetchNotes } from "@/api/notes/notes";
import type { Note } from "@/types/notes";

vi.mock("@/api/notes/notes", () => ({
  fetchNotes: vi.fn(),
  createNote: vi.fn(),
}));

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    title: "Pauta",
    content: "",
    project_id: null,
    kind: "markdown",
    canvas_data: null,
    ...overrides,
  };
}

function LocationFromRoute() {
  const { pathname } = useLocation();
  return <div data-testid="location">{pathname}</div>;
}

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <MemoryRouter>
      <TaskDescriptionField value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(fetchNotes).mockResolvedValue([]);
});

describe("TaskDescriptionField", () => {
  it("escrever no editor propaga o valor pra cima", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("textbox", { name: "Descrição" }));
    await user.keyboard("comprar cimento");
    await waitFor(() =>
      expect(screen.getByTestId("value")).toHaveTextContent("comprar cimento")
    );
  });

  it("a barra de formatação e o botão Inserir ficam na aba Escrever", () => {
    render(<Harness />);
    expect(screen.getByRole("toolbar", { name: "Formatação" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inserir" })).toBeInTheDocument();
  });

  it("a aba Visualizar renderiza o Markdown — título, lista, negrito, link e tabela", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          "# Reforma",
          "",
          "- item **importante**",
          "- [site](https://exemplo.com)",
          "",
          "| a | b |",
          "| - | - |",
          "| 1 | 2 |",
        ].join("\n")}
      />
    );

    await user.click(screen.getByRole("tab", { name: "Visualizar" }));

    expect(screen.getByRole("heading", { name: /Reforma/ })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("importante").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "site" })).toHaveAttribute(
      "href",
      "https://exemplo.com"
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("[[wiki-link]] na visualização aponta para a nota correspondente", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchNotes).mockResolvedValue([makeNote({ id: "n-pauta", title: "Pauta" })]);
    render(<Harness initial="ver [[Pauta]]" />);

    await user.click(screen.getByRole("tab", { name: "Visualizar" }));
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Pauta" })).toHaveAttribute("href", "/notes/n-pauta")
    );
  });

  it("clicar no wiki-link da Visualizar abre a nota, mesmo dentro de um Dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchNotes).mockResolvedValue([makeNote({ id: "n-pauta", title: "Pauta" })]);
    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <Routes>
          <Route
            path="/tasks"
            element={
              <Dialog open>
                <DialogContent aria-describedby={undefined}>
                  <DialogTitle>Editar tarefa</DialogTitle>
                  <TaskDescriptionField value="ver [[Pauta]]" onChange={() => {}} />
                </DialogContent>
              </Dialog>
            }
          />
          <Route path="/notes/:id" element={<LocationFromRoute />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("tab", { name: "Visualizar" }));
    await user.click(await screen.findByRole("link", { name: "Pauta" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/notes/n-pauta");
  });

  it("aba Visualizar sem conteúdo mostra o aviso, não um preview vazio", async () => {
    const user = userEvent.setup();
    render(<Harness initial="   " />);

    await user.click(screen.getByRole("tab", { name: "Visualizar" }));
    expect(screen.getByText("Nada para visualizar ainda.")).toBeInTheDocument();
  });

  it("HTML cru NÃO é interpretado — sem rehype-raw, por decisão de segurança da 055", async () => {
    const user = userEvent.setup();
    render(<Harness initial={'<img src=x onerror="alert(1)"> <b>bold?</b>'} />);

    await user.click(screen.getByRole("tab", { name: "Visualizar" }));
    const preview = within(screen.getByRole("tabpanel"));
    expect(preview.queryByRole("img")).toBeNull();
    expect(screen.getByRole("tabpanel").querySelector("b")).toBeNull();
    expect(preview.getByText(/bold\?/)).toBeInTheDocument();
  });

  it("a barra some na aba Visualizar", async () => {
    const user = userEvent.setup();
    render(<Harness initial="# Reforma" />);
    expect(screen.getByRole("toolbar", { name: "Formatação" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Visualizar" }));
    expect(screen.queryByRole("toolbar", { name: "Formatação" })).not.toBeInTheDocument();
  });
});
