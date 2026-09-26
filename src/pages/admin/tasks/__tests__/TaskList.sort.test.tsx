import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TaskList from "@/pages/admin/tasks/TaskList";
import { ActiveTimerProvider } from "@/hooks/useActiveTimer";
import { TASK_SORT_STORAGE_KEY } from "@/lib/taskSortPreference";
import type { Project, Task, TaskTimeEntry } from "@/types/tasks";

/**
 * Feature 079 — seletor "Ordenar por" da Lista. Prova por DOM (a skill `next` proíbe Chrome) que:
 * o padrão de fábrica já é "última atualização", que "Prazo" devolve a ordem antiga, que a escolha
 * sobrevive a remontar, que o Kanban obedece ao mesmo seletor e que "Concluídas" fica de fora.
 */

const store: { tasks: Task[]; runningEntry: TaskTimeEntry | null } = {
  tasks: [],
  runningEntry: null,
};

vi.mock("@/api/tasks", () => ({
  // Feature 085: os donos do formulário/lista carregam e gravam os links externos.
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

/**
 * Hoje é 20/08/2026 (quinta). 25–27/08 caem todas no mesmo bucket ("Este mês", já que a semana
 * termina no sábado 22): é o que permite ver **a ordem dentro de uma caixa** mudar, que é o que a
 * feature promete — as caixas de prazo continuam sendo as mesmas.
 *
 * A ordem de chegada do "servidor" é a de prazo (Alfa, Beta, Gama) e a de atualização é outra
 * (Beta, Gama, Alfa) de propósito: assim nenhum dos dois resultados pode ser acidente da ordem
 * do array.
 */
const SAME_BUCKET_TASKS: Task[] = [
  makeTask({
    id: "t-alfa",
    title: "Alfa",
    due_date: "2026-08-25",
    created_at: "2026-08-01T08:00:00Z",
    updated_at: "2026-08-19T09:00:00Z",
  }),
  makeTask({
    id: "t-beta",
    title: "Beta",
    due_date: "2026-08-26",
    created_at: "2026-08-02T08:00:00Z",
    updated_at: "2026-08-19T11:00:00Z",
  }),
  makeTask({
    id: "t-gama",
    title: "Gama",
    due_date: "2026-08-27",
    created_at: "2026-08-03T08:00:00Z",
    updated_at: "2026-08-19T10:00:00Z",
  }),
];

/** Bloco (`div` com o `h3` do bucket/coluna + as linhas). */
function sectionByHeading(label: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: new RegExp(`^${label}`) });
  return heading.parentElement as HTMLElement;
}

/** Títulos na ordem em que aparecem no DOM dentro de um bloco. */
function titlesIn(section: HTMLElement, titles: string[]): string[] {
  return within(section)
    .getAllByText(new RegExp(`^(${titles.join("|")})$`))
    .map((el) => el.textContent ?? "");
}

function sortButton(label: string): HTMLElement {
  return within(screen.getByRole("group", { name: "Ordenar por" })).getByRole("button", {
    name: label,
  });
}

/** `awaitTitle` é o texto que prova que o `load()` terminou. Com só tarefas concluídas ele precisa
 * ser outro (a Lista abre em "Pendentes", então nenhum título aparece antes de trocar o filtro). */
async function renderList(tasks: Task[], awaitTitle = tasks[0].title) {
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

describe("TaskList — ordenar por última atualização (feature 079)", () => {
  beforeEach(() => {
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

  it("padrão de fábrica (sem preferência salva): a lista já sai por última atualização", async () => {
    await renderList(SAME_BUCKET_TASKS);

    expect(localStorage.getItem(TASK_SORT_STORAGE_KEY)).toBeNull();
    expect(sortButton("Última atualização")).toHaveAttribute("aria-pressed", "true");
    expect(sortButton("Prazo")).toHaveAttribute("aria-pressed", "false");
    expect(titlesIn(sectionByHeading("Este mês"), ["Alfa", "Beta", "Gama"])).toEqual([
      "Beta",
      "Gama",
      "Alfa",
    ]);
  });

  it("dentro do bucket «Hoje», a tarefa editada por último aparece primeiro", async () => {
    await renderList([
      makeTask({ id: "h-1", title: "Primeira editada", due_date: "2026-08-20", updated_at: "2026-08-20T08:00:00Z" }),
      makeTask({ id: "h-2", title: "Editada agora", due_date: "2026-08-20", updated_at: "2026-08-20T09:45:00Z" }),
      makeTask({ id: "h-3", title: "Editada ontem", due_date: "2026-08-20", updated_at: "2026-08-19T22:00:00Z" }),
    ]);

    expect(
      titlesIn(sectionByHeading("Hoje"), ["Primeira editada", "Editada agora", "Editada ontem"])
    ).toEqual(["Editada agora", "Primeira editada", "Editada ontem"]);
  });

  it("trocar para «Prazo» restaura a ordem por data, e voltar desfaz", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList(SAME_BUCKET_TASKS);

    await user.click(sortButton("Prazo"));

    expect(sortButton("Prazo")).toHaveAttribute("aria-pressed", "true");
    expect(sortButton("Última atualização")).toHaveAttribute("aria-pressed", "false");
    expect(titlesIn(sectionByHeading("Este mês"), ["Alfa", "Beta", "Gama"])).toEqual([
      "Alfa",
      "Beta",
      "Gama",
    ]);

    await user.click(sortButton("Última atualização"));
    expect(titlesIn(sectionByHeading("Este mês"), ["Alfa", "Beta", "Gama"])).toEqual([
      "Beta",
      "Gama",
      "Alfa",
    ]);
  });

  it("as caixas de prazo continuam as mesmas nas duas ordenações", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList([
      ...SAME_BUCKET_TASKS,
      makeTask({ id: "t-hoje", title: "Delta", due_date: "2026-08-20", updated_at: "2026-08-20T09:00:00Z" }),
      makeTask({ id: "t-sem", title: "Epsilon", updated_at: "2026-08-20T09:30:00Z" }),
    ]);

    for (const label of ["Última atualização", "Prazo"]) {
      await user.click(sortButton(label));
      expect(within(sectionByHeading("Hoje")).getByText("Delta")).toBeInTheDocument();
      expect(within(sectionByHeading("Sem prazo")).getByText("Epsilon")).toBeInTheDocument();
      expect(titlesIn(sectionByHeading("Este mês"), ["Alfa", "Beta", "Gama"])).toHaveLength(3);
    }
  });

  it("a escolha sobrevive a remontar o componente (fica salva no navegador)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = await renderList(SAME_BUCKET_TASKS);

    await user.click(sortButton("Prazo"));
    expect(localStorage.getItem(TASK_SORT_STORAGE_KEY)).toBe("due");

    unmount();
    await renderList(SAME_BUCKET_TASKS);

    expect(sortButton("Prazo")).toHaveAttribute("aria-pressed", "true");
    expect(titlesIn(sectionByHeading("Este mês"), ["Alfa", "Beta", "Gama"])).toEqual([
      "Alfa",
      "Beta",
      "Gama",
    ]);
  });

  it("as colunas do Kanban seguem o mesmo seletor", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderList(SAME_BUCKET_TASKS);

    await user.click(screen.getByRole("tab", { name: "Kanban" }));
    expect(titlesIn(sectionByHeading("A fazer"), ["Alfa", "Beta", "Gama"])).toEqual([
      "Beta",
      "Gama",
      "Alfa",
    ]);

    // O seletor mora na aba Lista; a escolha feita lá vale para o Kanban.
    await user.click(screen.getByRole("tab", { name: "Lista" }));
    await user.click(sortButton("Prazo"));
    await user.click(screen.getByRole("tab", { name: "Kanban" }));

    expect(titlesIn(sectionByHeading("A fazer"), ["Alfa", "Beta", "Gama"])).toEqual([
      "Alfa",
      "Beta",
      "Gama",
    ]);
  });

  it("«Concluídas» continua por completed_at desc nas duas ordenações", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // `completed_at` e `updated_at` deliberadamente em ordens opostas: se a seção passasse a usar
    // o comparador novo, a ordem viraria.
    await renderList([
      makeTask({
        id: "d-1",
        title: "Terminada por último",
        status: "done",
        due_date: "2026-08-18",
        completed_at: "2026-08-19T18:00:00Z",
        updated_at: "2026-08-10T10:00:00Z",
      }),
      makeTask({
        id: "d-2",
        title: "Terminada antes",
        status: "done",
        due_date: "2026-08-17",
        completed_at: "2026-08-17T18:00:00Z",
        updated_at: "2026-08-20T10:00:00Z",
      }),
    ], "Nenhuma tarefa");

    // A barra tem vários `combobox` (projeto, tag, status); o de status é o que mostra "Pendentes".
    const statusSelect = screen
      .getAllByRole("combobox")
      .find((el) => el.textContent?.includes("Pendentes")) as HTMLElement;
    await user.click(statusSelect);
    await user.click(await screen.findByRole("option", { name: "Concluídas" }));

    // Com o filtro em "Concluídas" só a seção de concluídas tem linhas, então a ordem no documento
    // inteiro é a ordem dela.
    const expected = ["Terminada por último", "Terminada antes"];
    expect(titlesIn(document.body, expected)).toEqual(expected);

    await user.click(sortButton("Prazo"));
    expect(titlesIn(document.body, expected)).toEqual(expected);

    await user.click(sortButton("Última atualização"));
    expect(titlesIn(document.body, expected)).toEqual(expected);
  });
});
