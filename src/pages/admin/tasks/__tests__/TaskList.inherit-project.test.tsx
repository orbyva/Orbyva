import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TaskList from "@/pages/admin/tasks/TaskList";
import { ActiveTimerProvider } from "@/hooks/useActiveTimer";
import { createTask } from "@/api/tasks";
import { TASK_PROJECT_FILTER_STORAGE_KEY } from "@/lib/taskProjectFilterPreference";
import type { Project, ProjectEvent, Task, TaskTimeEntry } from "@/types/tasks";

/**
 * Feature 099 — "ao criar uma tarefa, se eu estou selecionando o filtro do projeto para aquela
 * tarefa, ela deve ser criada com aquele projeto marcado". Molde de
 * `TaskList.project-filter.test.tsx` (que já monta projetos e mexe no `<Select>` de Projeto).
 *
 * Prova por DOM (a skill `next` proíbe Chrome) que o filtro de projeto ativo semeia o
 * `project_id` da tarefa nova — no formulário completo e no quick add — sem virar uma trava.
 */

const store: {
  tasks: Task[];
  projects: Project[];
  events: ProjectEvent[];
  runningEntry: TaskTimeEntry | null;
} = { tasks: [], projects: [], events: [], runningEntry: null };

vi.mock("@/pages/admin/tasks/GanttChart", () => ({
  GanttChart: () => <div />,
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

/** Os dois projetos do pedido: o usuário está olhando o recorte de "Casa" e cria ali. */
const CASA: Project = { id: "p-casa", name: "Casa", status: "active", tag_ids: [] };
const TRABALHO: Project = { id: "p-trabalho", name: "Trabalho", status: "active", tag_ids: [] };

const TODAY = "2026-08-20";

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

const DA_CASA = "Tarefa da Casa";
const DO_TRABALHO = "Tarefa do Trabalho";

const SEED: Task[] = [
  makeTask({ id: "t-casa", title: DA_CASA, project_id: CASA.id }),
  makeTask({ id: "t-trabalho", title: DO_TRABALHO, project_id: TRABALHO.id }),
];

async function renderList() {
  const utils = render(
    <MemoryRouter>
      <ActiveTimerProvider>
        <TaskList />
      </ActiveTimerProvider>
    </MemoryRouter>
  );
  // O `<Select>` de projeto só lista os projetos depois do `load()`; esperar por uma tarefa
  // garante que `projects` já chegou.
  await screen.findAllByText(DA_CASA);
  return utils;
}

function projectTrigger(): HTMLElement {
  return screen.getByRole("combobox", { name: "Projeto" });
}

async function escolherProjeto(user: ReturnType<typeof userEvent.setup>, nome: string) {
  await user.click(projectTrigger());
  await user.click(await screen.findByRole("option", { name: nome }));
}

/** Abre o formulário completo (o mesmo botão do `PageShell`) e escopa as queries ao dialog. */
async function abrirNovaTarefa(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole("button", { name: "Nova tarefa" })[0]);
  return within(await screen.findByRole("dialog"));
}

describe("TaskList — a tarefa nova herda o projeto do filtro (feature 099)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 7, 20, 10, 0, 0));
    localStorage.clear();
    toastMock.mockReset();
    store.tasks = SEED.map((t) => ({ ...t }));
    store.projects = [CASA, TRABALHO];
    store.events = [];
    store.runningEntry = null;
    // `createTask` grava no "servidor" fake, pra tarefa criada aparecer no `load()` seguinte —
    // é assim que dá pra provar que ela continua visível no recorte em que nasceu.
    vi.mocked(createTask).mockImplementation(async (payload) => {
      const created = makeTask({
        ...payload,
        id: `nova-${store.tasks.length + 1}`,
      } as Partial<Task>);
      store.tasks.push(created);
      return created;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("com o filtro em «Casa», «Nova tarefa» abre com «Casa» já escolhido no ProjectPicker", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList();

    await escolherProjeto(user, "Casa");
    const panel = await abrirNovaTarefa(user);

    // O badge do campo Projeto já mostra o projeto do filtro — sem o usuário reescolher nada.
    const badge = panel.getByRole("button", { name: "Casa" });
    expect(badge).toBeInTheDocument();

    // E, aberto o picker, é "Casa" que está marcada (e não "Sem projeto").
    await user.click(badge);
    const picker = within(await screen.findByRole("listbox", { name: "Projeto" }));
    expect(picker.getByRole("option", { name: "Casa" })).toHaveAttribute("aria-selected", "true");
    expect(picker.getByRole("option", { name: "Sem projeto" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  /** O pedido literal, de ponta a ponta: o que chega no banco é uma tarefa **do projeto do
   * filtro** — e ela continua visível no recorte em que foi criada. */
  it("salvar o formulário grava `project_id` do projeto filtrado, e a tarefa fica no recorte", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList();

    await escolherProjeto(user, "Casa");
    const panel = await abrirNovaTarefa(user);
    await user.type(panel.getByLabelText(/^Título/), "Comprar pão");
    await user.click(screen.getByRole("button", { name: "Criar tarefa" }));

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Comprar pão", project_id: CASA.id })
    );

    // …e o desfecho que o pedido quer: ela **não** some da lista que o usuário estava olhando.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await screen.findAllByText("Comprar pão");
    expect(screen.queryByText(DO_TRABALHO)).toBeNull();
  });

  /** Os dois valores que **não** são projeto continuam criando sem projeto — de propósito:
   * "Todos" não é um projeto, e "Sem projeto" é literalmente o recorte escolhido. É o
   * comportamento de antes da feature, e a feature não pode tê-lo mudado. */
  it.each(["Todos os projetos", "Sem projeto"])(
    "com o filtro em «%s», o formulário abre sem projeto e grava `project_id: null`",
    async (opcao) => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await renderList();

      await escolherProjeto(user, opcao);
      const panel = await abrirNovaTarefa(user);

      expect(panel.getByRole("button", { name: "Sem projeto" })).toBeInTheDocument();

      await user.type(panel.getByLabelText(/^Título/), "Comprar pão");
      await user.click(screen.getByRole("button", { name: "Criar tarefa" }));

      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Comprar pão", project_id: null })
      );
    }
  );

  /** A trilha da esquerda alimenta o **mesmo** `projectFilter` (`handleProjectFilterChange`), e é
   * o gesto mais provável antes de "e agora crio uma tarefa aqui" — então ela semeia de graça. */
  it("escolher o projeto pela ProjectsRail (e não pelo `<Select>`) semeia igual", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList();

    const trilha = within(screen.getByRole("navigation", { name: "Filtrar por projeto" }));
    await user.click(trilha.getByRole("button", { name: "Casa" }));
    expect(projectTrigger()).toHaveTextContent("Casa");

    const panel = await abrirNovaTarefa(user);
    expect(panel.getByRole("button", { name: "Casa" })).toBeInTheDocument();

    await user.type(panel.getByLabelText(/^Título/), "Comprar pão");
    await user.click(screen.getByRole("button", { name: "Criar tarefa" }));

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Comprar pão", project_id: CASA.id })
    );
  });

  /** Palpite, não trava: o `ProjectPicker` continua mandando no rascunho. */
  it("trocar para «Sem projeto» no formulário vence o filtro e grava `project_id: null`", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList();

    await escolherProjeto(user, "Casa");
    const panel = await abrirNovaTarefa(user);

    await user.click(panel.getByRole("button", { name: "Casa" }));
    const picker = within(await screen.findByRole("listbox", { name: "Projeto" }));
    await user.click(picker.getByRole("option", { name: "Sem projeto" }));

    expect(panel.getByRole("button", { name: "Sem projeto" })).toBeInTheDocument();

    await user.type(panel.getByLabelText(/^Título/), "Comprar pão");
    await user.click(screen.getByRole("button", { name: "Criar tarefa" }));

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Comprar pão", project_id: null })
    );
  });

  /** Só o **valor inicial** é semeado: com o dialog aberto, mexer na barra recorta a lista atrás
   * do dialog, mas não reescreve o rascunho que o usuário já está preenchendo. */
  it("trocar o filtro da barra com o dialog aberto não mexe no rascunho", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList();

    await escolherProjeto(user, "Casa");
    const panel = await abrirNovaTarefa(user);
    await user.type(panel.getByLabelText(/^Título/), "Comprar pão");

    // O dialog é modal: o resto da tela fica `aria-hidden`, então a troca do filtro é disparada
    // direto no controle da trilha (o mesmo `handleProjectFilterChange` do `<Select>`).
    const trilha = within(
      screen.getByRole("navigation", { name: "Filtrar por projeto", hidden: true })
    );
    fireEvent.click(trilha.getByRole("button", { name: "Trabalho", hidden: true }));

    // O rascunho continua no projeto de quando o formulário abriu.
    expect(panel.getByRole("button", { name: "Casa" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Criar tarefa" }));
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Comprar pão", project_id: CASA.id })
    );
  });

  /** Reabrir semeia de novo, com o filtro **de então** — o palpite acompanha o recorte atual. */
  it("reabrir o formulário semeia com o filtro de então", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList();

    await escolherProjeto(user, "Casa");
    let panel = await abrirNovaTarefa(user);
    expect(panel.getByRole("button", { name: "Casa" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await escolherProjeto(user, "Trabalho");
    panel = await abrirNovaTarefa(user);
    expect(panel.getByRole("button", { name: "Trabalho" })).toBeInTheDocument();
  });

  /** Nenhum id morto chega ao `createTask`: `normalizeProjectFilter` derruba a preferência para
   * "all" assim que os projetos carregam, e a tarefa nova sai sem projeto — não com o id de um
   * projeto que não existe mais (o banco recusaria a FK, e o usuário só veria "erro ao salvar"). */
  it("preferência apontando para um projeto apagado não vaza o id morto para a tarefa nova", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    localStorage.setItem(TASK_PROJECT_FILTER_STORAGE_KEY, "p-apagado");
    await renderList();

    await waitFor(() =>
      expect(localStorage.getItem(TASK_PROJECT_FILTER_STORAGE_KEY)).toBe("all")
    );

    const panel = await abrirNovaTarefa(user);
    expect(panel.getByRole("button", { name: "Sem projeto" })).toBeInTheDocument();

    await user.type(panel.getByLabelText(/^Título/), "Comprar pão");
    await user.click(screen.getByRole("button", { name: "Criar tarefa" }));

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Comprar pão", project_id: null })
    );
    expect(vi.mocked(createTask).mock.calls[0][0].project_id).not.toBe("p-apagado");
  });

  /** O outro caminho de criação da Lista — o `+` da feature 098. Ele não sabe o que é filtro:
   * recebe `projectId` por prop e devolve o mesmo valor no payload; quem traduz é a 099. */
  it("o quick add também nasce no projeto do filtro, e a tarefa fica no recorte", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList();

    await escolherProjeto(user, "Casa");
    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    await user.keyboard("Comprar pão{Enter}");

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Comprar pão", project_id: CASA.id })
    );
    // Continua visível no recorte em que foi criada — o feedback que o pedido pede.
    await screen.findAllByText("Comprar pão");
    expect(screen.queryByText(DO_TRABALHO)).toBeNull();
  });

  it("com o filtro em «Todos os projetos», o quick add continua criando sem projeto", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList();

    await user.click(screen.getByRole("button", { name: "Adicionar tarefa rápida" }));
    await user.keyboard("Comprar pão{Enter}");

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Comprar pão", project_id: null })
    );
  });
});

/**
 * Subtarefa mora onde a mãe mora (regra da 036) — o filtro não pode ganhar dela. A situação
 * literal "filtro apontando para um projeto **e** a mãe sendo de outro" não é alcançável pela
 * tela (o próprio filtro esconde a mãe), então a divergência é provada pelo outro lado: com o
 * filtro em "Todos os projetos" o palpite da 099 vale `null`, e a subtarefa tem de nascer no
 * projeto da mãe assim mesmo.
 */
describe("TaskList — subtarefa continua herdando da mãe, não do filtro (feature 099)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 7, 20, 10, 0, 0));
    localStorage.clear();
    toastMock.mockReset();
    store.tasks = SEED.map((t) => ({ ...t }));
    store.projects = [CASA, TRABALHO];
    store.events = [];
    store.runningEntry = null;
    vi.mocked(createTask).mockImplementation(async (payload) =>
      makeTask({ ...payload, id: "nova-sub" } as Partial<Task>)
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  /** Digita no input de subtarefa do card do Kanban daquela tarefa. */
  async function adicionarSubtarefaNoCard(
    user: ReturnType<typeof userEvent.setup>,
    tituloDaMae: string,
    titulo: string
  ) {
    await user.click(screen.getByRole("tab", { name: "Kanban" }));
    const card = (await screen.findByText(tituloDaMae)).closest("article") as HTMLElement;
    await user.type(within(card).getByPlaceholderText("Adicionar subtarefa"), `${titulo}{Enter}`);
  }

  it("com o filtro em «Todos os projetos» (palpite `null`), a subtarefa nasce no projeto da mãe", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList();

    await adicionarSubtarefaNoCard(user, DO_TRABALHO, "Passo 1");

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Passo 1",
        parent_task_id: "t-trabalho",
        project_id: TRABALHO.id,
      })
    );
  });

  it("com o filtro em «Casa», a subtarefa do card da Casa continua na Casa", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList();

    await escolherProjeto(user, "Casa");
    await adicionarSubtarefaNoCard(user, DA_CASA, "Passo 1");

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Passo 1",
        parent_task_id: "t-casa",
        project_id: CASA.id,
      })
    );
  });
});
