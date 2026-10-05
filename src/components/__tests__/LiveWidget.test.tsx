import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LiveWidget } from "@/components/LiveWidget";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LIVE_WIDGET_HIDDEN_STORAGE_KEY } from "@/lib/liveWidgetVisibility";
import { fetchLastInteractedEntry, fetchTaskById, updateTask } from "@/api/tasks";
import type { Task, TaskTimeEntry } from "@/types/tasks";

/**
 * Feature 072 — "parar e concluir" no player flutuante. Sem Chrome, é este arquivo que prova o
 * pedido do prompt ("adicionar no player flutuante, quando tiver já uma atividade em andamento, um
 * outro ícone de check ... parar e marcar como concluído"): quando o botão existe, o que ele chama
 * e em que ordem, o que acontece quando a conclusão falha e o sumiço do pill depois do sucesso.
 *
 * Feature 226 — "permitir esconder o timer". O último `describe` prova o pedido sem navegador: o
 * botão de esconder nos dois estados, o pill saindo do DOM no mesmo render, a preferência gravada e
 * relida do `localStorage`, o botão redondo de volta e — o que não pode acontecer — nenhum
 * `stop`/`updateTask` no caminho do clique.
 */

vi.mock("@/api/tasks", () => ({
  // Feature 085: os donos do formulário/lista carregam e gravam os links externos.
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchLastInteractedEntry: vi.fn(),
  fetchTaskById: vi.fn(),
  updateTask: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const { timerState } = vi.hoisted(() => ({
  timerState: {
    runningEntry: null as TaskTimeEntry | null,
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
  },
}));
vi.mock("@/hooks/useActiveTimer", () => ({
  useActiveTimer: () => ({
    runningEntry: timerState.runningEntry,
    start: timerState.start,
    stop: timerState.stop,
    refresh: timerState.refresh,
  }),
}));

const mockedFetchLastInteractedEntry = vi.mocked(fetchLastInteractedEntry);
const mockedFetchTaskById = vi.mocked(fetchTaskById);
const mockedUpdateTask = vi.mocked(updateTask);

function makeEntry(overrides: Partial<TaskTimeEntry> = {}): TaskTimeEntry {
  return {
    id: "entry-1",
    task_id: "task-1",
    started_at: new Date().toISOString(),
    ended_at: null,
    ...overrides,
  } as TaskTimeEntry;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Escrever relatório",
    status: "todo",
    tag_ids: [],
    due_date: null,
    due_time: null,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    ...overrides,
  } as Task;
}

function renderWidget() {
  return render(
    <TooltipProvider>
      <LiveWidget />
    </TooltipProvider>
  );
}

/** Espera o pill aparecer (os dados chegam por efeito assíncrono). */
async function waitForPill(title = "Escrever relatório") {
  await waitFor(() => expect(screen.getByText(title)).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  // O `localStorage` do setup jsdom é um store de memória compartilhado por todo o arquivo
  // (`src/test/setup-jsdom.ts`): sem limpar, a preferência gravada num teste nasce ligada no
  // próximo e o widget já começa escondido.
  localStorage.clear();
  timerState.runningEntry = null;
  timerState.stop = vi.fn(async () => {});
  timerState.start = vi.fn(async () => {});
  mockedFetchLastInteractedEntry.mockResolvedValue(null);
  mockedFetchTaskById.mockResolvedValue(makeTask());
  mockedUpdateTask.mockResolvedValue(undefined);
});

describe("LiveWidget — quando o botão de concluir existe", () => {
  it("com timer rodando, mostra o botão de parar e concluir", async () => {
    timerState.runningEntry = makeEntry();
    renderWidget();
    await waitForPill();

    const completeButton = screen.getByRole("button", {
      name: "Parar e marcar como concluída",
    });
    // O prompt pede literalmente "um outro ícone de check", ao lado do de parar.
    expect(completeButton.querySelector("svg")?.getAttribute("class")).toContain("lucide-check");
    expect(screen.getByRole("button", { name: "Parar timer" })).toBeInTheDocument();
  });

  it("sem timer rodando (estado retomar), o botão de concluir não é renderizado", async () => {
    timerState.runningEntry = null;
    mockedFetchLastInteractedEntry.mockResolvedValue(
      makeEntry({ ended_at: new Date().toISOString() })
    );
    renderWidget();
    await waitForPill();

    expect(screen.getByRole("button", { name: "Retomar timer" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Parar e marcar como concluída" })
    ).not.toBeInTheDocument();
  });

  it("timer rodando numa tarefa já concluída também não mostra o botão", async () => {
    timerState.runningEntry = makeEntry();
    mockedFetchTaskById.mockResolvedValue(makeTask({ status: "done" }));
    renderWidget();
    await waitForPill();

    expect(screen.getByRole("button", { name: "Parar timer" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Parar e marcar como concluída" })
    ).not.toBeInTheDocument();
  });
});

describe("LiveWidget — parar e concluir", () => {
  it("clicar para o timer e só então conclui a tarefa, nessa ordem", async () => {
    const user = userEvent.setup();
    timerState.runningEntry = makeEntry();
    renderWidget();
    await waitForPill();

    await user.click(screen.getByRole("button", { name: "Parar e marcar como concluída" }));

    await waitFor(() => expect(mockedUpdateTask).toHaveBeenCalledTimes(1));
    expect(timerState.stop).toHaveBeenCalledTimes(1);
    expect(mockedUpdateTask).toHaveBeenCalledWith({ id: "task-1", status: "done" });
    expect(timerState.stop.mock.invocationCallOrder[0]).toBeLessThan(
      mockedUpdateTask.mock.invocationCallOrder[0]
    );
    expect(toastMock).toHaveBeenCalledWith({ title: "Tarefa concluída!", duration: 2000 });
  });

  it("falha no stop não conclui a tarefa e avisa que o timer não parou", async () => {
    const user = userEvent.setup();
    timerState.runningEntry = makeEntry();
    timerState.stop = vi.fn(async () => {
      throw new Error("PGRST301 falha ao parar");
    });
    renderWidget();
    await waitForPill();

    await user.click(screen.getByRole("button", { name: "Parar e marcar como concluída" }));

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(mockedUpdateTask).not.toHaveBeenCalled();
    const [[toastArg]] = toastMock.mock.calls;
    expect(toastArg.variant).toBe("destructive");
    expect(`${toastArg.title} ${toastArg.description}`).toMatch(/timer/i);
  });

  it("falha no updateTask avisa que o timer parou e libera os botões de novo", async () => {
    const user = userEvent.setup();
    timerState.runningEntry = makeEntry();
    mockedUpdateTask.mockRejectedValue(new Error("PGRST116 sem linha"));
    renderWidget();
    await waitForPill();

    const completeButton = screen.getByRole("button", { name: "Parar e marcar como concluída" });
    await user.click(completeButton);

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    const [[toastArg]] = toastMock.mock.calls;
    expect(toastArg.variant).toBe("destructive");
    expect(toastArg.title).toBe("Timer parado, mas não foi possível concluir a tarefa.");
    // `completing` voltou a false no finally: dá pra tentar de novo.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Parar e marcar como concluída" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Parar timer" })).toBeEnabled();
    });
  });

  it("depois de concluir, o widget some sozinho — sem reload", async () => {
    const user = userEvent.setup();
    timerState.runningEntry = makeEntry();
    // Espelha o servidor: parar o timer zera `runningEntry`, a última entrada interagida passa a
    // ser justamente a que acabou de parar (mesmo `task_id`) e a tarefa já volta concluída.
    timerState.stop = vi.fn(async () => {
      timerState.runningEntry = null;
    });
    mockedFetchLastInteractedEntry.mockResolvedValue(
      makeEntry({ ended_at: new Date().toISOString() })
    );
    mockedFetchTaskById.mockImplementation(async () =>
      makeTask({ status: mockedUpdateTask.mock.calls.length > 0 ? "done" : "todo" })
    );
    const { rerender } = renderWidget();
    await waitForPill();

    await user.click(screen.getByRole("button", { name: "Parar e marcar como concluída" }));
    await waitFor(() => expect(mockedUpdateTask).toHaveBeenCalledTimes(1));

    rerender(
      <TooltipProvider>
        <LiveWidget />
      </TooltipProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText("Escrever relatório")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Retomar timer" })).not.toBeInTheDocument();
    });
  });

  it("se o timer não zerar (refresh falhou), a tarefa concluída já não oferece concluir de novo", async () => {
    const user = userEvent.setup();
    // `ActiveTimerProvider.refresh` engole erros: `runningEntry` pode continuar preenchido depois
    // do `stop()`. Sem a marcação local do `task` como concluído, o check continuaria ali
    // convidando a um `updateTask` redundante.
    timerState.runningEntry = makeEntry();
    renderWidget();
    await waitForPill();

    await user.click(screen.getByRole("button", { name: "Parar e marcar como concluída" }));
    await waitFor(() => expect(mockedUpdateTask).toHaveBeenCalledTimes(1));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Parar e marcar como concluída" })
      ).not.toBeInTheDocument()
    );
    // O pill continua (o timer, pelo que o app sabe, ainda roda) — só sem o atalho de concluir.
    expect(screen.getByRole("button", { name: "Parar timer" })).toBeInTheDocument();
  });
});

describe("LiveWidget — layout e tooltips", () => {
  it("com três controles, o título trunca e os botões não quebram linha", async () => {
    timerState.runningEntry = makeEntry();
    renderWidget();
    await waitForPill();

    const title = screen.getByText("Escrever relatório");
    expect(title.className).toContain("truncate");
    expect(title.parentElement?.className).toContain("min-w-0");

    const controls = screen.getByRole("button", { name: "Parar timer" }).parentElement;
    expect(controls?.className).toContain("shrink-0");
    expect(controls?.className).toContain("flex-nowrap");
  });

  it("os dois botões estão embrulhados em tooltip (Radix marca o trigger)", async () => {
    timerState.runningEntry = makeEntry();
    renderWidget();
    await waitForPill();

    expect(
      screen.getByRole("button", { name: "Parar e marcar como concluída" })
    ).toHaveAttribute("data-state", "closed");
    expect(screen.getByRole("button", { name: "Parar timer" })).toHaveAttribute(
      "data-state",
      "closed"
    );
  });

  it("hover no check revela o texto «Parar e concluir»", async () => {
    const user = userEvent.setup();
    timerState.runningEntry = makeEntry();
    renderWidget();
    await waitForPill();

    await user.hover(screen.getByRole("button", { name: "Parar e marcar como concluída" }));

    await waitFor(() => expect(screen.getAllByText("Parar e concluir").length).toBeGreaterThan(0));
  });
});

describe("LiveWidget — esconder e mostrar", () => {
  /** Estado "retomar": timer parado, com uma última tarefa interagida ainda pendente. */
  function idleWithLastEntry() {
    timerState.runningEntry = null;
    mockedFetchLastInteractedEntry.mockResolvedValue(
      makeEntry({ ended_at: new Date().toISOString() })
    );
  }

  it("o botão de esconder existe com timer rodando", async () => {
    timerState.runningEntry = makeEntry();
    renderWidget();
    await waitForPill();

    const hideButton = screen.getByRole("button", { name: "Esconder o timer" });
    expect(hideButton.querySelector("svg")?.getAttribute("class")).toContain("lucide-x");
    // Esconder não depende do "parar e concluir" em curso.
    expect(hideButton).toBeEnabled();
  });

  it("o botão de esconder existe também no estado ocioso (retomar)", async () => {
    idleWithLastEntry();
    renderWidget();
    await waitForPill();

    expect(screen.getByRole("button", { name: "Retomar timer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Esconder o timer" })).toBeInTheDocument();
  });

  it("clicar em esconder tira o pill do DOM no mesmo render e grava a preferência", async () => {
    const user = userEvent.setup();
    timerState.runningEntry = makeEntry();
    renderWidget();
    await waitForPill();

    await user.click(screen.getByRole("button", { name: "Esconder o timer" }));

    expect(screen.queryByText("Escrever relatório")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Parar timer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retomar timer" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mostrar o timer" })).toBeInTheDocument();
    expect(localStorage.getItem(LIVE_WIDGET_HIDDEN_STORAGE_KEY)).toBe("1");
  });

  it("montar com a preferência já gravada mostra só o botão de voltar", async () => {
    localStorage.setItem(LIVE_WIDGET_HIDDEN_STORAGE_KEY, "1");
    timerState.runningEntry = makeEntry();
    renderWidget();

    const showButton = await waitFor(() =>
      screen.getByRole("button", { name: "Mostrar o timer" })
    );
    expect(showButton.querySelector("svg")?.getAttribute("class")).toContain("lucide-timer");
    expect(screen.queryByText("Escrever relatório")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Parar timer" })).not.toBeInTheDocument();
  });

  it("clicar no botão de voltar reexibe o pill e limpa a preferência", async () => {
    const user = userEvent.setup();
    localStorage.setItem(LIVE_WIDGET_HIDDEN_STORAGE_KEY, "1");
    timerState.runningEntry = makeEntry();
    renderWidget();

    await user.click(
      await waitFor(() => screen.getByRole("button", { name: "Mostrar o timer" }))
    );

    expect(screen.getByText("Escrever relatório")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Parar timer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mostrar o timer" })).not.toBeInTheDocument();
    expect(localStorage.getItem(LIVE_WIDGET_HIDDEN_STORAGE_KEY)).toBeNull();
  });

  it("esconder com timer rodando não toca o timer, e o botão de voltar mantém o sinal", async () => {
    const user = userEvent.setup();
    timerState.runningEntry = makeEntry();
    renderWidget();
    await waitForPill();

    await user.click(screen.getByRole("button", { name: "Esconder o timer" }));

    expect(timerState.stop).not.toHaveBeenCalled();
    expect(timerState.start).not.toHaveBeenCalled();
    expect(mockedUpdateTask).not.toHaveBeenCalled();
    // Com timer aberto o cronômetro do botão redondo fica em destaque — é o que sobrou na tela.
    const svgClass = screen
      .getByRole("button", { name: "Mostrar o timer" })
      .querySelector("svg")
      ?.getAttribute("class");
    expect(svgClass).toContain("text-primary");
    expect(svgClass).not.toContain("text-muted-foreground");
  });

  it("escondido e com timer parado, o cronômetro do botão de voltar fica em cinza", async () => {
    const user = userEvent.setup();
    idleWithLastEntry();
    renderWidget();
    await waitForPill();

    await user.click(screen.getByRole("button", { name: "Esconder o timer" }));

    expect(
      screen
        .getByRole("button", { name: "Mostrar o timer" })
        .querySelector("svg")
        ?.getAttribute("class")
    ).toContain("text-muted-foreground");
  });

  it("escondido, o botão de voltar fica fixo no mesmo canto do pill", async () => {
    localStorage.setItem(LIVE_WIDGET_HIDDEN_STORAGE_KEY, "1");
    timerState.runningEntry = makeEntry();
    renderWidget();

    const showButton = await waitFor(() =>
      screen.getByRole("button", { name: "Mostrar o timer" })
    );
    expect(showButton.className).toContain("fixed");
    expect(showButton.className).toContain("z-30");
    expect(showButton.className).toContain("rounded-full");
    // Mesmas âncoras do pill: acima do QuickAddExpenseFab no desktop, da safe area no mobile.
    expect(showButton.className).toContain("md:bottom-24");
    expect(showButton.className).toContain("md:right-6");
    expect(showButton.className).toContain("env(safe-area-inset-bottom,0px)");
  });

  it("com a preferência gravada mas sem timer nem última tarefa, não aparece nada", async () => {
    localStorage.setItem(LIVE_WIDGET_HIDDEN_STORAGE_KEY, "1");
    timerState.runningEntry = null;
    mockedFetchLastInteractedEntry.mockResolvedValue(null);
    const { container } = renderWidget();

    await waitFor(() => expect(mockedFetchLastInteractedEntry).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Mostrar o timer" })).not.toBeInTheDocument();
    expect(screen.queryByText("Escrever relatório")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("valor lixo no localStorage nunca esconde o widget", async () => {
    localStorage.setItem(LIVE_WIDGET_HIDDEN_STORAGE_KEY, "true");
    timerState.runningEntry = makeEntry();
    renderWidget();
    await waitForPill();

    expect(screen.queryByRole("button", { name: "Mostrar o timer" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Esconder o timer" })).toBeInTheDocument();
  });
});
