import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TaskList from "@/pages/admin/tasks/TaskList";
import {
  fetchDependencies,
  fetchExternalLinksForTasks,
  fetchProjects,
  fetchTags,
  fetchTasks,
} from "@/api/tasks";
import { fetchNotesLinkedToMany } from "@/api/notes/noteLinks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Project, Task } from "@/types/tasks";
import type { Note } from "@/types/notes";

/**
 * Feature 255 — o ícone de notas na linha, visto da Lista inteira e sem navegador:
 *
 * - as notas de **todas** as tarefas vêm de uma consulta em lote no `load()`, não de uma por linha;
 * - o ícone aparece só em quem tem nota, e com uma nota só ele já é o link para ela;
 * - falha na consulta cai para "sem ícone" em vez de derrubar a lista.
 */

vi.setConfig({ testTimeout: 20_000 });

// O guia do módulo depende do `AuthProvider` e não tem nada a ver com o que este teste afirma.
vi.mock("@/components/ModuleGuide", () => ({
  ModuleGuide: () => null,
  ModuleGuideButton: () => null,
}));

vi.mock("@/api/tasks", () => ({
  fetchTasksMentioningTask: vi.fn(async () => []),
  fetchTasks: vi.fn(),
  fetchProjects: vi.fn(),
  fetchTags: vi.fn(),
  fetchDependencies: vi.fn(),
  fetchExternalLinksForTask: vi.fn(async () => []),
  fetchExternalLinksForTasks: vi.fn(),
  saveExternalLinksForTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  deleteTasks: vi.fn(),
  createTag: vi.fn(),
  fetchEntriesForTask: vi.fn().mockResolvedValue([]),
  updateTimeEntry: vi.fn(),
  deleteTimeEntry: vi.fn(),
}));

vi.mock("@/api/tasks/iconAssets", () => ({
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/api/notes/notes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/notes/notes")>()),
  fetchNotesMentioningTask: vi.fn(async () => []),
}));

// Só a consulta em lote é dublada; o resto do módulo de vínculos continua real.
vi.mock("@/api/notes/noteLinks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/notes/noteLinks")>()),
  fetchNotesLinkedToMany: vi.fn(),
  fetchNotesLinkedTo: vi.fn(async () => []),
}));

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn(),
  createRecurringApi: vi.fn(),
}));

vi.mock("@/hooks/useDimensions", () => ({
  useDimensions: () => ({ dimensions: [], loading: false, error: null, refetch: vi.fn() }),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const mockedFetchNotes = vi.mocked(fetchNotesLinkedToMany);

const PROJECT: Project = { id: "project-1", name: "Projeto X", status: "active", tag_ids: [] };

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Tarefa existente",
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

async function renderLoaded(tasks: Task[]) {
  vi.mocked(fetchTasks).mockResolvedValue(tasks);
  vi.mocked(fetchProjects).mockResolvedValue([PROJECT]);
  vi.mocked(fetchTags).mockResolvedValue([]);
  vi.mocked(fetchDependencies).mockResolvedValue([]);
  vi.mocked(fetchRecurringTransactions).mockResolvedValue([]);
  vi.mocked(fetchExternalLinksForTasks).mockResolvedValue({});
  render(
    <MemoryRouter>
      <TaskList />
    </MemoryRouter>
  );
  await screen.findAllByRole("button", { name: "Nova tarefa" });
}

beforeEach(() => {
  toastMock.mockReset();
  mockedFetchNotes.mockReset();
  mockedFetchNotes.mockResolvedValue({});
});

describe("TaskList — ícone de notas na linha (feature 255)", () => {
  it("busca as notas de todas as tarefas numa consulta só e mostra o ícone só em quem tem nota", async () => {
    mockedFetchNotes.mockResolvedValue({
      "task-1": [makeNote({ id: "note-1", title: "Proposta da Celcoin" })],
    });
    await renderLoaded([
      makeTask({ id: "task-1", title: "Novo fornecedor" }),
      makeTask({ id: "task-2", title: "Sem nota nenhuma" }),
    ]);

    // Uma chamada só, com os dois ids — não uma por linha.
    expect(mockedFetchNotes).toHaveBeenCalledTimes(1);
    expect(mockedFetchNotes).toHaveBeenCalledWith("task", ["task-1", "task-2"]);

    // Com uma nota só, o ícone já é o link para ela.
    expect(await screen.findByRole("link", { name: "Abrir nota: Proposta da Celcoin" })).toHaveAttribute(
      "href",
      "/notes/note-1"
    );
    // A tarefa sem nota não ganha ícone — nem link, nem gatilho de lista.
    expect(screen.getByText("Sem nota nenhuma")).toBeInTheDocument();
    expect(screen.queryAllByRole("link", { name: /^Abrir nota:/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^Notas desta tarefa/ })).not.toBeInTheDocument();
  });

  it("com mais de uma nota, o ícone da linha expande a lista das notas daquela tarefa", async () => {
    const user = userEvent.setup({ delay: null });
    mockedFetchNotes.mockResolvedValue({
      "task-1": [
        makeNote({ id: "note-1", title: "Proposta da Celcoin" }),
        makeNote({ id: "note-2", title: "Checklist de homologação" }),
      ],
    });
    await renderLoaded([makeTask({ id: "task-1", title: "Novo fornecedor" })]);

    const trigger = await screen.findByRole("button", { name: "Notas desta tarefa — 2" });
    await user.click(trigger);

    expect(await screen.findByRole("link", { name: /Proposta da Celcoin/ })).toHaveAttribute(
      "href",
      "/notes/note-1"
    );
    expect(screen.getByRole("link", { name: /Checklist de homologação/ })).toHaveAttribute(
      "href",
      "/notes/note-2"
    );
  });

  it("falha na consulta em lote cai para 'sem ícone', sem derrubar a lista de tarefas", async () => {
    mockedFetchNotes.mockRejectedValue(new Error("row level security"));
    await renderLoaded([makeTask({ id: "task-1", title: "Continua aparecendo" })]);

    expect(await screen.findByText("Continua aparecendo")).toBeInTheDocument();
    expect(screen.queryAllByRole("link", { name: /^Abrir nota:/ })).toHaveLength(0);
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Erro", variant: "destructive" })
    );
  });
});
