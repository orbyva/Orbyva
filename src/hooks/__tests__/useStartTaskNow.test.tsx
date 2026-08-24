import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { updateTask } from "@/api/tasks";
import { useStartTaskNow } from "@/hooks/useStartTaskNow";
import type { Task, TaskTimeEntry } from "@/types/tasks";

/**
 * Cobre o hook do botão "Imediatamente" (feature 078) — a parte da feature que ninguém vê pela
 * tela: a ordem dos efeitos (timer primeiro, prazo depois), o que acontece quando cada um falha, e
 * o conteúdo dos toasts. Sem Chrome como rede de segurança, é aqui que "um clique = timer + prazo"
 * fica provado.
 */

vi.mock("@/api/tasks", () => ({
  // Feature 085: os donos do formulário/lista carregam e gravam os links externos.
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  updateTask: vi.fn(),
}));

const { startMock, timerState } = vi.hoisted(() => ({
  startMock: vi.fn(),
  timerState: { runningEntry: null as TaskTimeEntry | null },
}));

const stopMock = vi.fn();
vi.mock("@/hooks/useActiveTimer", () => ({
  useActiveTimer: () => ({
    runningEntry: timerState.runningEntry,
    start: startMock,
    stop: stopMock,
    refresh: vi.fn(),
  }),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const mockedUpdateTask = vi.mocked(updateTask);

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

function makeEntry(taskId: string): TaskTimeEntry {
  return {
    id: `entry-${taskId}`,
    task_id: taskId,
    started_at: "2026-08-20T12:00:00.000Z",
    ended_at: null,
  };
}

/** Último toast disparado — as asserções olham o conteúdo, não só a contagem. */
function lastToast() {
  return toastMock.mock.calls.at(-1)?.[0] as
    | { title?: string; description?: string; variant?: string }
    | undefined;
}

describe("useStartTaskNow (feature 078)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 7, 20, 10, 0, 0));
    startMock.mockReset();
    startMock.mockResolvedValue(undefined);
    stopMock.mockReset();
    toastMock.mockReset();
    mockedUpdateTask.mockReset();
    mockedUpdateTask.mockResolvedValue(undefined as never);
    timerState.runningEntry = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("caminho feliz: inicia o timer e grava o prazo como hoje + duração estimada", async () => {
    const onApplied = vi.fn();
    const { result } = renderHook(() => useStartTaskNow({ onApplied }));
    const task = makeTask({ estimated_duration: 90 });

    await act(async () => {
      await result.current.startNow(task);
    });

    expect(startMock).toHaveBeenCalledWith("task-1");
    expect(mockedUpdateTask).toHaveBeenCalledWith({
      id: "task-1",
      due_date: "2026-08-20",
      due_time: "11:30",
    });
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(lastToast()).toMatchObject({ title: "Começou agora · prazo 11:30" });
    expect(lastToast()?.variant).toBeUndefined();
  });

  it("o prazo é gravado depois do timer começar (ordem, não só ambos chamados)", async () => {
    const order: string[] = [];
    startMock.mockImplementation(async () => {
      order.push("start");
    });
    mockedUpdateTask.mockImplementation(async () => {
      order.push("updateTask");
      return undefined as never;
    });
    const { result } = renderHook(() => useStartTaskNow());

    await act(async () => {
      await result.current.startNow(makeTask({ estimated_duration: 30 }));
    });

    expect(order).toEqual(["start", "updateTask"]);
  });

  it("falha ao iniciar o timer não grava prazo nenhum", async () => {
    startMock.mockRejectedValue(new Error("timer caiu"));
    const onApplied = vi.fn();
    const { result } = renderHook(() => useStartTaskNow({ onApplied }));

    await act(async () => {
      await result.current.startNow(makeTask({ estimated_duration: 60 }));
    });

    expect(mockedUpdateTask).not.toHaveBeenCalled();
    expect(onApplied).not.toHaveBeenCalled();
    expect(lastToast()).toMatchObject({ title: "Erro", variant: "destructive" });
  });

  it("falha ao gravar o prazo não desfaz o timer e tem toast próprio", async () => {
    mockedUpdateTask.mockRejectedValue(new Error("prazo caiu"));
    const onApplied = vi.fn();
    const { result } = renderHook(() => useStartTaskNow({ onApplied }));

    await act(async () => {
      await result.current.startNow(makeTask({ estimated_duration: 60 }));
    });

    expect(startMock).toHaveBeenCalledWith("task-1");
    expect(stopMock).not.toHaveBeenCalled();
    expect(onApplied).not.toHaveBeenCalled();
    const toast = lastToast();
    expect(toast?.variant).toBe("destructive");
    expect(toast?.title).toBe("Timer iniciado, mas o prazo não foi salvo");
    // mensagem distinta da falha do timer — o usuário precisa saber que o trabalho começou
    expect(toast?.title).not.toBe("Erro");
  });

  it("`pending` bloqueia clique duplo: dois cliques no mesmo tick iniciam um timer só", async () => {
    let releaseStart: () => void = () => {};
    startMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseStart = () => resolve();
        })
    );
    const { result } = renderHook(() => useStartTaskNow());
    const task = makeTask({ estimated_duration: 30 });

    expect(result.current.pending).toBe(false);

    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.startNow(task);
      second = result.current.startNow(task);
    });

    expect(result.current.pending).toBe(true);
    expect(result.current.pendingTaskId).toBe("task-1");
    expect(startMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseStart();
      await first;
      await second;
    });

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(mockedUpdateTask).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
    expect(result.current.pendingTaskId).toBeNull();
  });

  it("sem duração estimada, o toast avisa que usou o padrão de 30 min", async () => {
    const { result } = renderHook(() => useStartTaskNow());

    await act(async () => {
      await result.current.startNow(makeTask());
    });

    expect(mockedUpdateTask).toHaveBeenCalledWith({
      id: "task-1",
      due_date: "2026-08-20",
      due_time: "10:30",
    });
    expect(lastToast()?.title).toBe("Começou agora · prazo 10:30");
    expect(lastToast()?.description).toContain("Sem duração estimada — usamos 30 min.");
  });

  it("quando parou o timer de outra tarefa, o toast diz qual foi", async () => {
    timerState.runningEntry = makeEntry("task-9");
    const { result } = renderHook(() =>
      useStartTaskNow({
        resolveTaskTitle: (id) => (id === "task-9" ? "Tarefa antiga" : undefined),
      })
    );

    await act(async () => {
      await result.current.startNow(makeTask({ estimated_duration: 30 }));
    });

    expect(lastToast()?.description).toContain('O timer de "Tarefa antiga" foi parado.');
  });

  it("sem resolvedor de título, o aviso do timer parado continua aparecendo (genérico)", async () => {
    timerState.runningEntry = makeEntry("task-9");
    const { result } = renderHook(() => useStartTaskNow());

    await act(async () => {
      await result.current.startNow(makeTask({ estimated_duration: 30 }));
    });

    expect(lastToast()?.description).toContain("O timer anterior foi parado.");
  });

  it("timer já rodando na própria tarefa não vira aviso de 'timer parado'", async () => {
    timerState.runningEntry = makeEntry("task-1");
    const { result } = renderHook(() =>
      useStartTaskNow({ resolveTaskTitle: () => "Minha tarefa" })
    );

    await act(async () => {
      await result.current.startNow(makeTask({ estimated_duration: 30 }));
    });

    expect(lastToast()?.description ?? "").not.toContain("foi parado");
  });

  it("tarefa que já tinha prazo: o prazo é sobrescrito e o toast informa o antigo", async () => {
    const { result } = renderHook(() => useStartTaskNow());

    await act(async () => {
      await result.current.startNow(
        makeTask({ estimated_duration: 60, due_date: "2026-09-01", due_time: "14:00" })
      );
    });

    expect(mockedUpdateTask).toHaveBeenCalledWith({
      id: "task-1",
      due_date: "2026-08-20",
      due_time: "11:00",
    });
    expect(lastToast()?.description).toContain("Prazo anterior: 01/09/2026 14:00.");
  });

  it("tarefa pontual recebe prazo = agora e não ganha duração estimada", async () => {
    vi.setSystemTime(new Date(2026, 7, 20, 10, 7, 0));
    const { result } = renderHook(() => useStartTaskNow());

    await act(async () => {
      await result.current.startNow(makeTask({ is_quick: true }));
    });

    expect(mockedUpdateTask).toHaveBeenCalledWith({
      id: "task-1",
      due_date: "2026-08-20",
      due_time: "10:07",
    });
    const payload = mockedUpdateTask.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("estimated_duration");
    expect(payload).not.toHaveProperty("is_quick");
    expect(lastToast()?.description ?? "").not.toContain("usamos 30 min");
  });

  it("virada de dia: o toast mostra a data junto com a hora quando o prazo não é hoje", async () => {
    vi.setSystemTime(new Date(2026, 7, 20, 23, 50, 0));
    const { result } = renderHook(() => useStartTaskNow());

    await act(async () => {
      await result.current.startNow(makeTask({ estimated_duration: 30 }));
    });

    expect(mockedUpdateTask).toHaveBeenCalledWith({
      id: "task-1",
      due_date: "2026-08-21",
      due_time: "00:20",
    });
    expect(lastToast()?.title).toBe("Começou agora · prazo 21/08/2026 00:20");
  });
});
