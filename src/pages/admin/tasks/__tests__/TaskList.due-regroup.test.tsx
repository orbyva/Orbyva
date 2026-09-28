import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TaskList from "@/pages/admin/tasks/TaskList";
import { ActiveTimerProvider } from "@/hooks/useActiveTimer";
import { updateTask } from "@/api/tasks";
import type { Project, Task, TaskTimeEntry } from "@/types/tasks";

/**
 * Feature 081 — alterar o prazo pelo quick-edit reagrupa a lista, mas só quando o popover fecha.
 * É a reversão parcial da 029 (que congelava a posição até a próxima recarga real): enquanto o
 * popover está aberto a linha continua parada (senão o popover ancorado nela salta/some no meio da
 * edição), e ao fechar a tarefa cai na caixa de prazo certa sem nenhum reload manual.
 *
 * Tudo por DOM — a skill `next` proíbe Chrome como prova.
 */

/** "Servidor" em memória: `updateTask` grava aqui e o `load()` seguinte relê daqui, que é o que
 * permite observar a tarefa mudando de caixa sem F5. */
const store: { tasks: Task[]; projects: Project[]; runningEntry: TaskTimeEntry | null } = {
  tasks: [],
  projects: [],
  runningEntry: null,
};

/** Ligado num teste específico pra provar a reversão do otimismo quando a API falha. */
let updateShouldFail = false;

vi.mock("@/api/tasks", () => ({
  // Feature 085: os donos do formulário/lista carregam e gravam os links externos.
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchTasks: vi.fn(async () => store.tasks.map((t) => ({ ...t }))),
  fetchProjects: vi.fn(async () => store.projects.map((p) => ({ ...p }))),
  fetchTags: vi.fn(async () => []),
  fetchDependencies: vi.fn(async () => []),
  createTask: vi.fn(),
  updateTask: vi.fn(async (payload: { id: string } & Partial<Task>) => {
    if (updateShouldFail) throw new Error("falha de rede");
    const index = store.tasks.findIndex((t) => t.id === payload.id);
    if (index >= 0) store.tasks[index] = { ...store.tasks[index], ...payload };
    return undefined;
  }),
  deleteTask: vi.fn(),
  deleteTasks: vi.fn(),
  deleteTaskSeries: vi.fn(),
  createTag: vi.fn(),
  fetchRunningEntry: vi.fn(async () => store.runningEntry),
  startTimer: vi.fn(),
  stopTimer: vi.fn(),
}));

// Feature 131: a biblioteca de assets importa `@/api/tasks/iconAssets` direto (nunca o barril, que
// arrastaria a API de tarefas inteira para o chunk de quem a monta) — é este mock que a intercepta.
vi.mock("@/api/tasks/iconAssets", () => ({
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
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

/** Bloco (`div` com o `h3` do bucket + as linhas) de um bucket da Lista. Os rótulos do
 * `TaskQuadrant` não são headings, então isso nunca casa com o painel lateral. */
function bucketSection(label: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: new RegExp(`^${label}`) });
  return heading.parentElement as HTMLElement;
}

function hasBucket(label: string): boolean {
  return screen.queryByRole("heading", { name: new RegExp(`^${label}`) }) !== null;
}

/** Gatilho do quick-edit de prazo da linha (mostra "+ Prazo" sem prazo, ou a data formatada). */
function dueTrigger(name: RegExp): HTMLElement {
  return screen.getByRole("button", { name });
}

/** O dia é achado por `data-day` (mesma âncora de `DatePicker.test.tsx`) — o nome acessível do
 * botão de dia vem do react-day-picker e não é estável. */
async function pickDay(user: ReturnType<typeof userEvent.setup>, iso: string) {
  await screen.findByRole("dialog");
  const day = document.querySelector(`[data-day="${iso}"] button`);
  expect(day).not.toBeNull();
  await user.click(day as HTMLButtonElement);
}

async function renderList(tasks: Task[], projects: Project[] = []) {
  store.tasks = tasks.map((t) => ({ ...t }));
  store.projects = projects.map((p) => ({ ...p }));
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

describe("TaskList — alterar o prazo reagrupa a lista (feature 081)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // 20/08/2026 é quinta: a semana termina no sábado 22, então 27/08 cai em "Este mês".
    vi.setSystemTime(new Date(2026, 7, 20, 10, 0, 0));
    localStorage.clear();
    toastMock.mockReset();
    mockedUpdateTask.mockClear();
    updateShouldFail = false;
    store.tasks = [];
    store.projects = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("o pedido: com o popover aberto o card fica parado; ao fechar, ele cai em «Hoje» sem reload manual", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList([makeTask()]);

    expect(within(bucketSection("Sem prazo")).getByText("Minha tarefa")).toBeInTheDocument();
    expect(hasBucket("Hoje")).toBe(false);

    await user.click(dueTrigger(/\+ Prazo/));
    await pickDay(user, "2026-08-20");

    // 1) a data já foi gravada e o card já mostra o prazo novo...
    await waitFor(() =>
      expect(mockedUpdateTask).toHaveBeenCalledWith(
        expect.objectContaining({ id: "task-1", due_date: "2026-08-20" })
      )
    );
    expect(await screen.findByRole("button", { name: /20\/08\/2026/ })).toBeInTheDocument();
    // ...mas a linha continua em "Sem prazo" enquanto o popover está aberto (feature 029).
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(bucketSection("Sem prazo")).getByText("Minha tarefa")).toBeInTheDocument();
    expect(hasBucket("Hoje")).toBe(false);

    // 2) fechar o popover reagrupa
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(within(bucketSection("Hoje")).getByText("Minha tarefa")).toBeInTheDocument()
    );
    expect(hasBucket("Sem prazo")).toBe(false);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Movida para «Hoje»" })
    );
  });

  it("não regride a 029: data, horário e duração na mesma abertura, sem o popover fechar nem a linha saltar", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList([makeTask()]);

    await user.click(dueTrigger(/\+ Prazo/));
    await pickDay(user, "2026-08-27");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Horário no mesmo popover (a linha nem se move, então o popover não é remontado).
    const timeInput = await screen.findByLabelText("Horário");
    fireEvent.change(timeInput, { target: { value: "14:30" } });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Duração no mesmo popover.
    await user.click(await screen.findByRole("button", { name: /\+ Duração/ }));
    await user.click(await screen.findByRole("button", { name: "1h30" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(bucketSection("Sem prazo")).getByText("Minha tarefa")).toBeInTheDocument();

    // As três mudanças foram salvas.
    await waitFor(() => {
      expect(store.tasks[0].due_date).toBe("2026-08-27");
      expect(store.tasks[0].due_time).toBe("14:30");
      expect(store.tasks[0].estimated_duration).toBe(90);
    });

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(within(bucketSection("Este mês")).getByText("Minha tarefa")).toBeInTheDocument()
    );
    expect(hasBucket("Sem prazo")).toBe(false);
  });

  it("erro no updateTask desfaz o otimismo: a data volta pra tela antiga e nada reagrupa", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList([makeTask({ due_date: "2026-08-27", title: "Vai falhar" })]);

    expect(within(bucketSection("Este mês")).getByText("Vai falhar")).toBeInTheDocument();

    updateShouldFail = true;
    await user.click(dueTrigger(/27\/08\/2026/));
    await pickDay(user, "2026-08-20");

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      )
    );
    // O prazo antigo voltou pro card (antes da 081 o toast aparecia e a data errada ficava).
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /27\/08\/2026/ })).toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: /20\/08\/2026/ })).not.toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(bucketSection("Este mês")).getByText("Vai falhar")).toBeInTheDocument();
    expect(hasBucket("Hoje")).toBe(false);
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("Movida para") })
    );
  });

  it("com o filtro «Hoje» ligado, empurrar o prazo tira o card da lista — e o toast diz pra qual caixa foi", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList([makeTask({ due_date: "2026-08-20", title: "Some da vista" })]);

    await user.click(screen.getByRole("button", { name: "Hoje" }));
    expect(within(bucketSection("Hoje")).getByText("Some da vista")).toBeInTheDocument();

    await user.click(dueTrigger(/20\/08\/2026/));
    await pickDay(user, "2026-08-22");

    // Mesmo com o chip "Hoje" ligado, a linha não some por baixo do popover aberto.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(bucketSection("Hoje")).getByText("Some da vista")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByText("Some da vista")).not.toBeInTheDocument());
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Movida para «Esta semana»" })
    );

    // Desligar o chip mostra que ela continua lá, na caixa nova.
    await user.click(screen.getByRole("button", { name: "Hoje" }));
    expect(within(bucketSection("Esta semana")).getByText("Some da vista")).toBeInTheDocument();
  });

  it("limpar o prazo (null) devolve a tarefa para «Sem prazo»", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList([makeTask({ due_date: "2026-08-20", title: "Sem data agora" })]);

    expect(within(bucketSection("Hoje")).getByText("Sem data agora")).toBeInTheDocument();

    await user.click(dueTrigger(/20\/08\/2026/));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /Limpar/ }));

    await waitFor(() => expect(store.tasks[0].due_date).toBeNull());
    // Congelada enquanto aberto...
    expect(within(bucketSection("Hoje")).getByText("Sem data agora")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(within(bucketSection("Sem prazo")).getByText("Sem data agora")).toBeInTheDocument()
    );
    expect(hasBucket("Hoje")).toBe(false);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Movida para «Sem prazo»" })
    );
  });

  /** O pedido, na letra: "ao alterar o prazo, ele não dá um reload na lista de tarefas, colocando
   * (…) prazos cada um em cada caixa". Três tarefas que começam juntas em "Sem prazo" recebem
   * prazos diferentes pelo quick-edit e terminam em três caixas diferentes — sem F5, sem trocar de
   * filtro, sem salvar pelo formulário. */
  it("o pedido literal: três prazos editados inline deixam a lista com cada tarefa na sua caixa", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList([
      makeTask({ id: "t-1", title: "Para hoje" }),
      makeTask({ id: "t-2", title: "Para esta semana" }),
      makeTask({ id: "t-3", title: "Para este mês" }),
    ]);

    const semPrazo = bucketSection("Sem prazo");
    for (const title of ["Para hoje", "Para esta semana", "Para este mês"]) {
      expect(within(semPrazo).getByText(title)).toBeInTheDocument();
    }

    const alvos: [string, string][] = [
      ["Para hoje", "2026-08-20"],
      ["Para esta semana", "2026-08-22"],
      ["Para este mês", "2026-08-27"],
    ];
    for (const [title, iso] of alvos) {
      const row = screen.getByText(title).closest(".cursor-pointer") as HTMLElement;
      await user.click(within(row).getByRole("button", { name: /\+ Prazo/ }));
      await pickDay(user, iso);
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    }

    await waitFor(() =>
      expect(within(bucketSection("Hoje")).getByText("Para hoje")).toBeInTheDocument()
    );
    expect(within(bucketSection("Esta semana")).getByText("Para esta semana")).toBeInTheDocument();
    expect(within(bucketSection("Este mês")).getByText("Para este mês")).toBeInTheDocument();
    expect(hasBucket("Sem prazo")).toBe(false);
  });

  it("o quadrante «Por prazo» e a Lista concordam depois que o popover fecha", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const project: Project = { id: "proj-1", name: "Orbyva", status: "active", tag_ids: [] };
    await renderList([makeTask({ project_id: "proj-1", title: "Tarefa do projeto" })], [project]);

    // O quadrante só aparece com um projeto específico selecionado.
    await user.click(
      within(screen.getByRole("navigation", { name: "Filtrar por projeto" })).getByRole("button", {
        name: "Orbyva",
      })
    );

    const quadrant = (await screen.findByText("Por prazo")).parentElement as HTMLElement;
    expect(within(quadrant).getByText("Sem prazo")).toBeInTheDocument();

    await user.click(dueTrigger(/\+ Prazo/));
    await pickDay(user, "2026-08-20");
    await user.keyboard("{Escape}");

    // Depois de fechar, as duas metades da tela mostram a tarefa na mesma caixa.
    await waitFor(() =>
      expect(within(bucketSection("Hoje")).getByText("Tarefa do projeto")).toBeInTheDocument()
    );
    expect(within(quadrant).getByText("Hoje")).toBeInTheDocument();
    expect(within(quadrant).queryByText("Sem prazo")).not.toBeInTheDocument();
    expect(hasBucket("Sem prazo")).toBe(false);
  });

  /** A outra metade do pedido ("colocando as prioridas, prazos cada um em cada caixa"): as caixas de
   * prioridade são o painel "Por prioridade" do quadrante. Elas já reagrupavam na hora
   * (`handlePriorityChange` sempre chamou `load()`) — o que faltava era o prazo. Este teste fixa as
   * duas coisas juntas: prioridade reagrupa, e o reagrupamento por prazo não bagunça o painel. */
  it("as caixas de prioridade acompanham junto: mudar a prioridade e o prazo deixa os dois painéis certos", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const project: Project = { id: "proj-1", name: "Orbyva", status: "active", tag_ids: [] };
    await renderList([makeTask({ project_id: "proj-1", title: "Tarefa do projeto" })], [project]);

    await user.click(
      within(screen.getByRole("navigation", { name: "Filtrar por projeto" })).getByRole("button", {
        name: "Orbyva",
      })
    );

    const byPriority = (await screen.findByText("Por prioridade")).parentElement as HTMLElement;
    // Feature 082: o cabeçalho da faixa perdeu o texto — o rótulo por extenso agora é `title`
    // (tooltip) e `aria-label` da bandeirinha. O que esta feature (081) fixa é o reagrupamento, e
    // ele continua sendo observável pela faixa que aparece/some.
    expect(within(byPriority).getByTitle("Sem prioridade")).toBeInTheDocument();

    // 1) prioridade inline → o painel "Por prioridade" reagrupa (comportamento que já existia)
    await user.click(screen.getByRole("button", { name: "Definir prioridade" }));
    // "Alta" também é um chip de filtro no topo da Lista — o clique tem de ser o de dentro do popover.
    const priorityPopover = await screen.findByRole("dialog");
    await user.click(within(priorityPopover).getByRole("button", { name: "Alta" }));

    await waitFor(() => expect(within(byPriority).getByTitle("Alta")).toBeInTheDocument());
    expect(within(byPriority).queryByTitle("Sem prioridade")).not.toBeInTheDocument();

    // 2) prazo inline → o painel de prazo reagrupa e o de prioridade continua certo
    await user.click(screen.getByRole("button", { name: /\+ Prazo/ }));
    await pickDay(user, "2026-08-20");
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(within(bucketSection("Hoje")).getByText("Tarefa do projeto")).toBeInTheDocument()
    );
    const byDue = screen.getByText("Por prazo").parentElement as HTMLElement;
    expect(within(byDue).getByText("Hoje")).toBeInTheDocument();
    expect(within(byPriority).getByTitle("Alta")).toBeInTheDocument();
    expect(store.tasks[0]).toMatchObject({ priority: "high", due_date: "2026-08-20" });
  });
});
