import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TaskMentionsSection } from "@/pages/admin/tasks/TaskMentionsSection";
import { fetchNotesMentioningTask } from "@/api/notes/notes";
import { fetchTasksMentioningTask } from "@/api/tasks";
import type { Note } from "@/types/notes";
import type { Task } from "@/types/tasks";

/**
 * Feature 106 — a seção "Referenciada em" dentro do formulário de tarefa.
 *
 * O teste que sustenta a feature inteira é o do **candidato dentro de bloco de código**: o `ilike`
 * da consulta é prefiltro, e quem decide o que é menção de verdade é `mentionsTaskId` (103). Sem
 * essa assertiva a seção parece funcionar e está errada — um exemplo de sintaxe numa nota entraria
 * como menção real.
 */

vi.mock("@/api/notes/notes", () => ({
  fetchNotesMentioningTask: vi.fn(async () => []),
}));

vi.mock("@/api/tasks", () => ({
  fetchTasksMentioningTask: vi.fn(async () => []),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const TASK_ID = "11111111-2222-4333-8444-555555555555";

const mockedFetchNotes = vi.mocked(fetchNotesMentioningTask);
const mockedFetchTasks = vi.mocked(fetchTasksMentioningTask);

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    project_id: null,
    folder_id: null,
    title: "Reforma da sala",
    content: `Depende de [subir painel](orbyva-task:${TASK_ID})`,
    kind: "markdown",
    canvas_data: null,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-2",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Preparar a reunião",
    description: `Depende de [subir painel](orbyva-task:${TASK_ID})`,
    status: "todo",
    tag_ids: [],
    due_date: null,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    ...overrides,
  };
}

function renderSection(taskId = TASK_ID) {
  return render(
    <MemoryRouter>
      <TaskMentionsSection taskId={taskId} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  toastMock.mockClear();
  mockedFetchNotes.mockReset().mockResolvedValue([]);
  mockedFetchTasks.mockReset().mockResolvedValue([]);
});

describe("TaskMentionsSection", () => {
  it("lista sob 'Notas' a nota que cita a tarefa, linkando para /notes/<id>", async () => {
    mockedFetchNotes.mockResolvedValue([makeNote()]);

    renderSection();

    expect(await screen.findByText("Referenciada em")).toBeInTheDocument();
    expect(screen.getByText("Notas")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Reforma da sala" });
    expect(link).toHaveAttribute("href", "/notes/note-1");
    // Só a fonte que tem menção ganha rótulo: sem tarefa citando, nada de "Tarefas" vazio.
    expect(screen.queryByText("Tarefas")).not.toBeInTheDocument();
    // As duas consultas são pelo **id** da tarefa.
    expect(mockedFetchNotes).toHaveBeenCalledWith(TASK_ID);
    expect(mockedFetchTasks).toHaveBeenCalledWith(TASK_ID);
  });

  it("lista sob 'Tarefas' a tarefa que cita, linkando para /tasks?task=<id> (destino da 102)", async () => {
    mockedFetchTasks.mockResolvedValue([makeTask()]);

    renderSection();

    const link = await screen.findByRole("link", { name: "Preparar a reunião" });
    expect(link).toHaveAttribute("href", "/tasks?task=task-2");
    expect(screen.getByText("Tarefas")).toBeInTheDocument();
    expect(screen.queryByText("Notas")).not.toBeInTheDocument();
  });

  it("mostra as duas listas rotuladas quando há menção nas duas fontes", async () => {
    mockedFetchNotes.mockResolvedValue([makeNote()]);
    mockedFetchTasks.mockResolvedValue([makeTask()]);

    renderSection();

    expect(await screen.findByText("Notas")).toBeInTheDocument();
    expect(screen.getByText("Tarefas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reforma da sala" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Preparar a reunião" })).toBeInTheDocument();
  });

  /**
   * O teste que prova que o prefiltro não decide sozinho. Os dois candidatos abaixo voltam do
   * `ilike` (contêm a string); só um é menção de verdade.
   */
  it("descarta o candidato cuja marca está dentro de bloco de código", async () => {
    mockedFetchNotes.mockResolvedValue([
      makeNote(),
      makeNote({
        id: "note-2",
        title: "Como referenciar tarefas",
        content: `Escreva assim:\n\n\`\`\`\n[rótulo](orbyva-task:${TASK_ID})\n\`\`\`\n`,
      }),
    ]);
    mockedFetchTasks.mockResolvedValue([
      makeTask({
        id: "task-3",
        title: "Documentar a sintaxe",
        description: `exemplo: \`[rótulo](orbyva-task:${TASK_ID})\``,
      }),
    ]);

    renderSection();

    expect(
      await screen.findByRole("link", { name: "Reforma da sala" })
    ).toBeInTheDocument();
    // Marca em bloco cercado (nota) e em código inline (tarefa): exemplo de sintaxe não é menção.
    expect(
      screen.queryByRole("link", { name: "Como referenciar tarefas" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Documentar a sintaxe" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Tarefas")).not.toBeInTheDocument();
  });

  it("nota que cita a tarefa duas vezes aparece uma vez só", async () => {
    mockedFetchNotes.mockResolvedValue([
      makeNote({
        content: `Ver [painel](orbyva-task:${TASK_ID}) e de novo [painel](orbyva-task:${TASK_ID}).`,
      }),
    ]);

    renderSection();

    expect(
      await screen.findAllByRole("link", { name: "Reforma da sala" })
    ).toHaveLength(1);
  });

  it("não renderiza nada quando ninguém cita a tarefa — nem título, nem texto de vazio", async () => {
    const { container } = renderSection();

    await waitFor(() => expect(mockedFetchNotes).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByText("Referenciada em")).not.toBeInTheDocument();
    expect(screen.queryByText(/nenhuma menção/i)).not.toBeInTheDocument();
  });

  it("não pisca a seção enquanto carrega", async () => {
    let resolver: (notes: Note[]) => void = () => {};
    mockedFetchNotes.mockImplementation(
      () => new Promise<Note[]>((resolve) => (resolver = resolve))
    );

    const { container } = renderSection();

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Referenciada em")).not.toBeInTheDocument();

    resolver([makeNote()]);
    expect(await screen.findByText("Referenciada em")).toBeInTheDocument();
  });

  it("erro na carga mostra toast e não quebra o formulário", async () => {
    mockedFetchTasks.mockRejectedValue(new Error("deu ruim no banco"));

    const { container } = renderSection();

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(toastMock.mock.calls[0][0]).toMatchObject({
      variant: "destructive",
      title: "Erro ao carregar as menções",
    });
    // Sem seção meio montada: a falha some da tela em vez de deixar um bloco quebrado no meio do
    // formulário.
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * A diferença em relação ao `BacklinksPanel` das notas, que resolve por título e quebra no
   * rename. Aqui a chave é o id: renomear a tarefa não derruba menção nenhuma.
   */
  it("renomear a tarefa não derruba as menções", async () => {
    mockedFetchNotes.mockResolvedValue([makeNote()]);
    const task = makeTask({ id: TASK_ID, title: "Subir painel" });

    function Wrapper({ current }: { current: Task }) {
      return (
        <MemoryRouter>
          <h1>{current.title}</h1>
          <TaskMentionsSection taskId={current.id} />
        </MemoryRouter>
      );
    }

    const { rerender } = render(<Wrapper current={task} />);
    expect(
      await screen.findByRole("link", { name: "Reforma da sala" })
    ).toBeInTheDocument();
    const chamadasAntes = mockedFetchNotes.mock.calls.length;

    rerender(<Wrapper current={{ ...task, title: "Subir o painel de controle" }} />);

    expect(screen.getByRole("heading", { name: "Subir o painel de controle" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Reforma da sala" })
    ).toBeInTheDocument();
    // Nem recarregou (o id não mudou), nem o título entrou na consulta em momento nenhum.
    expect(mockedFetchNotes.mock.calls.length).toBe(chamadasAntes);
    for (const [arg] of mockedFetchNotes.mock.calls) expect(arg).toBe(TASK_ID);
    for (const [arg] of mockedFetchTasks.mock.calls) expect(arg).toBe(TASK_ID);
  });
});
