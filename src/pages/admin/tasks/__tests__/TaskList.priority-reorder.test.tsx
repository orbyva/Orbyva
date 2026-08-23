import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TaskList from "@/pages/admin/tasks/TaskList";
import { ActiveTimerProvider } from "@/hooks/useActiveTimer";
import { updateTask, updateTasksSortOrder } from "@/api/tasks";
import type { Project, Task, TaskTimeEntry } from "@/types/tasks";

/**
 * Feature 082, segunda metade do pedido: "permita a reordenação para as prioridades da mesma faixa".
 *
 * **O que este arquivo prova e o que não prova.** O gesto do `@dnd-kit` (pointer events, medição de
 * retângulos, colisão) não roda em jsdom — `getBoundingClientRect` devolve tudo zerado e o
 * `PointerSensor` nem existe ali. Então o `@dnd-kit` é trocado por um duplo que **preserva a
 * fronteira**: o `DndContext` guarda o `onDragEnd` e o teste dispara a solta com o `active`/`over`
 * que a biblioteca entregaria. Tudo o que é nosso — resolver a faixa de destino, renumerar, gravar
 * em lote, o otimismo, a reversão e a persistência entre `load()`s — é código real, sem Chrome.
 * A matemática da reordenação em si tem cobertura pura em `src/domain/tasks/__tests__/priority.test.ts`.
 */

const { dnd } = vi.hoisted(() => ({
  dnd: { onDragEnd: null as ((event: unknown) => void) | null },
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd?: (event: unknown) => void;
  }) => {
    dnd.onDragEnd = onDragEnd ?? null;
    return <>{children}</>;
  },
  DragOverlay: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  KeyboardSensor: function KeyboardSensor() {},
  PointerSensor: function PointerSensor() {},
  closestCenter: () => [],
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  useSensor: () => ({}),
  useSensors: (...sensors: unknown[]) => sensors,
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  sortableKeyboardCoordinates: () => undefined,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: "vertical",
}));

/** "Servidor" em memória: as escritas gravam aqui e o `load()` seguinte relê daqui — é o que
 * permite provar que a ordem **persiste** e não é só um estado local bonito. */
const store: { tasks: Task[]; projects: Project[]; runningEntry: TaskTimeEntry | null } = {
  tasks: [],
  projects: [],
  runningEntry: null,
};

/** Segura a resposta da escrita em lote para observar o otimismo (a linha se move antes). */
const writeGate: { hold: boolean; release: (() => void) | null; fail: boolean } = {
  hold: false,
  release: null,
  fail: false,
};

vi.mock("@/api/tasks", () => ({
  fetchTasks: vi.fn(async () => store.tasks.map((t) => ({ ...t }))),
  fetchProjects: vi.fn(async () => store.projects.map((p) => ({ ...p }))),
  fetchTags: vi.fn(async () => []),
  fetchDependencies: vi.fn(async () => []),
  createTask: vi.fn(),
  updateTask: vi.fn(async (payload: { id: string } & Partial<Task>) => {
    const index = store.tasks.findIndex((t) => t.id === payload.id);
    if (index >= 0) store.tasks[index] = { ...store.tasks[index], ...payload };
    return undefined;
  }),
  updateTasksSortOrder: vi.fn(async (pairs: { id: string; sort_order: number }[]) => {
    if (writeGate.hold) {
      await new Promise<void>((resolve) => {
        writeGate.release = resolve;
      });
    }
    if (writeGate.fail) throw new Error("falha de rede");
    for (const pair of pairs) {
      const index = store.tasks.findIndex((t) => t.id === pair.id);
      if (index >= 0) store.tasks[index] = { ...store.tasks[index], sort_order: pair.sort_order };
    }
    return undefined;
  }),
  deleteTask: vi.fn(),
  deleteTasks: vi.fn(),
  deleteTaskSeries: vi.fn(),
  createTag: vi.fn(),
  uploadTaskIcon: vi.fn(),
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

const mockedSortOrder = vi.mocked(updateTasksSortOrder);
const mockedUpdateTask = vi.mocked(updateTask);

const PROJECT: Project = { id: "proj-1", name: "Orbyva", status: "active", tag_ids: [] };

function makeTask(overrides: Partial<Task> & { id: string; title: string }): Task {
  return {
    project_id: "proj-1",
    parent_task_id: null,
    recurrence_origin_id: null,
    status: "todo",
    tag_ids: [],
    due_date: null,
    due_time: null,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    sort_order: 0,
    ...overrides,
  };
}

/**
 * Três da faixa "Alta" mais uma "Baixa". Os `updated_at` decrescentes deixam a ordem inicial
 * (a do comparador da 079, padrão de fábrica) igual a Assinar → Ligar → Revisar, com todas em
 * `sort_order = 0` — exatamente o estado logo depois da migration.
 */
function seedTasks(): Task[] {
  return [
    makeTask({
      id: "t-a",
      title: "Assinar contrato",
      priority: "high",
      updated_at: "2026-08-20T10:00:00Z",
    }),
    makeTask({
      id: "t-b",
      title: "Ligar para o cliente",
      priority: "high",
      updated_at: "2026-08-20T09:00:00Z",
    }),
    makeTask({
      id: "t-c",
      title: "Revisar orçamento",
      priority: "high",
      updated_at: "2026-08-20T08:00:00Z",
    }),
    makeTask({
      id: "t-low",
      title: "Arquivar notas",
      priority: "low",
      updated_at: "2026-08-20T07:00:00Z",
    }),
  ];
}

function priorityPanel(): HTMLElement {
  return screen.getByText("Por prioridade").closest("div") as HTMLElement;
}

/** Títulos das linhas do painel "Por prioridade", na ordem em que estão na tela. */
function bandOrder(): string[] {
  return Array.from(priorityPanel().querySelectorAll("button")).map(
    (button) => button.querySelector("span")?.textContent?.trim() ?? ""
  );
}

async function renderListWithProject() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(
    <MemoryRouter>
      <ActiveTimerProvider>
        <TaskList />
      </ActiveTimerProvider>
    </MemoryRouter>
  );
  await screen.findByText("Assinar contrato");
  // O quadrante só aparece com um projeto específico selecionado na trilha (feature 025).
  await user.click(
    within(screen.getByRole("navigation", { name: "Filtrar por projeto" })).getByRole("button", {
      name: "Orbyva",
    })
  );
  await screen.findByText("Por prioridade");
  return user;
}

/** Dispara a solta que o `@dnd-kit` entregaria. */
async function drop(activeId: string, overId: string) {
  expect(dnd.onDragEnd).not.toBeNull();
  await act(async () => {
    dnd.onDragEnd?.({ active: { id: activeId }, over: { id: overId } });
  });
}

describe("TaskList — reordenar dentro da faixa de prioridade (feature 082)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 7, 20, 10, 0, 0));
    localStorage.clear();
    toastMock.mockReset();
    mockedSortOrder.mockClear();
    mockedUpdateTask.mockClear();
    dnd.onDragEnd = null;
    writeGate.hold = false;
    writeGate.release = null;
    writeGate.fail = false;
    store.tasks = seedTasks();
    store.projects = [PROJECT];
    store.runningEntry = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("o pedido: arrastar a segunda da faixa «Alta» para o topo renumera a faixa e persiste", async () => {
    await renderListWithProject();
    expect(bandOrder().slice(0, 3)).toEqual([
      "Assinar contrato",
      "Ligar para o cliente",
      "Revisar orçamento",
    ]);

    await drop("t-b", "t-a");

    expect(mockedSortOrder).toHaveBeenCalledTimes(1);
    expect(mockedSortOrder).toHaveBeenCalledWith([
      { id: "t-b", sort_order: 0 },
      { id: "t-a", sort_order: 1 },
      { id: "t-c", sort_order: 2 },
    ]);
    await waitFor(() =>
      expect(bandOrder().slice(0, 3)).toEqual([
        "Ligar para o cliente",
        "Assinar contrato",
        "Revisar orçamento",
      ])
    );

    // Persistência: o "servidor" guardou a ordem, então uma montagem nova (um `load()` do zero)
    // continua mostrando o gesto do usuário — e não a ordem do comparador da 079.
    expect(store.tasks.find((t) => t.id === "t-b")?.sort_order).toBe(0);
    expect(store.tasks.find((t) => t.id === "t-a")?.sort_order).toBe(1);

    cleanup();
    await renderListWithProject();
    expect(bandOrder().slice(0, 3)).toEqual([
      "Ligar para o cliente",
      "Assinar contrato",
      "Revisar orçamento",
    ]);
  });

  it("a mudança é otimista: a linha se move antes da resposta do servidor", async () => {
    await renderListWithProject();
    writeGate.hold = true;

    await drop("t-c", "t-a");

    // A escrita ainda está pendurada (o servidor não viu nada: t-a continua em 0)...
    expect(writeGate.release).not.toBeNull();
    expect(store.tasks.find((t) => t.id === "t-a")?.sort_order).toBe(0);
    // ...e a linha já está no topo.
    await waitFor(() =>
      expect(bandOrder().slice(0, 3)).toEqual([
        "Revisar orçamento",
        "Assinar contrato",
        "Ligar para o cliente",
      ])
    );

    await act(async () => {
      writeGate.release?.();
    });
    await waitFor(() => expect(store.tasks.find((t) => t.id === "t-a")?.sort_order).toBe(1));
  });

  it("erro na persistência reverte a ordem na tela e mostra toast", async () => {
    await renderListWithProject();
    writeGate.fail = true;

    await drop("t-c", "t-a");

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        // `getErrorMessage` deixa passar a mensagem do erro quando ela não é técnica; o fallback
        // ("Não foi possível salvar a nova ordem.") é o que aparece quando ela é.
        expect.objectContaining({ title: "Erro", description: "falha de rede", variant: "destructive" })
      )
    );
    expect(bandOrder().slice(0, 3)).toEqual([
      "Assinar contrato",
      "Ligar para o cliente",
      "Revisar orçamento",
    ]);
  });

  it("soltar no mesmo lugar não escreve nada", async () => {
    await renderListWithProject();
    await drop("t-a", "t-a");
    expect(mockedSortOrder).not.toHaveBeenCalled();
    expect(mockedUpdateTask).not.toHaveBeenCalled();
  });

  it("soltar uma «Baixa» dentro da faixa «Alta» muda a prioridade e posiciona", async () => {
    await renderListWithProject();

    await drop("t-low", "t-a");

    expect(mockedUpdateTask).toHaveBeenCalledWith({ id: "t-low", priority: "high" });
    expect(mockedSortOrder).toHaveBeenCalledWith([
      { id: "t-low", sort_order: 0 },
      { id: "t-a", sort_order: 1 },
      { id: "t-b", sort_order: 2 },
      { id: "t-c", sort_order: 3 },
    ]);

    await waitFor(() =>
      expect(bandOrder()).toEqual([
        "Arquivar notas",
        "Assinar contrato",
        "Ligar para o cliente",
        "Revisar orçamento",
      ])
    );
    // A faixa "Baixa" ficou vazia e sumiu (comportamento antigo preservado).
    expect(within(priorityPanel()).queryByTitle("Baixa")).toBeNull();
    expect(store.tasks.find((t) => t.id === "t-low")?.priority).toBe("high");
  });

  it("soltar em cima de uma linha alheia à faixa não inventa destino nenhum", async () => {
    await renderListWithProject();
    // A faixa não é um droppable próprio (ver TaskQuadrant.tsx): um `over` que não é tarefa
    // nenhuma — o que sobra quando o gesto termina fora de tudo — não escreve nada.
    await drop("t-low", "priority-band:high");
    expect(mockedSortOrder).not.toHaveBeenCalled();
    expect(mockedUpdateTask).not.toHaveBeenCalled();
  });
});
