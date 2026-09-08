import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TaskRecurrences from "@/pages/admin/tasks/TaskRecurrences";
import {
  countTaskSeries,
  deleteTask,
  deleteTaskSeries,
  fetchProjects,
  fetchTasks,
  updateTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import { endMedicationAndDeleteFutureDoses, fetchMedications } from "@/api/health/medications";
import type { Medication } from "@/types/health";
import type { Recurring } from "@/types/recurring";
import type { Project, Task } from "@/types/tasks";

/**
 * Feature 101 — a página `/tasks/recurrences` ("Tarefas recorrentes"), sem navegador.
 *
 * O que precisa ficar provado aqui não é "renderiza": é que a tela responde ao pedido literal do
 * usuário — **todas** as tarefas com recorrência, uma linha por série, inclusive as que a Lista de
 * hoje esconde (série colapsada e série encerrada).
 */

vi.mock("@/api/tasks", () => ({
  fetchTasks: vi.fn(),
  fetchProjects: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  deleteTaskSeries: vi.fn(),
  countTaskSeries: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn(),
  createRecurringApi: vi.fn(),
}));

vi.mock("@/api/health/medications", () => ({
  fetchMedications: vi.fn(),
  endMedicationAndDeleteFutureDoses: vi.fn(),
  EndMedicationError: class extends Error {},
}));

vi.mock("@/hooks/useDimensions", () => ({
  useDimensions: () => ({ dimensions: [], loading: false, error: null, refetch: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: (...args: unknown[]) => toastMock(...args),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));

const mockedFetchTasks = vi.mocked(fetchTasks);
const mockedFetchProjects = vi.mocked(fetchProjects);
const mockedFetchRecurrings = vi.mocked(fetchRecurringTransactions);
const mockedFetchMedications = vi.mocked(fetchMedications);

function makeRecurring(overrides: Partial<Recurring> & { id: string }): Recurring {
  return { description: "Recorrência", ...overrides } as Recurring;
}

function makeMedication(overrides: Partial<Medication> & { id: string }): Medication {
  return {
    name: "Losartana",
    times: ["08:00"],
    interval_days: 1,
    started_on: "2026-09-01",
    active: true,
    ...overrides,
  } as Medication;
}

export function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Tarefa",
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

function makeProject(overrides: Partial<Project> & { id: string }): Project {
  return {
    name: "Projeto",
    description: null,
    color: "#94a3b8",
    tag_ids: [],
    ...overrides,
  } as Project;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TaskRecurrences />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockedFetchTasks.mockResolvedValue([]);
  mockedFetchProjects.mockResolvedValue([]);
  mockedFetchRecurrings.mockResolvedValue([]);
  mockedFetchMedications.mockResolvedValue([]);
});

afterEach(() => {
  localStorage.clear();
});

/**
 * A base "de verdade": uma série simples, uma vinculada a Recorrência Financeira, um tratamento
 * (origem backfillada + doses) e duas tarefas avulsas que **não** podem virar linha.
 */
const SIMPLE_ORIGIN = makeTask({
  id: "simple-origin",
  title: "Reunião semanal",
  due_date: "2026-09-07",
  due_time: "10:00",
  recurrence_rule: { frequency: "weekly", interval: 1, weekdays: [1] },
});
const SIMPLE_NEXT = makeTask({
  id: "simple-2",
  title: "Reunião semanal",
  due_date: "2026-09-14",
  recurrence_origin_id: "simple-origin",
});
const LINKED = makeTask({
  id: "linked-1",
  title: "Pagar aluguel",
  due_date: "2026-09-05",
  linked_recurring_id: "rec-1",
});
const MEDICATION_ORIGIN = makeTask({
  id: "med-origin",
  title: "Tomar Losartana",
  due_date: "2026-09-01",
  // O backfill 049→064 preserva a regra na origem: ela tem `recurrence_rule` **e** `medication_id`.
  recurrence_rule: { frequency: "daily", interval: 1 },
  medication_id: "med-1",
  is_medication: true,
});
const MEDICATION_DOSE = makeTask({
  id: "med-dose-1",
  title: "Tomar Losartana",
  due_date: "2026-09-02",
  medication_id: "med-1",
  is_medication: true,
});
const ONE_OFF = makeTask({ id: "avulsa-1", title: "Comprar pão", due_date: "2026-09-03" });

const BASE_TASKS = [
  SIMPLE_ORIGIN,
  SIMPLE_NEXT,
  LINKED,
  MEDICATION_ORIGIN,
  MEDICATION_DOSE,
  ONE_OFF,
];

/** A linha da série (o card com título + regra + contagem). */
function seriesRow(title: string): HTMLElement {
  const label = screen.getByText(title);
  return label.closest("div.rounded-lg") as HTMLElement;
}

describe("TaskRecurrences — carregamento e falha", () => {
  it("mostra o cabeçalho 'Tarefas recorrentes' (e não 'Recorrências', que é a tela de Finanças)", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Tarefas recorrentes", level: 1 })
    ).toBeInTheDocument();
  });

  it("mostra o esqueleto enquanto as tarefas não chegam", async () => {
    let resolve!: (rows: Task[]) => void;
    mockedFetchTasks.mockReturnValue(
      new Promise<Task[]>((r) => {
        resolve = r;
      })
    );

    const { container } = renderPage();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);

    resolve([]);
    await waitFor(() => expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0));
  });

  it("falha ao carregar avisa por toast destrutivo em vez de deixar a tela em branco", async () => {
    mockedFetchTasks.mockRejectedValueOnce(new Error("500"));
    renderPage();

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      )
    );
  });
});

describe("TaskRecurrences — uma linha por série", () => {
  it("mostra as três séries da base e nenhuma linha para a tarefa avulsa", async () => {
    mockedFetchTasks.mockResolvedValue(BASE_TASKS);
    renderPage();

    await screen.findByText("Reunião semanal");
    expect(screen.getByText("Pagar aluguel")).toBeInTheDocument();
    expect(screen.getByText("Tomar Losartana")).toBeInTheDocument();
    // "Comprar pão" não se repete: a tela é sobre o que se repete.
    expect(screen.queryByText("Comprar pão")).not.toBeInTheDocument();

    // Uma linha por série, não por ocorrência: as duas reuniões e as duas doses são **uma** cada.
    expect(screen.getAllByText("Reunião semanal")).toHaveLength(1);
    expect(screen.getAllByText("Tomar Losartana")).toHaveLength(1);
  });

  it("cada linha mostra a regra da série — a informação que hoje só existe dentro do formulário", async () => {
    mockedFetchTasks.mockResolvedValue(BASE_TASKS);
    renderPage();

    await screen.findByText("Reunião semanal");
    expect(within(seriesRow("Reunião semanal")).getByText("A cada 1 semana, seg")).toBeInTheDocument();
    expect(within(seriesRow("Tomar Losartana")).getByText("A cada 1 dia")).toBeInTheDocument();
  });

  it("cada linha ganha o badge do seu tipo — Repetição, Financeira e Medicação", async () => {
    mockedFetchTasks.mockResolvedValue(BASE_TASKS);
    renderPage();

    await screen.findByText("Reunião semanal");
    expect(within(seriesRow("Reunião semanal")).getByText("Repetição")).toBeInTheDocument();
    expect(within(seriesRow("Pagar aluguel")).getByText("Financeira")).toBeInTheDocument();
    expect(within(seriesRow("Tomar Losartana")).getByText("Medicação")).toBeInTheDocument();
  });

  it("consulta médica recorrente vira badge 'Consulta', sem virar um quarto grupo", async () => {
    mockedFetchTasks.mockResolvedValue([
      makeTask({
        id: "consulta-origin",
        title: "Cardiologista — Dr. Silva",
        due_date: "2026-09-10",
        recurrence_rule: { frequency: "monthly", interval: 3 },
        is_consultation: true,
      }),
    ]);
    renderPage();

    await screen.findByText("Cardiologista — Dr. Silva");
    expect(within(seriesRow("Cardiologista — Dr. Silva")).getByText("Consulta")).toBeInTheDocument();
  });

  it("a série financeira mostra a descrição da Recorrência vinculada, não o genérico", async () => {
    mockedFetchRecurrings.mockResolvedValue([makeRecurring({ id: "rec-1", description: "Aluguel" })]);
    mockedFetchTasks.mockResolvedValue(BASE_TASKS);
    renderPage();

    await screen.findByText("Pagar aluguel");
    expect(within(seriesRow("Pagar aluguel")).getByText("Vinculada a «Aluguel»")).toBeInTheDocument();
  });

  it("a série de tratamento mostra a posologia do `medication`, que é onde a regra realmente mora", async () => {
    mockedFetchMedications.mockResolvedValue([
      makeMedication({ id: "med-1", times: ["08:00", "20:00"], dose_amount: 2, dose_unit: "comprimidos" }),
    ]);
    mockedFetchTasks.mockResolvedValue(BASE_TASKS);
    renderPage();

    await screen.findByText("Tomar Losartana");
    expect(
      within(seriesRow("Tomar Losartana")).getByText("2 comprimidos · 08:00, 20:00 · todos os dias")
    ).toBeInTheDocument();
  });

  it("busca os tratamentos **sem** filtro de ativos — tratamento encerrado ainda é uma série desta tela", async () => {
    mockedFetchTasks.mockResolvedValue(BASE_TASKS);
    renderPage();

    await screen.findByText("Tomar Losartana");
    expect(mockedFetchMedications).toHaveBeenCalledWith();
  });

  it("falha ao carregar recorrências financeiras/tratamentos não zera a página", async () => {
    mockedFetchRecurrings.mockRejectedValue(new Error("500"));
    mockedFetchMedications.mockRejectedValue(new Error("500"));
    mockedFetchTasks.mockResolvedValue(BASE_TASKS);
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderPage();

    // As três linhas continuam lá; só o *nome* da regra financeira/posologia cai no genérico.
    await screen.findByText("Reunião semanal");
    expect(screen.getByText("Pagar aluguel")).toBeInTheDocument();
    expect(screen.getByText("Tomar Losartana")).toBeInTheDocument();
    expect(
      within(seriesRow("Pagar aluguel")).getByText("Vinculada a «Recorrência Financeira»")
    ).toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("mostra próxima ocorrência, projeto e a contagem de ocorrências da série", async () => {
    mockedFetchProjects.mockResolvedValue([makeProject({ id: "proj-1", name: "Casa" })]);
    mockedFetchTasks.mockResolvedValue([
      { ...SIMPLE_ORIGIN, project_id: "proj-1", status: "done" as const },
      { ...SIMPLE_NEXT, project_id: "proj-1" },
    ]);
    renderPage();

    await screen.findByText("Reunião semanal");
    const row = seriesRow("Reunião semanal");
    expect(within(row).getByText("Próxima: 14/09/2026")).toBeInTheDocument();
    expect(within(row).getByText("Casa")).toBeInTheDocument();
    expect(within(row).getByText("2 ocorrências · 1 concluída")).toBeInTheDocument();
  });
});

/**
 * A série que a Lista de hoje **esconde**: todas as ocorrências concluídas, nenhuma em aberto.
 * `collapseRecurringSeries` a descarta inteira; aqui ela é o caso que prova o "todas as tarefas
 * com recorrência" do pedido.
 */
const ENDED_ORIGIN = makeTask({
  id: "ended-origin",
  title: "Curso de inglês",
  due_date: "2026-01-05",
  status: "done",
  recurrence_rule: { frequency: "weekly", interval: 1, count: 2 },
});
const ENDED_LAST = makeTask({
  id: "ended-2",
  title: "Curso de inglês",
  due_date: "2026-01-12",
  status: "done",
  recurrence_origin_id: "ended-origin",
});

function statusTrigger(): HTMLElement {
  return screen.getByRole("combobox", { name: "Status da série" });
}

function projectTrigger(): HTMLElement {
  return screen.getByRole("combobox", { name: "Projeto" });
}

async function pick(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement, option: string) {
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("TaskRecurrences — filtro de status da série", () => {
  it("'Ativas' (o padrão) deixa a série encerrada de fora", async () => {
    mockedFetchTasks.mockResolvedValue([SIMPLE_ORIGIN, SIMPLE_NEXT, ENDED_ORIGIN, ENDED_LAST]);
    renderPage();

    await screen.findByText("Reunião semanal");
    expect(screen.queryByText("Curso de inglês")).not.toBeInTheDocument();
    expect(statusTrigger()).toHaveTextContent("Ativas");
  });

  it("'Encerradas' mostra a série que a Lista esconde hoje — e só ela", async () => {
    const user = userEvent.setup();
    mockedFetchTasks.mockResolvedValue([SIMPLE_ORIGIN, SIMPLE_NEXT, ENDED_ORIGIN, ENDED_LAST]);
    renderPage();

    await screen.findByText("Reunião semanal");
    await pick(user, statusTrigger(), "Encerradas");

    expect(await screen.findByText("Curso de inglês")).toBeInTheDocument();
    expect(screen.queryByText("Reunião semanal")).not.toBeInTheDocument();
    // "Acabou" é informação, não motivo pra sumir: a linha diz que a série terminou e onde parou.
    const row = seriesRow("Curso de inglês");
    expect(within(row).getByText("Encerrada")).toBeInTheDocument();
    expect(within(row).getByText("Última: 12/01/2026")).toBeInTheDocument();
    expect(within(row).getByText("2 ocorrências · 2 concluídas")).toBeInTheDocument();
  });

  it("'Todas' mostra as duas de uma vez, ativas antes das encerradas", async () => {
    const user = userEvent.setup();
    mockedFetchTasks.mockResolvedValue([SIMPLE_ORIGIN, SIMPLE_NEXT, ENDED_ORIGIN, ENDED_LAST]);
    renderPage();

    await screen.findByText("Reunião semanal");
    await pick(user, statusTrigger(), "Todas");

    expect(await screen.findByText("Curso de inglês")).toBeInTheDocument();
    const titles = screen
      .getAllByText(/Reunião semanal|Curso de inglês/)
      .map((el) => el.textContent);
    expect(titles).toEqual(["Reunião semanal", "Curso de inglês"]);
  });
});

describe("TaskRecurrences — filtro de projeto (a preferência da feature 097)", () => {
  const CASA = makeProject({ id: "proj-casa", name: "Casa" });
  const TRABALHO = makeProject({ id: "proj-trab", name: "Trabalho" });
  const SERIES_CASA = [
    { ...SIMPLE_ORIGIN, project_id: CASA.id },
    { ...SIMPLE_NEXT, project_id: CASA.id },
  ];
  const SERIE_TRABALHO = makeTask({
    id: "trab-origin",
    title: "Daily do time",
    due_date: "2026-09-02",
    project_id: TRABALHO.id,
    recurrence_rule: { frequency: "daily", interval: 1 },
  });

  beforeEach(() => {
    mockedFetchProjects.mockResolvedValue([CASA, TRABALHO]);
    mockedFetchTasks.mockResolvedValue([...SERIES_CASA, SERIE_TRABALHO]);
  });

  it("escolher um projeto recorta as séries pela origem", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Reunião semanal");
    expect(screen.getByText("Daily do time")).toBeInTheDocument();

    await pick(user, projectTrigger(), "Casa");
    expect(await screen.findByText("Reunião semanal")).toBeInTheDocument();
    expect(screen.queryByText("Daily do time")).not.toBeInTheDocument();
  });

  it("a escolha sobrevive ao reload — é a mesma preferência das quatro visões de /tasks", async () => {
    const user = userEvent.setup();
    const first = renderPage();

    await screen.findByText("Reunião semanal");
    await pick(user, projectTrigger(), "Trabalho");
    await waitFor(() => expect(screen.queryByText("Reunião semanal")).not.toBeInTheDocument());
    first.unmount();

    renderPage();
    expect(await screen.findByText("Daily do time")).toBeInTheDocument();
    expect(screen.queryByText("Reunião semanal")).not.toBeInTheDocument();
    expect(projectTrigger()).toHaveTextContent("Trabalho");
  });

  it("preferência apontando para projeto apagado cai em 'Todos os projetos', não numa tela vazia sem pista", async () => {
    localStorage.setItem("orbyva_task_project_filter_v1", "proj-que-nao-existe-mais");
    renderPage();

    expect(await screen.findByText("Reunião semanal")).toBeInTheDocument();
    expect(screen.getByText("Daily do time")).toBeInTheDocument();
    expect(projectTrigger()).toHaveTextContent("Todos os projetos");
    expect(localStorage.getItem("orbyva_task_project_filter_v1")).toBe("all");
  });
});

describe("TaskRecurrences — os dois vazios, que não são o mesmo vazio", () => {
  it("base sem recorrência nenhuma explica o que a tela é, e oferece o caminho de volta", async () => {
    mockedFetchTasks.mockResolvedValue([ONE_OFF]);
    renderPage();

    expect(await screen.findByText("Nenhuma tarefa recorrente ainda")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para Tarefas" })).toHaveAttribute("href", "/tasks");
    expect(screen.queryByText("Nenhuma série neste recorte")).not.toBeInTheDocument();
  });

  it("filtro que zerou a lista diz que as recorrências continuam lá — e limpa o recorte num clique", async () => {
    const user = userEvent.setup();
    // Só séries ativas na base; "Encerradas" zera a lista sem zerar as recorrências.
    mockedFetchTasks.mockResolvedValue([SIMPLE_ORIGIN, SIMPLE_NEXT]);
    renderPage();

    await screen.findByText("Reunião semanal");
    await pick(user, statusTrigger(), "Encerradas");

    expect(await screen.findByText("Nenhuma série neste recorte")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma tarefa recorrente ainda")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(await screen.findByText("Reunião semanal")).toBeInTheDocument();
  });
});

describe("TaskRecurrences — ver as ocorrências da série", () => {
  it("abre 'Ocorrências de…' com as duas ocorrências reais da série simples", async () => {
    const user = userEvent.setup();
    mockedFetchTasks.mockResolvedValue(BASE_TASKS);
    renderPage();

    await screen.findByText("Reunião semanal");
    await user.click(
      screen.getByRole("button", { name: 'Ver ocorrências de "Reunião semanal"' })
    );

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText('Ocorrências de "Reunião semanal"')).toBeInTheDocument();
    expect(dialog.getByText("07/09/2026 10:00")).toBeInTheDocument();
    expect(dialog.getByText("14/09/2026")).toBeInTheDocument();
  });

  it("no tratamento, lista **as doses** — `findSeriesTasks` devolveria só a tarefa-origem", async () => {
    const user = userEvent.setup();
    mockedFetchTasks.mockResolvedValue(BASE_TASKS);
    renderPage();

    await screen.findByText("Tomar Losartana");
    await user.click(
      screen.getByRole("button", { name: 'Ver ocorrências de "Tomar Losartana"' })
    );

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("01/09/2026")).toBeInTheDocument();
    expect(dialog.getByText("02/09/2026")).toBeInTheDocument();
  });
});

describe("TaskRecurrences — excluir a série", () => {
  it("na série simples, oferece o escopo da série inteira e chama `deleteTaskSeries` com a origem", async () => {
    const user = userEvent.setup();
    vi.mocked(countTaskSeries).mockResolvedValue(2);
    vi.mocked(deleteTaskSeries).mockResolvedValue(2);
    mockedFetchTasks.mockResolvedValue([SIMPLE_ORIGIN, SIMPLE_NEXT]);
    renderPage();

    await screen.findByText("Reunião semanal");
    await user.click(screen.getByRole("button", { name: 'Excluir "Reunião semanal"' }));

    const dialog = within(await screen.findByRole("alertdialog"));
    await user.click(await dialog.findByRole("button", { name: /Excluir todas as ocorrências/ }));

    await waitFor(() =>
      expect(deleteTaskSeries).toHaveBeenCalledWith(
        expect.objectContaining({ id: "simple-origin" }),
        { mode: "series" }
      )
    );
    // Uma linha por série: a exclusão da tela nunca pode virar um `deleteTask` de uma ocorrência só.
    expect(deleteTask).not.toHaveBeenCalled();
  });

  it("no tratamento, oferece encerrar o tratamento — a única exclusão que não volta na carga seguinte", async () => {
    const user = userEvent.setup();
    vi.mocked(countTaskSeries).mockResolvedValue(3);
    vi.mocked(endMedicationAndDeleteFutureDoses).mockResolvedValue(3);
    // Tratamento **ativo**: é o que faz o dialog oferecer o encerramento, e não só apagar doses.
    mockedFetchMedications.mockResolvedValue([makeMedication({ id: "med-1" })]);
    mockedFetchTasks.mockResolvedValue([MEDICATION_ORIGIN, MEDICATION_DOSE]);
    renderPage();

    await screen.findByText("Tomar Losartana");
    await user.click(screen.getByRole("button", { name: 'Excluir "Tomar Losartana"' }));

    const dialog = within(await screen.findByRole("alertdialog"));
    await user.click(await dialog.findByRole("button", { name: /Encerrar o tratamento/ }));

    await waitFor(() =>
      expect(endMedicationAndDeleteFutureDoses).toHaveBeenCalledWith(
        expect.objectContaining({ id: "med-origin" })
      )
    );
  });

  it("'Excluir somente esta' recarrega a tela — a lista tem de refletir o que saiu", async () => {
    const user = userEvent.setup();
    vi.mocked(countTaskSeries).mockResolvedValue(2);
    vi.mocked(deleteTask).mockResolvedValue(undefined as never);
    mockedFetchTasks.mockResolvedValue([SIMPLE_ORIGIN, SIMPLE_NEXT]);
    renderPage();

    await screen.findByText("Reunião semanal");
    expect(mockedFetchTasks).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: 'Excluir "Reunião semanal"' }));
    const dialog = within(await screen.findByRole("alertdialog"));
    await user.click(await dialog.findByRole("button", { name: "Excluir somente esta" }));

    await waitFor(() => expect(deleteTask).toHaveBeenCalledWith("simple-origin"));
    await waitFor(() => expect(mockedFetchTasks).toHaveBeenCalledTimes(2));
  });
});

describe("TaskRecurrences — editar a repetição", () => {
  it("salva na **tarefa-origem**, e não na ocorrência que por acaso estava na frente", async () => {
    const user = userEvent.setup();
    vi.mocked(updateTask).mockResolvedValue(undefined as never);
    mockedFetchTasks.mockResolvedValue([SIMPLE_ORIGIN, SIMPLE_NEXT]);
    renderPage();

    await screen.findByText("Reunião semanal");
    await user.click(
      screen.getByRole("button", { name: 'Editar repetição de "Reunião semanal"' })
    );

    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("combobox", { name: "Frequência" }));
    await user.click(await screen.findByRole("option", { name: "mês(es)" }));
    await user.click(dialog.getByRole("button", { name: "Salvar repetição" }));

    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "simple-origin",
          recurrence_rule: expect.objectContaining({ frequency: "monthly" }),
        })
      )
    );
    // E recarrega: a linha tem de passar a mostrar a regra nova.
    await waitFor(() => expect(mockedFetchTasks).toHaveBeenCalledTimes(2));
  });

  it("avisa que as ocorrências já criadas não são reescritas — aqui o usuário está olhando pra elas", async () => {
    const user = userEvent.setup();
    mockedFetchTasks.mockResolvedValue([SIMPLE_ORIGIN, SIMPLE_NEXT]);
    renderPage();

    await screen.findByText("Reunião semanal");
    await user.click(
      screen.getByRole("button", { name: 'Editar repetição de "Reunião semanal"' })
    );

    const dialog = within(await screen.findByRole("dialog"));
    expect(
      dialog.getByText(
        "Mudar a regra vale para as próximas ocorrências: as que já foram criadas continuam como estão."
      )
    ).toBeInTheDocument();
  });

  it("tratamento não oferece 'Editar repetição': a regra dele mora na `medication`, não na tarefa", async () => {
    mockedFetchTasks.mockResolvedValue([MEDICATION_ORIGIN, MEDICATION_DOSE]);
    renderPage();

    await screen.findByText("Tomar Losartana");
    expect(
      screen.queryByRole("button", { name: 'Editar repetição de "Tomar Losartana"' })
    ).not.toBeInTheDocument();
    // Mas continua dando pra ver as ocorrências e pra excluir/encerrar.
    expect(
      screen.getByRole("button", { name: 'Ver ocorrências de "Tomar Losartana"' })
    ).toBeInTheDocument();
  });
});

describe("TaskRecurrences — o padrão 'Ativas' não pode esconder série encerrada em silêncio", () => {
  it("avisa quantas séries encerradas ficaram fora, e mostra todas num clique", async () => {
    const user = userEvent.setup();
    mockedFetchTasks.mockResolvedValue([SIMPLE_ORIGIN, SIMPLE_NEXT, ENDED_ORIGIN, ENDED_LAST]);
    renderPage();

    await screen.findByText("Reunião semanal");
    expect(screen.getByText(/1 série encerrada está fora deste recorte/)).toBeInTheDocument();
    expect(screen.queryByText("Curso de inglês")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mostrar todas" }));
    expect(await screen.findByText("Curso de inglês")).toBeInTheDocument();
    // Nada mais está escondido: o aviso sai de cena.
    expect(screen.queryByText(/fora deste recorte/)).not.toBeInTheDocument();
  });

  it("sem série encerrada nenhuma, não há aviso — o recorte padrão já mostra tudo", async () => {
    mockedFetchTasks.mockResolvedValue([SIMPLE_ORIGIN, SIMPLE_NEXT]);
    renderPage();

    await screen.findByText("Reunião semanal");
    expect(screen.queryByText(/fora deste recorte/)).not.toBeInTheDocument();
  });
});
