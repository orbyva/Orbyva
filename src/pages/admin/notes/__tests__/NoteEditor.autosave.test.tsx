import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { NoteEditor } from "@/pages/admin/notes/NoteEditor";
import type { Note } from "@/types/notes";

/**
 * O indicador de salvamento do editor de nota.
 *
 * Nota não tem botão "Salvar" — grava sozinha, com debounce. Isso troca um clique por uma promessa, e
 * o indicador é a única coisa que sustenta a promessa: sem ele o usuário fecha a aba sem saber se o
 * que escreveu chegou ao banco. Por isso as assertivas aqui são sobre o que a **tela diz**, e a mais
 * importante é a do erro — a que prova que o texto digitado não se perde quando a gravação falha.
 */

const updateNote = vi.fn(async () => ({}) as Note);
vi.mock("@/api/notes/notes", () => ({
  updateNote: (...args: unknown[]) => updateNote(...(args as [])),
}));

const NOTE: Note = {
  id: "n1",
  title: "Nota",
  content: "corpo da nota",
  project_id: null,
  kind: "markdown",
  canvas_data: null,
  created_at: "2026-09-01T12:00:00.000Z",
  updated_at: "2026-09-01T12:00:00.000Z",
};

/**
 * `debounceMs` curto nos casos que querem ver a gravação acontecer; **enorme** no caso do atalho,
 * onde o ponto é justamente que a gravação saiu sem o timer ter virado. Um debounce que nunca dispara
 * sozinho é o que impede o teste do `Ctrl+S` de passar por acidente.
 */
function renderEditor(debounceMs: number) {
  return render(
    <MemoryRouter initialEntries={["/notes/n1"]}>
      <NoteEditor note={NOTE} projects={[]} notes={[NOTE]} debounceMs={debounceMs} />
    </MemoryRouter>
  );
}

function titulo(): HTMLInputElement {
  return screen.getByLabelText("Título") as HTMLInputElement;
}

/** A linha de estado do autosave, que é um `role="status"`. */
function indicador(): HTMLElement {
  return screen.getByRole("status");
}

beforeEach(() => {
  updateNote.mockReset();
  updateNote.mockResolvedValue({} as Note);
});

describe("NoteEditor — indicador de salvamento", () => {
  it("digitar mostra 'Salvando…' antes mesmo de o debounce virar", async () => {
    const user = userEvent.setup();
    renderEditor(100_000);

    await user.type(titulo(), "x");

    expect(indicador()).toHaveTextContent("Salvando…");
    // O debounce é longo de propósito: o "Salvando…" apareceu na tecla, não na gravação.
    expect(updateNote).not.toHaveBeenCalled();
    // E enquanto não gravou não há horário nenhum — o controle da assertiva do caso seguinte.
    expect(indicador().textContent).not.toMatch(/\d{2}:\d{2}/);
  });

  it("gravou: o indicador passa a dizer a que horas foi", async () => {
    const user = userEvent.setup();
    renderEditor(5);

    await user.type(titulo(), "x");

    await waitFor(() => expect(indicador()).toHaveTextContent(/^Salvo às \d{2}:\d{2}$/));
    expect(updateNote).toHaveBeenCalled();
  });

  it("falhou: diz 'Falha ao salvar' e **mantém o texto digitado**", async () => {
    const user = userEvent.setup();
    updateNote.mockRejectedValue(new Error("sem rede"));
    renderEditor(5);

    await user.type(titulo(), " revisada");

    await waitFor(() => expect(indicador()).toHaveTextContent("Falha ao salvar"));
    // O que o usuário escreveu continua na tela: falha de rede não pode comer texto.
    expect(titulo().value).toBe("Nota revisada");
  });

  it("'Tentar novamente' refaz a chamada e a tela volta para 'Salvo'", async () => {
    const user = userEvent.setup();
    updateNote.mockRejectedValue(new Error("sem rede"));
    renderEditor(5);

    await user.type(titulo(), "x");
    await waitFor(() => expect(indicador()).toHaveTextContent("Falha ao salvar"));
    const tentativasAteAqui = updateNote.mock.calls.length;

    updateNote.mockResolvedValue({} as Note);
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(updateNote.mock.calls.length).toBeGreaterThan(tentativasAteAqui);
    await waitFor(() => expect(indicador()).toHaveTextContent(/^Salvo às \d{2}:\d{2}$/));
  });

  it("sem erro, não existe botão 'Tentar novamente' na tela", async () => {
    const user = userEvent.setup();
    renderEditor(5);

    await user.type(titulo(), "x");
    await waitFor(() => expect(indicador()).toHaveTextContent(/^Salvo às/));

    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
  });
});

describe("NoteEditor — Ctrl/Cmd+S", () => {
  it("grava na hora, sem esperar o debounce", async () => {
    const user = userEvent.setup();
    renderEditor(100_000);

    await user.type(titulo(), "x");
    expect(updateNote).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(indicador()).toHaveTextContent(/^Salvo às \d{2}:\d{2}$/));
  });

  it("Cmd+S vale igual, e o atalho do navegador é cancelado", async () => {
    const user = userEvent.setup();
    renderEditor(100_000);
    await user.type(titulo(), "x");

    // `cancelable` para que o `preventDefault` do handler tenha o que cancelar.
    const evento = new KeyboardEvent("keydown", {
      key: "s",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(evento);

    expect(evento.defaultPrevented).toBe(true);
    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(1));
  });

  it("tecla 's' sozinha não grava nada", async () => {
    const user = userEvent.setup();
    renderEditor(100_000);
    await user.type(titulo(), "x");

    fireEvent.keyDown(window, { key: "s" });

    expect(updateNote).not.toHaveBeenCalled();
  });
});
