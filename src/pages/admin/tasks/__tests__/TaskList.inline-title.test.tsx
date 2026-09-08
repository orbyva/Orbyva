import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TaskList from "@/pages/admin/tasks/TaskList";
import { ActiveTimerProvider } from "@/hooks/useActiveTimer";
import { updateTask } from "@/api/tasks";
import type { Project, Task, TaskTimeEntry } from "@/types/tasks";

/**
 * Feature 100 — o pedido de ponta a ponta, na tela de verdade: clicar no título (e na descrição)
 * edita ali mesmo e **o dialog da tarefa não abre em momento nenhum**. Molde de
 * `TaskList.due-regroup.test.tsx`; sem Chrome (regra da skill `next`), este arquivo é a prova.
 */

const store: { tasks: Task[]; projects: Project[]; runningEntry: TaskTimeEntry | null } = {
  tasks: [],
  projects: [],
  runningEntry: null,
};

let updateShouldFail = false;

vi.mock("@/api/tasks", () => ({
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
    // `updated_at` novo a cada gravação: é o que o banco faz, e é exatamente por isso que a tela
    // **não** pode chamar `load()` aqui — com "Ordenar por → Última atualização" a linha pularia
    // para o topo no instante em que o usuário termina de digitar.
    if (index >= 0) {
      store.tasks[index] = {
        ...store.tasks[index],
        ...payload,
        updated_at: "2026-08-26T23:59:00.000Z",
      };
    }
    return undefined;
  }),
  deleteTask: vi.fn(),
  deleteTasks: vi.fn(),
  deleteTaskSeries: vi.fn(),
  createTag: vi.fn(),
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
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

function bucketSection(label: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: new RegExp(`^${label}`) });
  return heading.parentElement as HTMLElement;
}

/** Títulos das linhas da Lista, na ordem em que aparecem na tela. */
function titlesOnScreen(): string[] {
  return screen
    .getAllByRole("button", { name: /^Editar título: / })
    .map((button) => button.textContent ?? "");
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
  await screen.findByRole("button", { name: `Editar título: ${tasks[0].title}` });
  return utils;
}

describe("TaskList — editar título e descrição sem abrir o modal (feature 100)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 7, 26, 10, 0, 0));
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

  /** O pedido literal, metade um: "alterar o título (…) somente clicando no título". */
  it("clicar no título, editar e dar Enter grava `updateTask({ id, title })` — e o dialog nunca abre", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList([makeTask({ title: "Comprar pao" })]);

    await user.click(screen.getByRole("button", { name: "Editar título: Comprar pao" }));
    // O dialog completo continua fechado: nenhum campo do painel da 080 apareceu.
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.clear(screen.getByRole("textbox", { name: "Título" }));
    await user.keyboard("Comprar pão{Enter}");

    await waitFor(() =>
      expect(mockedUpdateTask).toHaveBeenCalledWith({ id: "task-1", title: "Comprar pão" })
    );
    // O card mostra o título novo...
    expect(
      await screen.findByRole("button", { name: "Editar título: Comprar pão" })
    ).toBeInTheDocument();
    // ...e o gravado no "servidor" é o mesmo.
    expect(store.tasks[0].title).toBe("Comprar pão");
    // Em momento nenhum o modal da tarefa abriu.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  /** O pedido literal, metade dois: "alterar (…) a descrição (…) somente clicando (…) na descrição". */
  it("clicar na descrição, editar e dar Ctrl+Enter grava `updateTask({ id, description })` — sem o dialog", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList([makeTask({ description: "comprar **pao**" })]);

    await user.click(screen.getByRole("button", { name: "Editar descrição: comprar pao" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.keyboard(" integral");
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() =>
      expect(mockedUpdateTask).toHaveBeenCalledWith({
        id: "task-1",
        description: "comprar **pao** integral",
      })
    );
    // De volta ao card, a prévia é sem markdown.
    expect(
      await screen.findByRole("button", { name: "Editar descrição: comprar pao integral" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("tarefa sem descrição ganha o «+ Descrição», e escrever nele grava a descrição nova", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList([makeTask({ description: null })]);

    await user.click(screen.getByRole("button", { name: "Adicionar descrição: Minha tarefa" }));
    await user.keyboard("nasceu aqui{Control>}{Enter}{/Control}");

    await waitFor(() =>
      expect(mockedUpdateTask).toHaveBeenCalledWith({ id: "task-1", description: "nasceu aqui" })
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  /**
   * A prova da decisão de **não** chamar `load()`: com "Ordenar por → Última atualização" (o padrão
   * de fábrica da 079) e o `updated_at` sendo carimbado a cada gravação, um reload jogaria a linha
   * editada para o topo. Ela tem de ficar exatamente onde estava.
   */
  it("com «Última atualização» (padrão), editar o título não move a linha de posição nem de caixa", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList([
      makeTask({ id: "t-1", title: "Mais antiga", updated_at: "2026-08-24T10:00:00.000Z" }),
      makeTask({ id: "t-2", title: "Do meio", updated_at: "2026-08-25T10:00:00.000Z" }),
      makeTask({ id: "t-3", title: "Mais recente", updated_at: "2026-08-26T09:00:00.000Z" }),
    ]);

    // O seletor está no padrão de fábrica.
    expect(screen.getByRole("button", { name: "Última atualização" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(titlesOnScreen()).toEqual(["Mais recente", "Do meio", "Mais antiga"]);
    expect(within(bucketSection("Sem prazo")).getAllByRole("button", { name: /^Editar título/ })
      ).toHaveLength(3);

    // Edita a **última** da lista.
    await user.click(screen.getByRole("button", { name: "Editar título: Mais antiga" }));
    await user.keyboard(" (corrigida){Enter}");

    await waitFor(() =>
      expect(mockedUpdateTask).toHaveBeenCalledWith({
        id: "t-1",
        title: "Mais antiga (corrigida)",
      })
    );
    // Continua em terceiro lugar, na mesma caixa — nada pulou para o topo.
    await waitFor(() =>
      expect(titlesOnScreen()).toEqual([
        "Mais recente",
        "Do meio",
        "Mais antiga (corrigida)",
      ])
    );
    expect(
      within(bucketSection("Sem prazo")).getByRole("button", {
        name: "Editar título: Mais antiga (corrigida)",
      })
    ).toBeInTheDocument();
  });

  it("`updateTask` que rejeita devolve o título antigo ao card e mostra toast destrutivo", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList([makeTask({ title: "Vai falhar" })]);

    updateShouldFail = true;
    await user.click(screen.getByRole("button", { name: "Editar título: Vai falhar" }));
    await user.keyboard(" mesmo{Enter}");

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      )
    );
    // O otimismo foi desfeito: o título antigo voltou pro card.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Editar título: Vai falhar" })).toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: "Editar título: Vai falhar mesmo" })).toBeNull();
  });

  it("título apagado por inteiro não grava nada e avisa por toast", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList([makeTask({ title: "Não pode sumir" })]);

    await user.click(screen.getByRole("button", { name: "Editar título: Não pode sumir" }));
    await user.clear(screen.getByRole("textbox", { name: "Título" }));
    await user.keyboard("{Enter}");

    expect(mockedUpdateTask).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("não pode ficar vazio"),
        variant: "destructive",
      })
    );
    // E a linha continua com o nome de antes — nada de item sem nome na lista.
    expect(
      screen.getByRole("button", { name: "Editar título: Não pode sumir" })
    ).toBeInTheDocument();
  });

  /**
   * Ocorrência de série: ao contrário do **ícone** (feature 073, que pertence à origem e propaga
   * para a série inteira), título e descrição mudam só a linha clicada — é o que o dialog completo
   * já faz hoje, e mudar isso escondido dentro de um atalho seria comportamento novo sem pedido.
   */
  it("editar o título de uma ocorrência de série chama `updateTask` só com o id daquela ocorrência", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList([
      makeTask({
        id: "occ-1",
        title: "Dose de segunda",
        recurrence_origin_id: "origem-1",
        due_date: "2026-08-26",
      }),
      makeTask({
        id: "occ-2",
        title: "Dose de terça",
        recurrence_origin_id: "origem-1",
        due_date: "2026-08-27",
      }),
    ]);

    // A Lista mostra **uma** ocorrência por série (`collapseRecurringSeries`): a próxima em aberto.
    expect(titlesOnScreen()).toEqual(["Dose de segunda"]);

    await user.click(screen.getByRole("button", { name: "Editar título: Dose de segunda" }));
    await user.keyboard(" (só esta){Enter}");

    await waitFor(() => expect(mockedUpdateTask).toHaveBeenCalledTimes(1));
    expect(mockedUpdateTask).toHaveBeenCalledWith({
      id: "occ-1",
      title: "Dose de segunda (só esta)",
    });
    // A irmã da série não foi tocada no "servidor" — nenhuma propagação, ao contrário do ícone.
    expect(store.tasks.find((t) => t.id === "occ-2")?.title).toBe("Dose de terça");
  });

  it("na seção «Concluídas» a edição inline também funciona (corrigir o nome de algo feito faz sentido)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList([
      makeTask({ id: "t-1", title: "Pendente" }),
      makeTask({
        id: "t-2",
        title: "Ja feita",
        status: "done",
        completed_at: "2026-08-25T10:00:00.000Z",
      }),
    ]);

    // A barra tem vários `combobox` (projeto, tag, status); o de status é o que mostra "Pendentes".
    const statusSelect = screen
      .getAllByRole("combobox")
      .find((el) => el.textContent?.includes("Pendentes")) as HTMLElement;
    await user.click(statusSelect);
    await user.click(await screen.findByRole("option", { name: "Concluídas" }));

    await user.click(await screen.findByRole("button", { name: "Editar título: Ja feita" }));
    await user.clear(screen.getByRole("textbox", { name: "Título" }));
    await user.keyboard("Já feita{Enter}");

    await waitFor(() =>
      expect(mockedUpdateTask).toHaveBeenCalledWith({ id: "t-2", title: "Já feita" })
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("o dialog completo continua a um clique: o lápis da linha abre o formulário de sempre", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = await renderList([makeTask({ title: "Abrir pelo lápis" })]);

    const pencil = container.querySelector("svg.lucide-pen")?.closest("button") as HTMLButtonElement;
    await user.click(pencil);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/Título/)).toHaveValue("Abrir pelo lápis");
  });
});
