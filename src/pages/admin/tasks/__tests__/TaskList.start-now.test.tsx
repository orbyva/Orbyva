import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TaskList from "@/pages/admin/tasks/TaskList";
import { ActiveTimerProvider } from "@/hooks/useActiveTimer";
import { startTimer, updateTask } from "@/api/tasks";
import type { Project, Task, TaskTimeEntry } from "@/types/tasks";

/**
 * Fluxo completo do botão "Imediatamente" (feature 078) na Lista: um clique só faz o timer rodar,
 * grava o prazo como hoje + agora + duração estimada e reagrupa a tarefa no bloco "Hoje" sem
 * reload manual. Usa o `ActiveTimerProvider` de verdade (só a camada de API é fingida), pra provar
 * que o indicador de timer da linha muda de estado — a skill `next` proíbe Chrome como prova.
 */

/** "Servidor" em memória: `updateTask` grava aqui e o `load()` seguinte relê daqui, que é o que
 * permite observar a tarefa mudando de bucket sem F5. */
const store: { tasks: Task[]; runningEntry: TaskTimeEntry | null } = {
  tasks: [],
  runningEntry: null,
};

vi.mock("@/api/tasks", () => ({
  fetchTasks: vi.fn(async () => store.tasks.map((t) => ({ ...t }))),
  fetchProjects: vi.fn(async () => [] as Project[]),
  fetchTags: vi.fn(async () => []),
  fetchDependencies: vi.fn(async () => []),
  createTask: vi.fn(),
  updateTask: vi.fn(async (payload: { id: string } & Partial<Task>) => {
    const index = store.tasks.findIndex((t) => t.id === payload.id);
    if (index >= 0) store.tasks[index] = { ...store.tasks[index], ...payload };
    return undefined;
  }),
  deleteTask: vi.fn(),
  deleteTasks: vi.fn(),
  deleteTaskSeries: vi.fn(),
  createTag: vi.fn(),
  uploadTaskIcon: vi.fn(),
  fetchRunningEntry: vi.fn(async () => store.runningEntry),
  startTimer: vi.fn(async (taskId: string) => {
    store.runningEntry = {
      id: `entry-${taskId}`,
      task_id: taskId,
      started_at: new Date().toISOString(),
      ended_at: null,
    };
    return store.runningEntry;
  }),
  stopTimer: vi.fn(async () => {
    store.runningEntry = null;
  }),
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

const mockedUpdateTask = vi.mocked(updateTask);
const mockedStartTimer = vi.mocked(startTimer);

const START_NOW = /Imediatamente/;

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Minha tarefa",
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

/** Bloco (`div` com o `h3` do bucket + as linhas) de um bucket da Lista. */
function bucketSection(label: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: new RegExp(`^${label}`) });
  return heading.parentElement as HTMLElement;
}

async function renderList(tasks: Task[]) {
  store.tasks = tasks.map((t) => ({ ...t }));
  store.runningEntry = null;
  const utils = render(
    <MemoryRouter>
      <ActiveTimerProvider>
        <TaskList />
      </ActiveTimerProvider>
    </MemoryRouter>
  );
  await screen.findByText(tasks[0].title);
  return utils;
}

describe("TaskList — botão Imediatamente (feature 078)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // 20/08/2026 (quinta), 10h00 — hora redonda pra o prazo esperado ser óbvio.
    vi.setSystemTime(new Date(2026, 7, 20, 10, 0, 0));
    toastMock.mockReset();
    mockedUpdateTask.mockClear();
    mockedStartTimer.mockClear();
    store.tasks = [];
    store.runningEntry = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("um clique: inicia o timer, grava hoje + agora + duração e move a tarefa para «Hoje»", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList([makeTask({ estimated_duration: 60 })]);

    // Ponto de partida: a tarefa está em "Sem prazo" e o timer não está rodando.
    expect(within(bucketSection("Sem prazo")).getByText("Minha tarefa")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Hoje/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iniciar timer" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: START_NOW }));

    // 1) prazo gravado: data de hoje + hora de agora + duração estimada (10h00 + 60min = 11h00)
    await waitFor(() =>
      expect(mockedUpdateTask).toHaveBeenCalledWith({
        id: "task-1",
        due_date: "2026-08-20",
        due_time: "11:00",
      })
    );

    // 2) timer rodando na tarefa (o botão de Play virou "Parar timer")
    expect(mockedStartTimer).toHaveBeenCalledWith("task-1");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Parar timer" })).toBeInTheDocument()
    );

    // 3) reagrupou sozinha: saiu de "Sem prazo" e entrou em "Hoje", sem reload manual
    await waitFor(() =>
      expect(within(bucketSection("Hoje")).getByText("Minha tarefa")).toBeInTheDocument()
    );
    expect(screen.queryByRole("heading", { name: /^Sem prazo/ })).not.toBeInTheDocument();

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Começou agora · prazo 11:00" })
    );
  });

  it("sem duração estimada, usa o padrão de 30 min e avisa no toast", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList([makeTask()]);

    await user.click(screen.getByRole("button", { name: START_NOW }));

    await waitFor(() =>
      expect(mockedUpdateTask).toHaveBeenCalledWith({
        id: "task-1",
        due_date: "2026-08-20",
        due_time: "10:30",
      })
    );
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("Sem duração estimada — usamos 30 min."),
      })
    );
  });

  it("tarefa pontual recebe prazo = agora e continua pontual (não ganha duração estimada)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.setSystemTime(new Date(2026, 7, 20, 10, 7, 0));
    await renderList([makeTask({ is_quick: true, title: "Tomar remédio" })]);

    await user.click(screen.getByRole("button", { name: START_NOW }));

    await waitFor(() =>
      expect(mockedUpdateTask).toHaveBeenCalledWith({
        id: "task-1",
        due_date: "2026-08-20",
        due_time: "10:07",
      })
    );
    const payload = mockedUpdateTask.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("estimated_duration");
    expect(store.tasks[0].is_quick).toBe(true);
    expect(store.tasks[0].estimated_duration).toBeUndefined();
  });

  it("tarefa que já tinha prazo tem o prazo sobrescrito e o toast informa o antigo", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList([
      makeTask({ estimated_duration: 60, due_date: "2026-09-01", due_time: "14:00" }),
    ]);

    // começa em "Mais tarde" (prazo em setembro), não em "Hoje"
    expect(within(bucketSection("Mais tarde")).getByText("Minha tarefa")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: START_NOW }));

    await waitFor(() =>
      expect(mockedUpdateTask).toHaveBeenCalledWith({
        id: "task-1",
        due_date: "2026-08-20",
        due_time: "11:00",
      })
    );
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("Prazo anterior: 01/09/2026 14:00."),
      })
    );
    await waitFor(() =>
      expect(within(bucketSection("Hoje")).getByText("Minha tarefa")).toBeInTheDocument()
    );
  });

  it("iniciar outra tarefa para o timer da anterior e o toast diz qual foi", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList([
      makeTask({ id: "task-1", title: "Primeira", estimated_duration: 30 }),
      makeTask({ id: "task-2", title: "Segunda", estimated_duration: 30 }),
    ]);

    const semPrazo = bucketSection("Sem prazo");
    const primeiraRow = within(semPrazo).getByText("Primeira").closest(".cursor-pointer") as HTMLElement;
    await user.click(within(primeiraRow).getByRole("button", { name: START_NOW }));
    await waitFor(() => expect(mockedStartTimer).toHaveBeenCalledWith("task-1"));

    const segundaRow = screen.getByText("Segunda").closest(".cursor-pointer") as HTMLElement;
    await user.click(within(segundaRow).getByRole("button", { name: START_NOW }));

    await waitFor(() => expect(mockedStartTimer).toHaveBeenCalledWith("task-2"));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('O timer de "Primeira" foi parado.'),
      })
    );
  });
});
