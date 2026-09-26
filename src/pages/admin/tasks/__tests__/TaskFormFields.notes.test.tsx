import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { TaskFormFields } from "@/pages/admin/tasks/TaskFormFields";
import { emptyTask } from "@/domain/tasks/taskDraft";
import { createNote } from "@/api/notes/notes";
import { addNoteLink, fetchNotesLinkedTo } from "@/api/notes/noteLinks";
import type { Note } from "@/types/notes";
import type {
  SubtaskDraft,
  Task,
  TaskCreateRequest,
  TaskExternalLinkDraft,
} from "@/types/tasks";

/**
 * Feature 084 — os atalhos de nota/canvas **dentro** do painel de tarefa (feature 080), e não só no
 * componente isolado: é aqui que se prova que abrir o formulário de uma tarefa existente mostra os
 * dois botões prontos para usar, e que o de uma tarefa nova os mostra desabilitados.
 */

vi.mock("@/api/tasks", () => ({
  // Feature 085: os donos do formulário/lista carregam e gravam os links externos.
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
  fetchEntriesForTask: vi.fn().mockResolvedValue([]),
  updateTimeEntry: vi.fn(),
  deleteTimeEntry: vi.fn(),
}));

vi.mock("@/api/recurring", () => ({
  createRecurringApi: vi.fn(),
}));

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
    kind: "markdown",
    canvas_data: null,
    ...overrides,
  };
}

/** Espelha o call site: `form` é estado de quem monta o painel. */
function Harness({ editing = null }: { editing?: Task | null }) {
  const [form, setForm] = useState<TaskCreateRequest>(
    editing
      ? { ...emptyTask(editing.project_id), title: editing.title }
      : emptyTask()
  );
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([]);
  const [externalLinks, setExternalLinks] = useState<TaskExternalLinkDraft[]>([]);

  return (
    <MemoryRouter initialEntries={["/tasks"]}>
      <TaskFormFields
        form={form}
        setForm={setForm}
        editing={editing}
        tasks={[]}
        tags={[]}
        onCreateTag={vi.fn()}
        recurrings={[]}
        onRecurringCreated={vi.fn()}
        dimensions={[]}
        subtasks={subtasks}
        onAddSubtask={(title) => setSubtasks((prev) => [...prev, { title }])}
        externalLinks={externalLinks}
        onExternalLinksChange={setExternalLinks}
        onRemoveSubtask={(_subtask, index) =>
          setSubtasks((prev) => prev.filter((_, i) => i !== index))
        }
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchNotesLinkedTo).mockResolvedValue([]);
  vi.mocked(createNote).mockResolvedValue(makeNote());
  vi.mocked(addNoteLink).mockResolvedValue({
    id: "link-1",
    note_id: "note-1",
    entity_type: "task",
    entity_id: "task-1",
    label: "Escrever a pauta",
  });
});

describe("TaskFormFields — atalhos de nota e canvas (feature 084)", () => {
  it("abrir o formulário de uma tarefa existente mostra os dois botões prontos para usar", async () => {
    render(<Harness editing={makeTask()} />);

    expect(screen.getByRole("button", { name: "Criar nota desta tarefa" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Criar canvas desta tarefa" })).not.toBeDisabled();
    expect(screen.queryByText("Salve a tarefa antes")).not.toBeInTheDocument();
    // Uma consulta por abertura do formulário, não uma por botão.
    await waitFor(() => expect(fetchNotesLinkedTo).toHaveBeenCalledTimes(1));
    expect(fetchNotesLinkedTo).toHaveBeenCalledWith("task", "task-1");
  });

  it("abrir o formulário de uma tarefa nova mostra os dois desabilitados, com a dica de salvar", () => {
    render(<Harness />);

    expect(screen.getByRole("button", { name: "Criar nota desta tarefa" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Criar canvas desta tarefa" })).toBeDisabled();
    expect(screen.getByText("Salve a tarefa antes")).toBeInTheDocument();
    expect(fetchNotesLinkedTo).not.toHaveBeenCalled();
  });

  it("os atalhos ficam na fileira só-ícone, sem rótulo próprio e sem ganhar linha nova", async () => {
    render(<Harness editing={makeTask()} />);
    await waitFor(() => expect(fetchNotesLinkedTo).toHaveBeenCalled());

    const noteButton = screen.getByRole("button", { name: "Criar nota desta tarefa" });
    // Sem texto visível: o rótulo vive no `aria-label`/tooltip, como o resto da fileira.
    expect(noteButton).toHaveTextContent("");
    // Mesma fileira do ícone da tarefa (Bloco 4 do painel denso).
    const row = noteButton.closest("div.flex.flex-wrap");
    expect(row).not.toBeNull();
    expect(row?.querySelector('[aria-label="Definir ícone"]')).not.toBeNull();
  });

  it("no painel, criar a nota da tarefa manda o projeto da tarefa junto", async () => {
    const user = userEvent.setup();
    render(<Harness editing={makeTask({ project_id: "project-9" })} />);

    await user.click(screen.getByRole("button", { name: "Criar nota desta tarefa" }));
    await user.click(await screen.findByRole("button", { name: "Criar nova nota" }));

    expect(createNote).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "project-9", title: "Escrever a pauta" })
    );
  });
});
