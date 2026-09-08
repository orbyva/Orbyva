import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TaskList from "@/pages/admin/tasks/TaskList";
import { ActiveTimerProvider } from "@/hooks/useActiveTimer";
import { createTask } from "@/api/tasks";
import type { Project, Task, TaskTimeEntry } from "@/types/tasks";

/**
 * Feature 098 — o `+` de quick add na aba Lista de `/tasks`. Molde de `TaskList.sort.test.tsx`.
 * Prova por DOM (a skill `next` proíbe Chrome) que criar pelo `+` grava o payload de `emptyTask()`
 * com o título digitado, que a tarefa aparece na caixa "Sem prazo" depois do `load()`, que o
 * dialog completo nunca abre, e que o toast diz a verdade sobre onde a tarefa foi parar.
 */

const store: { tasks: Task[]; runningEntry: TaskTimeEntry | null } = {
  tasks: [],
  runningEntry: null,
};

vi.mock("@/api/tasks", () => ({
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchTasks: vi.fn(async () => store.tasks.map((t) => ({ ...t }))),
  fetchProjects: vi.fn(async () => [] as Project[]),
  fetchTags: vi.fn(async () => []),
  fetchDependencies: vi.fn(async () => []),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  deleteTasks: vi.fn(),
  deleteTaskSeries: vi.fn(),
  createTag: vi.fn(),
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
  updateTasksSortOrder: vi.fn(),
  fetchRunningEntry: vi.fn(async () => store.runningEntry),
  startTimer: vi.fn(),
  stopTimer: vi.fn(),
}));

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn(async () => []),
  createRecurringApi: vi.fn(),
}));

vi.mock("@/api/health/medications", () => ({
  endMedicationAndDeleteFutureDoses: vi.fn(),
  EndMedicationError: class extends Error {},
}));

vi.mock("@/hooks/useDimensions", () => ({
  useDimensions: () => ({ dimensions: [], loading: false, error: null, refetch: vi.fn() }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

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

async function renderList(tasks: Task[], awaitTitle: string) {
  store.tasks = tasks.map((t) => ({ ...t }));
  store.runningEntry = null;
  const utils = render(
    <MemoryRouter>
      <ActiveTimerProvider>
        <TaskList />
      </ActiveTimerProvider>
    </MemoryRouter>
  );
  await screen.findByText(awaitTitle);
  return utils;
}

/** Bloco (`div` com o `h3` da caixa de prazo + as linhas). */
function bucketSection(label: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: new RegExp(`^${label}`) });
  return heading.parentElement as HTMLElement;
}

function quickAddButton() {
  return screen.getByRole("button", { name: "Adicionar tarefa rápida" });
}

/** `createTask` que grava no "servidor" fake, pra tarefa aparecer no `load()` seguinte. */
function createTaskWritesToStore() {
  vi.mocked(createTask).mockImplementation(async (payload) => {
    const created = makeTask({ ...payload, id: `nova-${store.tasks.length + 1}` }) as Task;
    store.tasks.push(created);
    return created;
  });
}

describe("TaskList — quick add na aba Lista (feature 098)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 7, 20, 10, 0, 0));
    localStorage.clear();
    toastMock.mockReset();
    store.tasks = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  /**
   * O pedido literal: "deixar um + no canto superior direito". Na Lista isso é o fim da barra de
   * controles da aba (status → chips → "Ordenar por" → `+`), empurrado para a borda com `ml-auto`.
   */
  it("o `+` é o último controle da barra da aba Lista, empurrado para a direita", async () => {
    await renderList([makeTask()], "Tarefa existente");

    const strip = quickAddButton().parentElement as HTMLElement;
    expect(strip.className).toContain("ml-auto");

    const bar = strip.parentElement as HTMLElement;
    // É a mesma barra do seletor "Ordenar por"…
    expect(within(bar).getByRole("group", { name: "Ordenar por" })).toBeInTheDocument();
    // …e o quick add é o último elemento dela.
    expect(bar.lastElementChild).toBe(strip);
  });

  it("criar pelo `+` grava o payload de emptyTask() + título e não abre o dialog completo", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    createTaskWritesToStore();
    await renderList([makeTask()], "Tarefa existente");

    await user.click(quickAddButton());
    await user.keyboard("Comprar pão{Enter}");

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask).toHaveBeenCalledWith({
      project_id: null,
      parent_task_id: null,
      title: "Comprar pão",
      description: "",
      status: "todo",
      tag_ids: [],
      due_date: null,
      due_time: null,
      start_date: null,
      priority: null,
      recurrence_rule: null,
      linked_recurring_id: null,
      icon_key: null,
      icon_url: null,
      is_milestone: false,
      is_quick: false,
      is_medication: false,
      is_consultation: false,
      sort_order: 0,
    });

    // O caminho longo continua fechado: nenhum botão "Criar tarefa" (o do dialog) na tela.
    expect(screen.queryByText("Criar tarefa")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("depois do load() a tarefa aparece na caixa «Sem prazo», e o toast diz isso", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    createTaskWritesToStore();
    await renderList([makeTask({ due_date: "2026-08-20", title: "De hoje" })], "De hoje");

    await user.click(quickAddButton());
    await user.keyboard("Comprar pão{Enter}");

    expect(within(bucketSection("Sem prazo")).getByText("Comprar pão")).toBeInTheDocument();
    // A tarefa "De hoje" continua na caixa dela — o quick add não mexeu no resto da lista.
    expect(within(bucketSection("Hoje")).getByText("De hoje")).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Criada em «Sem prazo»" })
    );
  });

  it("dá pra anotar duas coisas seguidas sem reabrir a tira", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    createTaskWritesToStore();
    await renderList([makeTask()], "Tarefa existente");

    await user.click(quickAddButton());
    await user.keyboard("Comprar pão{Enter}");
    await user.keyboard("Comprar leite{Enter}");

    expect(createTask).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createTask).mock.calls[1][0]).toMatchObject({ title: "Comprar leite" });
    const semPrazo = bucketSection("Sem prazo");
    expect(within(semPrazo).getByText("Comprar pão")).toBeInTheDocument();
    expect(within(semPrazo).getByText("Comprar leite")).toBeInTheDocument();
  });

  it("com o chip «Hoje» ligado, o toast avisa que os filtros escondem a tarefa", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    createTaskWritesToStore();
    await renderList([makeTask({ due_date: "2026-08-20", title: "De hoje" })], "De hoje");

    await user.click(screen.getByRole("button", { name: "Hoje" }));
    await user.click(quickAddButton());
    await user.keyboard("Comprar pão{Enter}");

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Tarefa criada, mas os filtros ativos a escondem" })
    );
    // E ela realmente não está na tela — é exatamente o que o aviso existe para explicar.
    expect(screen.queryByText("Comprar pão")).toBeNull();
  });

  it("com um chip de prioridade ligado, o aviso é o mesmo (a tarefa nasce sem prioridade)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    createTaskWritesToStore();
    await renderList([makeTask({ priority: "high", title: "Urgente" })], "Urgente");

    await user.click(screen.getByRole("button", { name: "Alta" }));
    await user.click(quickAddButton());
    await user.keyboard("Comprar pão{Enter}");

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Tarefa criada, mas os filtros ativos a escondem" })
    );
  });

  it("falha do createTask: toast destrutivo e o título continua no campo", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(createTask).mockRejectedValue(new Error("sem rede"));
    await renderList([makeTask()], "Tarefa existente");

    await user.click(quickAddButton());
    await user.keyboard("Comprar pão{Enter}");

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Erro", variant: "destructive" })
    );
    const titleInput = screen.getByRole("textbox", { name: "Título da tarefa" });
    expect(titleInput).toHaveValue("Comprar pão");
    expect(titleInput).toHaveFocus();
  });
});
