import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { TaskNotesButton } from "@/pages/admin/tasks/TaskNotesButton";
import type { Note } from "@/types/notes";

/**
 * Feature 255 — o ícone de notas na linha da tarefa. Sem Chrome: a navegação é observada por um
 * probe de rota dentro do `MemoryRouter`, como já faz o teste do `TaskNoteButtons` (feature 084).
 */

function makeNote(over: Partial<Note> & { id: string; title: string }): Note {
  return {
    content: "",
    project_id: null,
    folder_id: null,
    kind: "markdown",
    canvas_data: null,
    ...over,
  };
}

/** Onde a rota está agora — é assim que "foi direto para /notes/x" é afirmado sem navegador. */
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderButton(notes: Note[]) {
  return render(
    <MemoryRouter initialEntries={["/tasks"]}>
      <TaskNotesButton notes={notes} />
      <LocationProbe />
    </MemoryRouter>
  );
}

describe("TaskNotesButton — tarefa sem nota", () => {
  it("não renderiza ícone nenhum", () => {
    renderButton([]);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/tasks");
  });
});

describe("TaskNotesButton — uma nota só", () => {
  it("o próprio ícone é o link e vai direto para a nota, sem passo intermediário", async () => {
    const user = userEvent.setup();
    renderButton([makeNote({ id: "note-1", title: "Proposta da Celcoin" })]);

    const link = screen.getByRole("link", { name: "Abrir nota: Proposta da Celcoin" });
    expect(link).toHaveAttribute("href", "/notes/note-1");

    await user.click(link);

    expect(screen.getByTestId("location")).toHaveTextContent("/notes/note-1");
    // Nada expandiu no caminho: com uma nota só não existe lista para escolher.
    expect(screen.queryByText("Notas desta tarefa")).not.toBeInTheDocument();
  });
});

describe("TaskNotesButton — mais de uma nota", () => {
  it("o clique expande a lista e cada item leva à sua própria nota", async () => {
    const user = userEvent.setup();
    renderButton([
      makeNote({ id: "note-1", title: "Proposta da Celcoin" }),
      makeNote({ id: "note-2", title: "Checklist de homologação" }),
    ]);

    // O gatilho anuncia a contagem — o clique não é surpresa.
    const trigger = screen.getByRole("button", { name: "Notas desta tarefa — 2" });
    expect(trigger).toHaveTextContent("2");
    expect(screen.queryByText("Checklist de homologação")).not.toBeInTheDocument();

    await user.click(trigger);

    const primeira = await screen.findByRole("link", { name: /Proposta da Celcoin/ });
    const segunda = screen.getByRole("link", { name: /Checklist de homologação/ });
    expect(primeira).toHaveAttribute("href", "/notes/note-1");
    expect(segunda).toHaveAttribute("href", "/notes/note-2");

    await user.click(segunda);

    expect(screen.getByTestId("location")).toHaveTextContent("/notes/note-2");
  });

  it("mostra quando cada nota foi editada, para escolher a certa sem abrir as duas", async () => {
    const user = userEvent.setup();
    renderButton([
      makeNote({ id: "note-1", title: "Proposta", updated_at: "2026-10-01T12:00:00Z" }),
      makeNote({ id: "note-2", title: "Checklist", updated_at: "2026-09-20T12:00:00Z" }),
    ]);

    await user.click(screen.getByRole("button", { name: "Notas desta tarefa — 2" }));

    expect(await screen.findByText("Editada em 01/10/2026")).toBeInTheDocument();
    expect(screen.getByText("Editada em 20/09/2026")).toBeInTheDocument();
  });
});
