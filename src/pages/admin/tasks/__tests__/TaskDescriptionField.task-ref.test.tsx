import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { TaskDescriptionField } from "@/pages/admin/tasks/TaskDescriptionField";
import { fetchNotes } from "@/api/notes/notes";
import { createTask, fetchTasks } from "@/api/tasks/tasks";
import type { Task } from "@/types/tasks";

/**
 * O `TASK->` de ponta a ponta no campo de Descrição (feature 104): digitar o gatilho, escolher no
 * popup e ver o que fica **no valor do campo** — que é o Markdown que vai para o banco.
 *
 * Substitui a conferência no navegador, proibida pela skill `next`: aqui roda o CodeMirror de
 * verdade, com o popup de verdade e o teclado de verdade.
 */

vi.mock("@/api/notes/notes", () => ({
  fetchNotes: vi.fn(),
  createNote: vi.fn(),
}));

vi.mock("@/api/tasks/tasks", () => ({
  fetchTasks: vi.fn(),
  createTask: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

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

function Harness({ projectId = null }: { projectId?: string | null }) {
  const [value, setValue] = useState("");
  return (
    <MemoryRouter>
      <TaskDescriptionField value={value} onChange={setValue} projectId={projectId} />
      <output data-testid="value">{value}</output>
    </MemoryRouter>
  );
}

/** O popup do CodeMirror é assíncrono (debounce de digitação) — daí o `waitFor` pelo elemento. */
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

/**
 * O CodeMirror ignora o `Enter` nos primeiros 75 ms de popup aberto (`interactionDelay`, para não
 * aceitar sugestão que a pessoa nem viu) — esperar faz parte de reproduzir o uso real.
 */
async function settleInteractionDelay() {
  await new Promise((resolve) => setTimeout(resolve, 150));
}

beforeEach(() => {
  toastMock.mockClear();
  vi.mocked(fetchNotes).mockResolvedValue([]);
  vi.mocked(fetchTasks).mockResolvedValue([makeTask()]);
  vi.mocked(createTask).mockReset();
});

describe("TaskDescriptionField — `TASK->` (104)", () => {
  it("digitar `TASK->` abre o popup com a opção de criar no topo", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("textbox", { name: "Descrição" }));
    await user.keyboard("TASK->revisao");

    const tooltip = await popup();
    expect(tooltip.textContent).toContain("Criar tarefa: revisao");
    // E a tarefa com acento aparece mesmo tendo sido buscada sem acento (`foldForSearch`).
    expect(tooltip.textContent).toContain("Revisão do contrato");
  });

  it("colado numa palavra (`fooTASK->`) o popup NÃO abre", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("textbox", { name: "Descrição" }));
    await user.keyboard("fooTASK->revisao");
    await settleInteractionDelay();

    expect(document.querySelector(".cm-tooltip-autocomplete")).toBeNull();
    expect(screen.getByTestId("value")).toHaveTextContent("fooTASK->revisao");
  });

  it("escolher uma tarefa existente grava a marca no valor do campo", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("textbox", { name: "Descrição" }));
    await user.keyboard("ver TASK->revisao");
    await popup();
    await settleInteractionDelay();
    // A primeira opção é "Criar tarefa"; a tarefa existente é a de baixo.
    await user.keyboard("{ArrowDown}{Enter}");

    await waitFor(() =>
      expect(screen.getByTestId("value")).toHaveTextContent(
        `ver [Revisão do contrato](orbyva-task:${UUID})`
      )
    );
    // Nada de `TASK->` sobrando no texto: o gatilho inteiro foi substituído.
    expect(screen.getByTestId("value").textContent).not.toContain("TASK->");
    expect(createTask).not.toHaveBeenCalled();
  });

  it("escolher `Criar tarefa: X` grava por createTask com o projeto da tarefa em edição", async () => {
    const user = userEvent.setup();
    let resolveCreate: (task: Task) => void = () => {};
    vi.mocked(createTask).mockImplementation(
      () => new Promise<Task>((resolve) => { resolveCreate = resolve; })
    );
    render(<Harness projectId="proj-7" />);

    await user.click(screen.getByRole("textbox", { name: "Descrição" }));
    await user.keyboard("TASK->painel de controle");
    await popup();
    await settleInteractionDelay();
    await user.keyboard("{Enter}");

    // Antes de a criação voltar, o rótulo já está no texto — simples, sem marca.
    await waitFor(() =>
      expect(screen.getByTestId("value")).toHaveTextContent("painel de controle")
    );
    expect(screen.getByTestId("value").textContent).toBe("painel de controle");
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: "painel de controle", project_id: "proj-7" })
    );

    resolveCreate(makeTask({ id: NOVA, title: "painel de controle", project_id: "proj-7" }));
    await waitFor(() =>
      expect(screen.getByTestId("value").textContent).toBe(
        `[painel de controle](orbyva-task:${NOVA})`
      )
    );
  });

  it("`createTask` falhando deixa o rótulo como texto simples e mostra o toast", async () => {
    const user = userEvent.setup();
    vi.mocked(createTask).mockRejectedValue(new Error("sem conexão"));
    render(<Harness />);

    await user.click(screen.getByRole("textbox", { name: "Descrição" }));
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
    // O texto digitado NÃO some.
    expect(screen.getByTestId("value").textContent).toBe("painel");
  });

  it("o placeholder anuncia o gatilho", async () => {
    render(<Harness />);
    await waitFor(() =>
      expect(document.querySelector(".cm-placeholder")?.textContent ?? "").toContain(
        "TASK->"
      )
    );
  });
});
