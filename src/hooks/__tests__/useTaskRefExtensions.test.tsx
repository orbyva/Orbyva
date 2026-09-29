import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CompletionContext } from "@codemirror/autocomplete";
import type { CompletionResult, CompletionSource } from "@codemirror/autocomplete";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdownSupport } from "@/components/codemirror/markdownLanguage";
import { createTask, fetchTasks } from "@/api/tasks/tasks";
import { useTaskRefExtensions } from "@/hooks/useTaskRefExtensions";
import type { Task } from "@/types/tasks";

/**
 * A tripa comum do `TASK->` (feature 104): quem carrega as tarefas, quem grava, com que projeto e
 * o que acontece quando a gravação falha. É aqui que "a tarefa herda o projeto do contexto" e "o
 * texto não some quando dá erro" ficam provados — os testes de tela (`TaskDescriptionField`,
 * `NoteEditor`) cobrem o caminho pelo editor de verdade.
 */

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

beforeEach(() => {
  toastMock.mockClear();
  vi.mocked(fetchTasks).mockResolvedValue([]);
  vi.mocked(createTask).mockReset();
});

async function renderExtensions(projectId: string | null = null) {
  const rendered = renderHook(() => useTaskRefExtensions(projectId), {
    wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
  });
  // Deixa o `fetchTasks` do efeito assentar dentro do `act`, senão a lista chega fora dele.
  await act(async () => {});
  return rendered;
}

/** Monta um editor com as extensões do hook e devolve o resultado do popup para `doc`. */
function completionFor(extensions: Extension[], doc: string): CompletionResult | null {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(doc.length),
    extensions: [markdownSupport, ...extensions],
  });
  const sources = state.languageDataAt<CompletionSource>("autocomplete", doc.length);
  const context = new CompletionContext(state, doc.length, false);
  for (const source of sources) {
    const result = source(context) as CompletionResult | null;
    if (result) return result;
  }
  return null;
}

describe("useTaskRefExtensions", () => {
  it("sugere as tarefas carregadas, com a opção de criar no topo", async () => {
    vi.mocked(fetchTasks).mockResolvedValue([makeTask()]);
    const { result } = await renderExtensions();

    await waitFor(() => {
      const completion = completionFor(result.current, "TASK->revisao");
      expect(completion?.options.map((o) => String(o.label))).toEqual([
        "Criar tarefa: revisao",
        "Revisão do contrato",
      ]);
    });
  });

  it("as extensões são criadas uma vez só, mesmo com a lista mudando embaixo", async () => {
    vi.mocked(fetchTasks).mockResolvedValue([makeTask()]);
    const { result, rerender } = await renderExtensions();
    const first = result.current;
    await waitFor(() =>
      expect(completionFor(result.current, "TASK->revisao")?.options).toHaveLength(2)
    );
    rerender();
    // Mesma identidade: reconfigurar o CodeMirror a cada render fecharia o popup no meio da escolha.
    expect(result.current).toBe(first);
  });

  it("criar herda o `project_id` do contexto e grava por `createTask`", async () => {
    vi.mocked(createTask).mockResolvedValue(makeTask({ id: "nova", title: "painel de controle" }));
    const { result } = await renderExtensions("proj-7");

    const view = mountWith(result.current, "nota: TASK->painel de controle");
    await chooseCreate(view);

    expect(createTask).toHaveBeenCalledWith({
      title: "painel de controle",
      project_id: "proj-7",
      parent_task_id: null,
      status: "todo",
      tag_ids: [],
      due_date: null,
      recurrence_rule: null,
      linked_recurring_id: null,
    });
    await waitFor(() =>
      expect(view.state.doc.toString()).toBe("nota: [painel de controle](orbyva-task:nova)")
    );
    view.destroy();
  });

  it("sem projeto no contexto, a tarefa nasce com `project_id` nulo", async () => {
    vi.mocked(createTask).mockResolvedValue(makeTask({ id: "nova" }));
    const { result } = await renderExtensions(null);

    const view = mountWith(result.current, "TASK->solta");
    await chooseCreate(view);

    expect(vi.mocked(createTask).mock.calls[0][0].project_id).toBeNull();
    view.destroy();
  });

  it("`createTask` falhando mostra toast e deixa o rótulo como texto simples", async () => {
    vi.mocked(createTask).mockRejectedValue(new Error("sem rede"));
    const { result } = await renderExtensions(null);

    const view = mountWith(result.current, "nota: TASK->painel");
    await chooseCreate(view);

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        variant: "destructive",
        title: "Erro",
        description: "sem rede",
      })
    );
    // O texto digitado NÃO some — fica como rótulo simples, sem virar marca.
    expect(view.state.doc.toString()).toBe("nota: painel");
    view.destroy();
  });
});

/** Editor de verdade com as extensões do hook, com o cursor no fim. */
function mountWith(extensions: Extension[], doc: string): EditorView {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(doc.length),
      extensions: [markdownSupport, ...extensions],
    }),
    parent: host,
  });
}

/** Aciona a opção "Criar tarefa: …" do popup sobre o documento atual. */
async function chooseCreate(view: EditorView): Promise<void> {
  const doc = view.state.doc.toString();
  const sources = view.state.languageDataAt<CompletionSource>("autocomplete", doc.length);
  let completion: CompletionResult | null = null;
  for (const source of sources) {
    completion = (source(
      new CompletionContext(view.state, doc.length, false)
    ) as CompletionResult | null) ?? completion;
    if (completion) break;
  }
  const apply = completion?.options[0].apply as (
    v: EditorView,
    c: unknown,
    from: number,
    to: number
  ) => void;
  await act(async () => {
    apply(view, completion?.options[0], completion?.from ?? 0, doc.length);
  });
}
