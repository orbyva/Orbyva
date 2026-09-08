import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AgendaCalendar from "@/pages/admin/tasks/AgendaCalendar";
import {
  fetchProjectEvents,
  fetchProjects,
  fetchTags,
  fetchTasks,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import { TASK_PROJECT_FILTER_STORAGE_KEY } from "@/lib/taskProjectFilterPreference";
import type { Project, Task } from "@/types/tasks";

/**
 * Feature 102 — a **página** `/tasks/agenda`, não a grade.
 *
 * `AgendaGrid.*.test.tsx` já cobre a grade em si; o que faltava era um teste que olhasse a Agenda
 * pelo ângulo do pedido ("Ver Tarefas — tanto quick tasks quanto tasks com prazos") no lugar em que
 * ele foi pedido: a seção de Produtividade que a sidebar agora abre. Daí as três formas de tarefa
 * no mesmo dia (bloco com horário, faixa "Sem horário", bolinha), o `<Select>` de projeto que só
 * existe aqui (a aba dentro de `/tasks` roda a grade controlada, sem ele) e os estados de carga e
 * erro — sem navegador, que a skill `next` proíbe.
 */

vi.mock("@/api/tasks", () => ({
  fetchTasks: vi.fn(),
  fetchProjects: vi.fn(),
  fetchProjectEvents: vi.fn(),
  fetchTags: vi.fn(),
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  createTag: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  updateTask: vi.fn(),
  deleteProjectEvent: vi.fn(),
}));

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn(),
}));

vi.mock("@/api/health/medications", () => ({
  fetchMedications: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/hooks/useDimensions", () => ({
  useDimensions: () => ({ dimensions: [], loading: false, error: null, refetch: vi.fn() }),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const mockedFetchTasks = vi.mocked(fetchTasks);
const mockedFetchProjects = vi.mocked(fetchProjects);
const mockedFetchProjectEvents = vi.mocked(fetchProjectEvents);
const mockedFetchTags = vi.mocked(fetchTags);
const mockedFetchRecurringTransactions = vi.mocked(fetchRecurringTransactions);

/** Domingo, 16/08/2026 — o dia "hoje" em todo o arquivo, para o foco da grade ser previsível. */
const TODAY = "2026-08-16";

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

function makeProject(overrides: Partial<Project> = {}): Project {
  return { id: "project-1", name: "Projeto", status: "active", tag_ids: [], ...overrides };
}

async function renderPage(tasks: Task[] = [], projects: Project[] = []) {
  mockedFetchTasks.mockResolvedValue(tasks);
  mockedFetchProjects.mockResolvedValue(projects);
  const utils = render(
    <MemoryRouter>
      <AgendaCalendar />
    </MemoryRouter>
  );
  // A grade do mês só existe depois que `loading` vira false.
  await screen.findByText("Dom");
  return utils;
}

/** Troca a visão da grade — "Dia"/"Semana" é onde vivem a grade de horas e a faixa "Sem horário". */
async function irParaVisao(user: ReturnType<typeof userEvent.setup>, nome: string) {
  await user.click(screen.getByRole("tab", { name: nome }));
  await screen.findByText("00:00");
}

/** A faixa "Sem horário" acima do canvas de horas — o rótulo e as colunas de dia são irmãos. */
function faixaSemHorario(): HTMLElement {
  return screen.getByText("Sem horário").parentElement as HTMLElement;
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 16, 9, 0, 0));
  toastMock.mockReset();
  mockedFetchTasks.mockReset();
  mockedFetchProjects.mockReset().mockResolvedValue([]);
  mockedFetchProjectEvents.mockReset().mockResolvedValue([]);
  mockedFetchTags.mockReset().mockResolvedValue([]);
  mockedFetchRecurringTransactions.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cabeçalho da página", () => {
  it("mostra título/eyebrow e o caminho de volta 'Ir para Tarefas'", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "Agenda", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Produtividade")).toBeInTheDocument();
    // Sem este link, a página é um destino sem saída: a aba Agenda de `/tasks` tem as outras
    // visões ao lado, a página standalone não tem nenhuma.
    expect(screen.getByRole("link", { name: "Ir para Tarefas" })).toHaveAttribute(
      "href",
      "/tasks"
    );
  });
});

describe("ver tarefas — com prazo e horário, com prazo sem horário, e pontual", () => {
  const REUNIAO = makeTask({
    id: "t-timed",
    title: "Reunião de time",
    due_date: TODAY,
    due_time: "14:00",
  });
  const RELATORIO = makeTask({
    id: "t-untimed",
    title: "Relatório mensal",
    due_date: TODAY,
    due_time: null,
  });
  const LENCOL = makeTask({
    id: "t-quick",
    title: "Trocar lençol",
    due_date: TODAY,
    due_time: "08:00",
    is_quick: true,
  });

  it("na visão Dia, cada forma cai no seu lugar (bloco, faixa 'Sem horário' e bolinha)", async () => {
    const user = userEvent.setup();
    await renderPage([REUNIAO, RELATORIO, LENCOL]);
    await irParaVisao(user, "Dia");

    // 1) Tarefa com prazo **e** horário: bloco na grade de horas, com o horário dentro dele — e
    //    fora da faixa de itens sem horário.
    const bloco = screen.getByTitle("Reunião de time");
    expect(bloco.tagName).toBe("BUTTON");
    expect(within(bloco).getByText("14:00")).toBeInTheDocument();
    expect(faixaSemHorario()).not.toContainElement(bloco);

    // 2) Tarefa com prazo **sem** horário: chip dentro da faixa "Sem horário".
    expect(within(faixaSemHorario()).getByText("Relatório mensal")).toBeInTheDocument();

    // 3) Tarefa pontual (`is_quick`): bolinha marcável no slot das 08:00, não um bloco/chip.
    const fileira = screen.getByRole("group", { name: "Tarefas pontuais às 08:00" });
    expect(
      within(fileira).getByRole("button", { name: 'Concluir «Trocar lençol» às 08:00' })
    ).toBeInTheDocument();
    expect(faixaSemHorario()).not.toContainElement(fileira);
  });

  it("na visão Mês (a padrão da página) as três aparecem no mesmo dia", async () => {
    await renderPage([REUNIAO, RELATORIO, LENCOL]);

    expect(screen.getByText("Reunião de time")).toBeInTheDocument();
    expect(screen.getByText("Relatório mensal")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: 'Concluir «Trocar lençol» às 08:00' })
    ).toBeInTheDocument();
  });
});

describe("a página é o AgendaGrid não controlado", () => {
  const ALPHA = makeProject({ id: "p-alpha", name: "Alpha" });
  const BETA = makeProject({ id: "p-beta", name: "Beta" });
  const DA_ALPHA = makeTask({ id: "t-alpha", title: "Tarefa da Alpha", project_id: "p-alpha" });
  const DA_BETA = makeTask({ id: "t-beta", title: "Tarefa da Beta", project_id: "p-beta" });

  it("renderiza o `<Select>` de projeto interno — o que a aba dentro de /tasks esconde", async () => {
    await renderPage([DA_ALPHA, DA_BETA], [ALPHA, BETA]);

    expect(screen.getByRole("combobox", { name: "Projeto" })).toBeInTheDocument();
  });

  it("escolher um projeto recorta os itens da grade e guarda a preferência", async () => {
    const user = userEvent.setup();
    await renderPage([DA_ALPHA, DA_BETA], [ALPHA, BETA]);

    expect(screen.getByText("Tarefa da Alpha")).toBeInTheDocument();
    expect(screen.getByText("Tarefa da Beta")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Projeto" }));
    await user.click(await screen.findByRole("option", { name: "Alpha" }));

    await waitFor(() =>
      expect(screen.queryByText("Tarefa da Beta")).not.toBeInTheDocument()
    );
    expect(screen.getByText("Tarefa da Alpha")).toBeInTheDocument();
    // Mesma chave das quatro visões de `/tasks` (feature 097): o recorte segue o usuário.
    expect(localStorage.getItem(TASK_PROJECT_FILTER_STORAGE_KEY)).toBe("p-alpha");
  });

  it("semeia o filtro com a preferência já salva, sem passar por props", async () => {
    localStorage.setItem(TASK_PROJECT_FILTER_STORAGE_KEY, "p-beta");
    await renderPage([DA_ALPHA, DA_BETA], [ALPHA, BETA]);

    expect(screen.getByText("Tarefa da Beta")).toBeInTheDocument();
    expect(screen.queryByText("Tarefa da Alpha")).not.toBeInTheDocument();
  });
});

describe("carga e erro", () => {
  it("mostra o esqueleto enquanto as buscas estão em voo, e a grade quando terminam", async () => {
    let liberarTarefas: (tasks: Task[]) => void = () => {};
    mockedFetchTasks.mockReturnValue(
      new Promise<Task[]>((resolve) => {
        liberarTarefas = resolve;
      })
    );

    const { container } = render(
      <MemoryRouter>
        <AgendaCalendar />
      </MemoryRouter>
    );

    // Cabeçalho já está lá (a página não some), mas a grade ainda é esqueleto — nunca tela branca.
    expect(screen.getByRole("heading", { name: "Agenda", level: 1 })).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByText("Dom")).not.toBeInTheDocument();

    liberarTarefas([makeTask({ title: "Chegou depois" })]);

    await screen.findByText("Dom");
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
    expect(screen.getByText("Chegou depois")).toBeInTheDocument();
  });

  it("falha ao carregar vira toast destrutivo, e não tela em branco", async () => {
    mockedFetchTasks.mockRejectedValue(new Error("deu ruim na rede"));

    render(
      <MemoryRouter>
        <AgendaCalendar />
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      )
    );
    expect(toastMock.mock.calls[0][0].description).toContain("deu ruim na rede");
    // A grade continua montada (vazia), com o cabeçalho e o caminho de volta.
    expect(await screen.findByText("Dom")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para Tarefas" })).toBeInTheDocument();
  });
});
