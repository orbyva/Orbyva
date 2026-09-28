import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { NoteEditor } from "@/pages/admin/notes/NoteEditor";
import { createTask, fetchTasks } from "@/api/tasks/tasks";
import type { Note } from "@/types/notes";
import type { Task } from "@/types/tasks";

/**
 * O `TASK->` dentro do editor de nota (feature 104). O que muda em relação ao campo de Descrição é
 * só uma coisa, e é a que este arquivo prova: o projeto herdado é o **da nota aberta** — inclusive
 * `null` quando ela não tem projeto, e o novo quando a pessoa troca o projeto antes de criar.
 */

const { updateNoteMock, toastMock } = vi.hoisted(() => ({
  updateNoteMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/api/notes/notes", () => ({ updateNote: updateNoteMock }));
vi.mock("@/api/tasks/tasks", () => ({
  fetchTasks: vi.fn(),
  createTask: vi.fn(),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));
// Painéis de vínculo são de outra feature e só fariam fetch aqui.
vi.mock("@/pages/admin/notes/NoteLinksPanel", () => ({ NoteLinksPanel: () => null }));
vi.mock("@/pages/admin/notes/BacklinksPanel", () => ({ BacklinksPanel: () => null }));

const UUID = "11111111-1111-4111-8111-111111111111";
const NOVA = "99999999-9999-4999-8999-999999999999";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: UUID,
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Revisão do contrato",
    status: "todo",
    tag_ids: [],
    due_date: null,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    ...overrides,
  };
}

function note(projectId: string | null): Note {
  return {
    id: "n1",
    title: "Reforma",
    content: "",
    project_id: projectId,
    // Pastas de notas (099): a coluna é nullable, "sem pasta" é a raiz.
    folder_id: null,
    kind: "markdown",
    canvas_data: null,
  };
}

function renderEditor(projectId: string | null) {
  return render(
    <MemoryRouter>
      <NoteEditor note={note(projectId)} projects={[]} notes={[]} debounceMs={10} />
    </MemoryRouter>
  );
}

/** O conteúdo da última gravação — é o documento real do CodeMirror chegando na API. */
function savedContent(): string {
  const calls = updateNoteMock.mock.calls;
  return (calls[calls.length - 1]?.[0] as { content: string }).content;
}

async function popup(): Promise<HTMLElement> {
  return waitFor(
    () => {
      const found = document.querySelector(".cm-tooltip-autocomplete");
      expect(found).not.toBeNull();
      return found as HTMLElement;
    },
    { timeout: 3000 }
  );
}

/** O CodeMirror ignora o `Enter` nos primeiros 75 ms de popup aberto (`interactionDelay`). */
async function settleInteractionDelay() {
  await new Promise((resolve) => setTimeout(resolve, 150));
}

beforeEach(() => {
  vi.clearAllMocks();
  updateNoteMock.mockResolvedValue(undefined);
  vi.mocked(fetchTasks).mockResolvedValue([makeTask()]);
});

describe("NoteEditor — `TASK->` (104)", () => {
  it("a tarefa criada herda o projeto DA NOTA", async () => {
    const user = userEvent.setup();
    vi.mocked(createTask).mockResolvedValue(
      makeTask({ id: NOVA, title: "painel de controle", project_id: "proj-obra" })
    );
    renderEditor("proj-obra");

    await user.click(screen.getByLabelText("Conteúdo"));
    await user.keyboard("TASK->painel de controle");
    await popup();
    await settleInteractionDelay();
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({ title: "painel de controle", project_id: "proj-obra" })
      )
    );
    // E a marca se forma no corpo da nota, que é o que vai para o banco.
    await waitFor(() =>
      expect(savedContent()).toBe(`[painel de controle](orbyva-task:${NOVA})`)
    );
  });

  it("nota SEM projeto cria a tarefa com `project_id` nulo", async () => {
    const user = userEvent.setup();
    vi.mocked(createTask).mockResolvedValue(makeTask({ id: NOVA, title: "solta" }));
    renderEditor(null);

    await user.click(screen.getByLabelText("Conteúdo"));
    await user.keyboard("TASK->solta");
    await popup();
    await settleInteractionDelay();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(createTask).toHaveBeenCalled());
    expect(vi.mocked(createTask).mock.calls[0][0].project_id).toBeNull();
  });

  it("vincular uma tarefa existente grava a marca no corpo da nota", async () => {
    const user = userEvent.setup();
    renderEditor(null);

    await user.click(screen.getByLabelText("Conteúdo"));
    await user.keyboard("ver TASK->revisao");
    await popup();
    await settleInteractionDelay();
    // A primeira opção é "Criar tarefa"; a tarefa existente é a de baixo.
    await user.keyboard("{ArrowDown}{Enter}");

    await waitFor(() =>
      expect(savedContent()).toBe(`ver [Revisão do contrato](orbyva-task:${UUID})`)
    );
    expect(createTask).not.toHaveBeenCalled();
  });

  it("`createTask` falhando deixa o rótulo como texto simples e mostra o toast", async () => {
    const user = userEvent.setup();
    vi.mocked(createTask).mockRejectedValue(new Error("sem conexão"));
    renderEditor(null);

    await user.click(screen.getByLabelText("Conteúdo"));
    await user.keyboard("TASK->painel");
    await popup();
    await settleInteractionDelay();
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        variant: "destructive",
        title: "Erro",
        description: "sem conexão",
      })
    );
    await waitFor(() => expect(savedContent()).toBe("painel"));
  });

  it("o placeholder do editor de nota anuncia o gatilho", async () => {
    renderEditor(null);
    await waitFor(() =>
      expect(document.querySelector(".cm-placeholder")?.textContent ?? "").toContain(
        "TASK->"
      )
    );
  });
});
