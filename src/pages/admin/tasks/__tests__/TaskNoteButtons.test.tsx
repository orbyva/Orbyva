import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { TaskNoteButtons } from "@/pages/admin/tasks/TaskNoteButtons";
import { createNote, fetchNotes } from "@/api/notes/notes";
import { addNoteLink, fetchNotesLinkedTo } from "@/api/notes/noteLinks";
import type { Note } from "@/types/notes";
import type { Task } from "@/types/tasks";

/**
 * Feature 084 — o atalho tarefa → nota/canvas. Sem Chrome: a navegação é observada por um probe de
 * rota dentro do `MemoryRouter`, e a criação pelos mocks de `createNote`/`addNoteLink`.
 */

vi.mock("@/api/notes/notes", () => ({
  createNote: vi.fn(),
  fetchNotes: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/api/notes/noteLinks", () => ({
  addNoteLink: vi.fn(),
  fetchNotesLinkedTo: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: "project-1",
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Escrever a pauta",
    status: "todo",
    tag_ids: [],
    due_date: null,
    due_time: null,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    ...overrides,
  };
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    title: "Escrever a pauta",
    content: "",
    project_id: "project-1",
    folder_id: null,
    kind: "markdown",
    canvas_data: null,
    ...overrides,
  };
}

/** Onde a rota está agora — é assim que "navegou para /notes/x" é afirmado sem browser. */
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderButtons(task: Task | null) {
  return render(
    <MemoryRouter initialEntries={["/tasks"]}>
      <TaskNoteButtons task={task} />
      <LocationProbe />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchNotesLinkedTo).mockResolvedValue([]);
  vi.mocked(fetchNotes).mockResolvedValue([]);
  vi.mocked(createNote).mockResolvedValue(makeNote());
  vi.mocked(addNoteLink).mockResolvedValue({
    id: "link-1",
    note_id: "note-1",
    entity_type: "task",
    entity_id: "task-1",
    label: "Escrever a pauta",
  });
});

describe("TaskNoteButtons — sem nota vinculada, o clique abre o popover", () => {
  it("clicar em 'Criar nota' e depois em 'Criar nova nota' cria, vincula e navega", async () => {
    const user = userEvent.setup();
    renderButtons(makeTask());

    await user.click(screen.getByRole("button", { name: "Criar nota desta tarefa" }));
    await user.click(await screen.findByRole("button", { name: "Criar nova nota" }));

    expect(createNote).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Escrever a pauta",
        content: "",
        project_id: "project-1",
        kind: "markdown",
        canvas_data: null,
      })
    );
    expect(addNoteLink).toHaveBeenCalledWith({
      note_id: "note-1",
      entity_type: "task",
      entity_id: "task-1",
      label: "Escrever a pauta",
    });
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/notes/note-1")
    );
  });

  it("clicar em 'Criar canvas' cria com kind canvas e a cena vazia", async () => {
    const user = userEvent.setup();
    vi.mocked(createNote).mockResolvedValue(
      makeNote({ id: "note-2", kind: "canvas", canvas_data: { elements: [] } })
    );
    renderButtons(makeTask());

    await user.click(screen.getByRole("button", { name: "Criar canvas desta tarefa" }));
    await user.click(await screen.findByRole("button", { name: "Criar novo canvas" }));

    expect(createNote).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "canvas", canvas_data: { elements: [] } })
    );
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/notes/note-2")
    );
  });

  it("tarefa sem projeto cria nota solta (project_id null), sem inventar projeto", async () => {
    const user = userEvent.setup();
    renderButtons(makeTask({ project_id: null }));

    await user.click(screen.getByRole("button", { name: "Criar nota desta tarefa" }));
    await user.click(await screen.findByRole("button", { name: "Criar nova nota" }));

    expect(createNote).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: null })
    );
  });
});

describe("TaskNoteButtons — as notas já vinculadas", () => {
  it("carrega as notas da tarefa numa consulta só por montagem, não uma por botão", async () => {
    renderButtons(makeTask());

    await waitFor(() => expect(fetchNotesLinkedTo).toHaveBeenCalledTimes(1));
    expect(fetchNotesLinkedTo).toHaveBeenCalledWith("task", "task-1");
  });

  it("em modo criação (tarefa nula) não consulta vínculo nenhum", () => {
    renderButtons(null);

    expect(fetchNotesLinkedTo).not.toHaveBeenCalled();
  });

  it("com uma nota já vinculada, o clique não cria outra silenciosamente", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchNotesLinkedTo).mockResolvedValue([makeNote({ id: "n1", title: "Pauta" })]);
    renderButtons(makeTask());

    const button = await screen.findByRole("button", { name: "Notas desta tarefa — 1" });
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(button);

    expect(createNote).not.toHaveBeenCalled();
    // Em vez de criar em silêncio, mostra o que já existe e oferece criar mais uma.
    expect(await screen.findByRole("link", { name: "Pauta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar outra nota" })).toBeInTheDocument();
  });

  it("clique dado antes de a consulta voltar espera a lista em vez de decidir com ela vazia", async () => {
    const user = userEvent.setup();
    let release: (notes: Note[]) => void = () => {};
    vi.mocked(fetchNotesLinkedTo).mockReturnValue(
      new Promise<Note[]>((resolve) => {
        release = resolve;
      })
    );
    renderButtons(makeTask());

    // Clique no meio do carregamento: a lista ainda é desconhecida, não vazia.
    await user.click(screen.getByRole("button", { name: "Criar nota desta tarefa" }));
    expect(createNote).not.toHaveBeenCalled();

    release([makeNote({ id: "n1", title: "Pauta" })]);

    // Em vez de criar a segunda nota, o clique que esperou abre a lista do que já existe.
    expect(await screen.findByRole("button", { name: "Notas desta tarefa — 1" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(createNote).not.toHaveBeenCalled();
  });

  it("as contagens são por kind: canvas vinculado não muda o botão de nota", async () => {
    vi.mocked(fetchNotesLinkedTo).mockResolvedValue([
      makeNote({ id: "c1", title: "Diagrama", kind: "canvas", canvas_data: { elements: [] } }),
    ]);
    renderButtons(makeTask());

    expect(await screen.findByRole("button", { name: "Canvas desta tarefa — 1" })).toHaveAttribute(
      "aria-haspopup",
      "dialog"
    );
    expect(
      screen.getByRole("button", { name: "Criar nota desta tarefa" })
    ).toHaveAttribute("aria-haspopup", "dialog");
  });
});

describe("TaskNoteButtons — popover do 'já existe'", () => {
  it("lista as notas vinculadas com título e data de edição, mais o item de criar outra", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchNotesLinkedTo).mockResolvedValue([
      makeNote({ id: "n1", title: "Pauta da reunião", updated_at: "2026-08-19T10:00:00Z" }),
      makeNote({ id: "n2", title: "Rascunho" }),
    ]);
    renderButtons(makeTask());

    await user.click(await screen.findByRole("button", { name: "Notas desta tarefa — 2" }));

    const pauta = await screen.findByRole("link", { name: /Pauta da reunião/ });
    expect(pauta).toHaveAttribute("href", "/notes/n1");
    expect(pauta).toHaveTextContent("Editada em 19/08/2026");
    expect(screen.getByRole("link", { name: "Rascunho" })).toHaveAttribute("href", "/notes/n2");
    expect(screen.getByRole("button", { name: "Criar outra nota" })).toBeInTheDocument();
  });

  it("clicar numa nota existente navega para ela, sem criar nada", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchNotesLinkedTo).mockResolvedValue([makeNote({ id: "n1", title: "Pauta" })]);
    renderButtons(makeTask());

    await user.click(await screen.findByRole("button", { name: "Notas desta tarefa — 1" }));
    await user.click(await screen.findByRole("link", { name: "Pauta" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/notes/n1");
    expect(createNote).not.toHaveBeenCalled();
  });

  it("'Criar outra nota' cria a segunda nota vinculada à mesma tarefa e abre o editor", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchNotesLinkedTo).mockResolvedValue([makeNote({ id: "n1", title: "Pauta" })]);
    vi.mocked(createNote).mockResolvedValue(makeNote({ id: "n2", title: "Escrever a pauta" }));
    renderButtons(makeTask());

    await user.click(await screen.findByRole("button", { name: "Notas desta tarefa — 1" }));
    await user.click(await screen.findByRole("button", { name: "Criar outra nota" }));

    expect(createNote).toHaveBeenCalledTimes(1);
    expect(addNoteLink).toHaveBeenCalledWith(
      expect.objectContaining({ note_id: "n2", entity_type: "task", entity_id: "task-1" })
    );
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/notes/n2"));
  });

  it("no canvas o item do popover fala de canvas, não de nota", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchNotesLinkedTo).mockResolvedValue([
      makeNote({ id: "c1", title: "Diagrama", kind: "canvas", canvas_data: { elements: [] } }),
    ]);
    renderButtons(makeTask());

    await user.click(await screen.findByRole("button", { name: "Canvas desta tarefa — 1" }));

    expect(await screen.findByRole("button", { name: "Criar outro canvas" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar outra nota" })).not.toBeInTheDocument();
  });
});

describe("TaskNoteButtons — estado de carregamento", () => {
  it("enquanto cria, o botão fica desabilitado com o spinner — e o irmão também não cria", async () => {
    const user = userEvent.setup();
    let release: (note: Note) => void = () => {};
    vi.mocked(createNote).mockReturnValue(
      new Promise<Note>((resolve) => {
        release = resolve;
      })
    );
    renderButtons(makeTask());
    await waitFor(() => expect(fetchNotesLinkedTo).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Criar nota desta tarefa" }));
    await user.click(await screen.findByRole("button", { name: "Criar nova nota" }));

    const button = screen.getByRole("button", { name: "Criar nota desta tarefa" });
    expect(button).toBeDisabled();
    expect(button.querySelector(".animate-spin")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Criar canvas desta tarefa" })).toBeDisabled();

    release(makeNote());
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/notes/note-1")
    );
    expect(createNote).toHaveBeenCalledTimes(1);
  });
});

describe("TaskNoteButtons — quando a gravação falha", () => {
  it("erro em createNote vira toast destructive e não navega para lugar nenhum", async () => {
    const user = userEvent.setup();
    vi.mocked(createNote).mockRejectedValue(new Error("Não foi possível criar a nota."));
    renderButtons(makeTask());

    await user.click(screen.getByRole("button", { name: "Criar nota desta tarefa" }));
    await user.click(await screen.findByRole("button", { name: "Criar nova nota" }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive", title: "Erro" })
      )
    );
    expect(addNoteLink).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent("/tasks");
  });

  it("erro em createNote devolve o botão ao normal (sem spinner travado)", async () => {
    const user = userEvent.setup();
    vi.mocked(createNote).mockRejectedValue(new Error("row level security"));
    renderButtons(makeTask());

    await user.click(screen.getByRole("button", { name: "Criar nota desta tarefa" }));
    await user.click(await screen.findByRole("button", { name: "Criar nova nota" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Criar nota desta tarefa" })).not.toBeDisabled()
    );
  });

  it("erro só em addNoteLink navega assim mesmo e avisa que o vínculo não foi gravado", async () => {
    const user = userEvent.setup();
    vi.mocked(addNoteLink).mockRejectedValue(new Error("duplicate key"));
    renderButtons(makeTask());

    await user.click(screen.getByRole("button", { name: "Criar nota desta tarefa" }));
    await user.click(await screen.findByRole("button", { name: "Criar nova nota" }));

    // A nota criada não é apagada: perder o que o usuário mandou criar é pior que um vínculo
    // faltando, que dá para refazer à mão no editor.
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Vínculo não gravado" })
      )
    );
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/notes/note-1")
    );
  });
});

describe("TaskNoteButtons — modo criação (tarefa ainda não salva)", () => {
  it("os dois botões ficam desabilitados e a dica de salvar aparece", () => {
    renderButtons(null);

    expect(screen.getByRole("button", { name: "Criar nota desta tarefa" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Criar canvas desta tarefa" })).toBeDisabled();
    expect(screen.getByText("Salve a tarefa antes")).toBeInTheDocument();
  });

  it("com a tarefa salva, os botões ficam habilitados e a dica some", async () => {
    renderButtons(makeTask());

    expect(screen.getByRole("button", { name: "Criar canvas desta tarefa" })).not.toBeDisabled();
    expect(screen.queryByText("Salve a tarefa antes")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Criar nota desta tarefa" })).not.toBeDisabled()
    );
  });

  it("os botões não submetem o formulário em volta (type=button)", async () => {
    renderButtons(makeTask());
    await waitFor(() => expect(fetchNotesLinkedTo).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: "Criar nota desta tarefa" })).toHaveAttribute(
      "type",
      "button"
    );
    expect(screen.getByRole("button", { name: "Criar canvas desta tarefa" })).toHaveAttribute(
      "type",
      "button"
    );
  });
});

describe("TaskNoteButtons — vincular nota existente", () => {
  it("escolhe uma nota do catálogo, grava o vínculo e não cria outra", async () => {
    const user = userEvent.setup();
    const existing = makeNote({ id: "n-existente", title: "Pauta antiga" });
    vi.mocked(fetchNotes).mockResolvedValue([existing]);
    renderButtons(makeTask());

    await user.click(screen.getByRole("button", { name: "Criar nota desta tarefa" }));
    await user.click(await screen.findByRole("button", { name: "Pauta antiga" }));

    expect(createNote).not.toHaveBeenCalled();
    expect(addNoteLink).toHaveBeenCalledWith(
      expect.objectContaining({ note_id: "n-existente", entity_type: "task", entity_id: "task-1" })
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/tasks");
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Nota vinculada" })
    );
  });
});
