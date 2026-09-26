import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TaskList from "@/pages/admin/tasks/TaskList";
import { ActiveTimerProvider } from "@/hooks/useActiveTimer";
import { TASK_PROJECT_FILTER_STORAGE_KEY } from "@/lib/taskProjectFilterPreference";
import type { Project, ProjectEvent, Task, TaskTimeEntry } from "@/types/tasks";

/**
 * Feature 097 — um filtro de projeto só, valendo nas quatro abas, e que sobrevive à sessão.
 *
 * Prova por DOM (a skill `next` proíbe Chrome) que: o `<Select>` de Projeto aparece nas quatro
 * abas e o de Tag continua fora da Agenda; o recorte escolhido na Lista continua valendo no
 * Kanban, no Gantt e na Agenda (e a Agenda não desenha um segundo seletor); a escolha sobrevive a
 * remontar a tela; um id de projeto apagado cai para "Todos os projetos" reescrevendo a
 * preferência; e "Limpar filtro" existe justamente porque a preferência agora persiste.
 */

const store: {
  tasks: Task[];
  projects: Project[];
  events: ProjectEvent[];
  runningEntry: TaskTimeEntry | null;
} = { tasks: [], projects: [], events: [], runningEntry: null };

/** O Gantt real monta um `<canvas>` (crasha em jsdom, ver `GanttChart.test.tsx`). Aqui só interessa
 * **qual conjunto de tarefas** a aba recebe depois do filtro, então o dublê lista os títulos. */
vi.mock("@/pages/admin/tasks/GanttChart", () => ({
  GanttChart: ({ tasks }: { tasks: { id: string; title: string }[] }) => (
    <ul aria-label="Gantt">
      {tasks.map((task) => (
        <li key={task.id}>{task.title}</li>
      ))}
    </ul>
  ),
}));

vi.mock("@/api/tasks", () => ({
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchTasks: vi.fn(async () => store.tasks.map((t) => ({ ...t }))),
  fetchProjects: vi.fn(async () => store.projects.map((p) => ({ ...p }))),
  fetchProjectEvents: vi.fn(async () => store.events.map((e) => ({ ...e }))),
  fetchTags: vi.fn(async () => []),
  fetchDependencies: vi.fn(async () => []),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  updateTasksSortOrder: vi.fn(),
  deleteTask: vi.fn(),
  deleteTasks: vi.fn(),
  deleteTaskSeries: vi.fn(),
  countTaskSeries: vi.fn().mockResolvedValue(0),
  deleteProjectEvent: vi.fn(),
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
  fetchMedications: vi.fn(async () => []),
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

const { fetchProjects } = await import("@/api/tasks");
const mockedFetchProjects = vi.mocked(fetchProjects);

/** Quinta, 20/08/2026 — a mesma data das outras suítes da tela; as tarefas vencem hoje, então
 * aparecem tanto no bucket "Hoje" da Lista quanto na célula do dia da Agenda. */
const TODAY = "2026-08-20";

const ALPHA: Project = { id: "p-alpha", name: "Alpha", status: "active", tag_ids: [] };
const BETA: Project = { id: "p-beta", name: "Beta", status: "active", tag_ids: [] };

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Tarefa",
    status: "todo",
    tag_ids: [],
    due_date: TODAY,
    due_time: null,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    ...overrides,
  };
}

const DO_ALPHA = "Tarefa do Alpha";
const DO_BETA = "Tarefa do Beta";
const SEM_PROJETO = "Tarefa sem projeto";
const TITULOS = [DO_ALPHA, DO_BETA, SEM_PROJETO];

const SEED: Task[] = [
  makeTask({ id: "t-alpha", title: DO_ALPHA, project_id: ALPHA.id }),
  makeTask({ id: "t-beta", title: DO_BETA, project_id: BETA.id }),
  makeTask({ id: "t-sem", title: SEM_PROJETO }),
];

/** Quais dos títulos conhecidos estão na tela agora — vale em qualquer aba, e não se confunde com
 * o painel "Por prioridade" da Lista, que repete o título da mesma tarefa (feature 082). */
function titulosNaTela(): string[] {
  return TITULOS.filter((title) => screen.queryAllByText(title).length > 0);
}

function projectTrigger(): HTMLElement {
  return screen.getByRole("combobox", { name: "Projeto" });
}

function tagTrigger(): HTMLElement | null {
  return screen.queryAllByRole("combobox").find((el) => el.textContent?.includes("tags")) ?? null;
}

async function escolherProjeto(user: ReturnType<typeof userEvent.setup>, nome: string) {
  await user.click(projectTrigger());
  await user.click(await screen.findByRole("option", { name: nome }));
}

async function irParaAba(user: ReturnType<typeof userEvent.setup>, nome: string) {
  await user.click(screen.getByRole("tab", { name: nome }));
}

async function renderList() {
  const utils = render(
    <MemoryRouter>
      <ActiveTimerProvider>
        <TaskList />
      </ActiveTimerProvider>
    </MemoryRouter>
  );
  // O `<Select>` de projeto só lista os projetos depois do `load()`.
  await screen.findByText(SEM_PROJETO);
  return utils;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 20, 10, 0, 0));
  localStorage.clear();
  toastMock.mockReset();
  store.tasks = SEED.map((t) => ({ ...t }));
  store.projects = [ALPHA, BETA];
  store.events = [];
  store.runningEntry = null;
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("TaskList — o filtro de projeto vale nas quatro visões (feature 097)", () => {
  it("o `<Select>` de Projeto está nas quatro abas; o de Tag, em três", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList();

    for (const aba of ["Lista", "Kanban", "Gantt"]) {
      await irParaAba(user, aba);
      expect(projectTrigger()).toBeInTheDocument();
      expect(tagTrigger()).not.toBeNull();
    }

    await irParaAba(user, "Agenda");
    expect(projectTrigger()).toBeInTheDocument();
    // A Agenda não filtra por tag em lugar nenhum — o controle não é entregue à toa.
    expect(tagTrigger()).toBeNull();
    // E o `<Select>` de projeto **não** aparece duas vezes: a grade controlada esconde o dela.
    expect(screen.getAllByRole("combobox", { name: "Projeto" })).toHaveLength(1);
  });

  it("escolher um projeto na Lista mantém o mesmo recorte no Kanban, no Gantt e na Agenda", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList();

    expect(titulosNaTela()).toEqual(TITULOS);
    await escolherProjeto(user, "Alpha");
    expect(titulosNaTela()).toEqual([DO_ALPHA]);

    for (const aba of ["Kanban", "Gantt", "Agenda"]) {
      await irParaAba(user, aba);
      expect(projectTrigger()).toHaveTextContent("Alpha");
      expect(titulosNaTela()).toEqual([DO_ALPHA]);
    }

    // E a volta: o recorte não se perde ao retornar para a Lista.
    await irParaAba(user, "Lista");
    expect(titulosNaTela()).toEqual([DO_ALPHA]);
  });

  it("«Sem projeto» também é o mesmo recorte nas quatro abas", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList();

    await escolherProjeto(user, "Sem projeto");
    expect(titulosNaTela()).toEqual([SEM_PROJETO]);

    for (const aba of ["Kanban", "Gantt", "Agenda"]) {
      await irParaAba(user, aba);
      expect(titulosNaTela()).toEqual([SEM_PROJETO]);
    }
  });

  it("trocar de aba não zera o recorte nem reescreve a preferência", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList();

    await escolherProjeto(user, "Beta");
    expect(localStorage.getItem(TASK_PROJECT_FILTER_STORAGE_KEY)).toBe(BETA.id);

    await irParaAba(user, "Agenda");
    await irParaAba(user, "Lista");

    expect(localStorage.getItem(TASK_PROJECT_FILTER_STORAGE_KEY)).toBe(BETA.id);
    expect(titulosNaTela()).toEqual([DO_BETA]);
  });
});

describe("TaskList — o filtro de projeto sobrevive à sessão (feature 097)", () => {
  it("a escolha sobrevive a remontar a tela", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = await renderList();

    await escolherProjeto(user, "Alpha");
    expect(localStorage.getItem(TASK_PROJECT_FILTER_STORAGE_KEY)).toBe(ALPHA.id);

    unmount();
    render(
      <MemoryRouter>
        <ActiveTimerProvider>
          <TaskList />
        </ActiveTimerProvider>
      </MemoryRouter>
    );

    await screen.findAllByText(DO_ALPHA);
    expect(projectTrigger()).toHaveTextContent("Alpha");
    expect(titulosNaTela()).toEqual([DO_ALPHA]);
  });

  it("id salvo de um projeto que não existe mais cai para «Todos os projetos» e reescreve a chave", async () => {
    localStorage.setItem(TASK_PROJECT_FILTER_STORAGE_KEY, "p-apagado");

    await renderList();

    await waitFor(() =>
      expect(localStorage.getItem(TASK_PROJECT_FILTER_STORAGE_KEY)).toBe("all")
    );
    expect(projectTrigger()).toHaveTextContent("Todos os projetos");
    // Nada de tela vazia por causa de um projeto que sumiu.
    expect(titulosNaTela()).toEqual(TITULOS);
  });

  it("«Limpar filtro de projeto» volta para «all», grava e some da barra", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList();

    // Sem filtro não há botão: ele é o aviso de que o recorte está ligado.
    expect(screen.queryByRole("button", { name: "Limpar filtro de projeto" })).toBeNull();

    await escolherProjeto(user, "Alpha");
    const limpar = screen.getByRole("button", { name: "Limpar filtro de projeto" });
    expect(limpar).toHaveAttribute("title", "Limpar filtro de projeto");

    await user.click(limpar);

    expect(localStorage.getItem(TASK_PROJECT_FILTER_STORAGE_KEY)).toBe("all");
    expect(projectTrigger()).toHaveTextContent("Todos os projetos");
    expect(titulosNaTela()).toEqual(TITULOS);
    expect(screen.queryByRole("button", { name: "Limpar filtro de projeto" })).toBeNull();
  });

  it("o botão de limpar também aparece na aba Agenda, que é onde o recorte esconde mais coisa", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList();

    await escolherProjeto(user, "Alpha");
    await irParaAba(user, "Agenda");

    await user.click(screen.getByRole("button", { name: "Limpar filtro de projeto" }));
    expect(titulosNaTela()).toEqual(TITULOS);
  });
});

describe("TaskList — estados e bordas da barra de filtro (feature 097)", () => {
  it("sem projeto nenhum cadastrado, o `<Select>` oferece só as duas opções fixas", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    store.projects = [];
    await renderList();

    await user.click(projectTrigger());
    const opcoes = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(opcoes).toEqual(["Todos os projetos", "Sem projeto"]);
  });

  it("enquanto a carga está em voo o filtro salvo não pisca de volta para «all»", async () => {
    localStorage.setItem(TASK_PROJECT_FILTER_STORAGE_KEY, ALPHA.id);
    let liberarProjetos: (projects: Project[]) => void = () => {};
    mockedFetchProjects.mockImplementationOnce(
      () => new Promise<Project[]>((resolve) => (liberarProjetos = resolve))
    );

    render(
      <MemoryRouter>
        <ActiveTimerProvider>
          <TaskList />
        </ActiveTimerProvider>
      </MemoryRouter>
    );

    // Ainda carregando: o controle está de pé e utilizável, e a preferência continua intacta —
    // lista de projetos vazia em voo não é prova de projeto apagado.
    expect(projectTrigger()).toBeEnabled();
    expect(localStorage.getItem(TASK_PROJECT_FILTER_STORAGE_KEY)).toBe(ALPHA.id);

    liberarProjetos([ALPHA, BETA]);

    await screen.findAllByText(DO_ALPHA);
    expect(projectTrigger()).toHaveTextContent("Alpha");
    expect(localStorage.getItem(TASK_PROJECT_FILTER_STORAGE_KEY)).toBe(ALPHA.id);
  });

  it("nome de projeto longo não estica a barra: o gatilho continua `w-44` e corta o texto", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const nomeLongo = "Reforma completa do apartamento da praia com varanda gourmet";
    store.projects = [{ ...ALPHA, name: nomeLongo }];

    await renderList();
    await escolherProjeto(user, nomeLongo);

    const trigger = projectTrigger();
    expect(trigger.className).toContain("w-44");
    // O valor mora num `<span>` filho direto do gatilho, e o `SelectTrigger` da casa aplica
    // `line-clamp-1` nele — é o que impede o nome de empurrar a barra.
    const valor = trigger.querySelector("span") as HTMLElement;
    expect(valor).toHaveTextContent("Reforma completa do apartamento");
    expect(trigger.className).toContain("[&>span]:line-clamp-1");
  });
});

describe("TaskList — a trilha de projetos alimenta o mesmo filtro (feature 097)", () => {
  function railButton(name: string): HTMLElement {
    return within(screen.getByRole("navigation", { name: "Filtrar por projeto" })).getByRole(
      "button",
      { name }
    );
  }

  it("clicar num projeto na trilha recorta Kanban e Agenda, e grava a preferência", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList();

    await user.click(railButton("Alpha"));

    expect(localStorage.getItem(TASK_PROJECT_FILTER_STORAGE_KEY)).toBe(ALPHA.id);
    expect(projectTrigger()).toHaveTextContent("Alpha");

    await irParaAba(user, "Kanban");
    expect(titulosNaTela()).toEqual([DO_ALPHA]);
    await irParaAba(user, "Agenda");
    expect(titulosNaTela()).toEqual([DO_ALPHA]);
  });

  it("clicar no projeto já ativo volta para «all» e grava", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList();

    await user.click(railButton("Alpha"));
    expect(railButton("Alpha")).toHaveAttribute("aria-current", "true");

    await user.click(railButton("Alpha"));

    expect(localStorage.getItem(TASK_PROJECT_FILTER_STORAGE_KEY)).toBe("all");
    expect(projectTrigger()).toHaveTextContent("Todos os projetos");
    expect(titulosNaTela()).toEqual(TITULOS);
  });
});
