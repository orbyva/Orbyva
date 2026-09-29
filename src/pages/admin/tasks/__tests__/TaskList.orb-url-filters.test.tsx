import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import TaskList from "@/pages/admin/tasks/TaskList";
import { ActiveTimerProvider } from "@/hooks/useActiveTimer";
import type { Project, ProjectEvent, Task, TaskTimeEntry } from "@/types/tasks";

/**
 * Feature 100 — a ponta que fecha o exemplo do pedido ("quais projetos eu tenho para o sacada" →
 * a Orb abre as tarefas de lá, já filtradas).
 *
 * `open_screen` monta `/tasks?project=<uuid>&q=<texto>` e isso já tem teste
 * (`src/domain/orb/__tests__/navigation.test.ts`). O que faltava provar é o outro lado: a TELA lê
 * esses parâmetros e vira o recorte de verdade. Sem isto a Orb navegaria para uma URL bonita e a
 * lista continuaria mostrando tudo — o modo exato como esta feature falharia em silêncio.
 *
 * O caso mais escorregadio é a SEGUNDA navegação: ir de `?project=A` para `?project=B` não remonta
 * a tela (mesma rota), então um inicializador de `useState` pegaria só a primeira. O teste amarra
 * isso pelo `fetchTasks`: se a tela tivesse remontado, `load()` rodaria de novo e a contagem de
 * chamadas subiria. Ela não sobe, e mesmo assim o recorte muda.
 */

const store: {
  tasks: Task[];
  projects: Project[];
  events: ProjectEvent[];
  runningEntry: TaskTimeEntry | null;
} = { tasks: [], projects: [], events: [], runningEntry: null };

/** O Gantt real monta um `<canvas>`, que crasha em jsdom — aqui só importa a aba Lista. */
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
  // Feature 106: o formulário em edição procura quem cita a tarefa ("Referenciada em").
  fetchTasksMentioningTask: vi.fn(async () => []),
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchTasks: vi.fn(async () => store.tasks.map((t) => ({ ...t }))),
  fetchTaskById: vi.fn(async () => null),
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


// Feature 106: a outra metade de "Referenciada em" vem das notas. Só o que é novo é dublado — o
// resto do módulo continua real, como estes testes já esperavam.
vi.mock("@/api/notes/notes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/notes/notes")>()),
  fetchNotesMentioningTask: vi.fn(async () => []),
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

const { fetchTasks, fetchTaskById } = await import("@/api/tasks");
const mockedFetchTasks = vi.mocked(fetchTasks);
const mockedFetchTaskById = vi.mocked(fetchTaskById);

/** Quinta, 20/08/2026 — mesma data das outras suítes da tela; tudo vence hoje. */
const TODAY = "2026-08-20";

const SACADA: Project = { id: "p-sacada", name: "Sacada", status: "active", tag_ids: [] };
const COZINHA: Project = { id: "p-cozinha", name: "Cozinha", status: "active", tag_ids: [] };

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

const VIDRO = "Trocar o vidro da sacada";
const PLANTA = "Regar as plantas";
const PIA = "Consertar a pia";
/** De propósito casa com `q=vidro` estando em OUTRO projeto: é o que faz o teste dos dois filtros
 * juntos falhar se só um deles for aplicado. */
const JANELA = "Limpar o vidro da janela";
const TITULOS = [VIDRO, PLANTA, PIA, JANELA];
/** Feature 102: tarefa que o `fetchTasks` da tela NÃO devolve — concluída com o filtro em
 * "pendentes" é o caso real. Só chega à tela pela busca por id. */
const ARQUIVADA = "Pintar o corrimão";

const SEED: Task[] = [
  makeTask({ id: "t-vidro", title: VIDRO, project_id: SACADA.id }),
  makeTask({ id: "t-planta", title: PLANTA, project_id: SACADA.id }),
  makeTask({ id: "t-pia", title: PIA, project_id: COZINHA.id }),
  makeTask({ id: "t-janela", title: JANELA, project_id: COZINHA.id }),
];

/** Quais dos títulos conhecidos estão na tela agora — sem se confundir com o painel "Por
 * prioridade" da Lista, que repete o mesmo título. */
function titulosNaTela(): string[] {
  return TITULOS.filter((title) => screen.queryAllByText(title).length > 0);
}

/** Espelha a URL viva na tela: é assim que o teste confere o que sobrou na query string depois de
 * a tela mexer nela (feature 102). */
function UrlAtual() {
  const { pathname, search } = useLocation();
  return <output data-testid="url-atual">{`${pathname}${search}`}</output>;
}

function urlNaTela(): string {
  return screen.getByTestId("url-atual").textContent ?? "";
}

/** Botão de teste que troca a URL SEM remontar a rota — é o que a Orb faz pelo `onNavigate`. */
function IrPara({ para, rotulo }: { para: string; rotulo: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(para)}>
      {rotulo}
    </button>
  );
}

async function renderEm(url: string, extra?: React.ReactNode) {
  const utils = render(
    <MemoryRouter initialEntries={[url]}>
      <ActiveTimerProvider>
        <Routes>
          <Route
            path="/tasks"
            element={
              <>
                {extra}
                <TaskList />
              </>
            }
          />
        </Routes>
      </ActiveTimerProvider>
    </MemoryRouter>
  );
  // A tela só tem conteúdo depois do `load()`.
  await screen.findByLabelText("Buscar tarefa");
  return utils;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 20, 10, 0, 0));
  localStorage.clear();
  toastMock.mockReset();
  mockedFetchTasks.mockClear();
  mockedFetchTaskById.mockReset();
  mockedFetchTaskById.mockResolvedValue(null);
  store.tasks = SEED.map((t) => ({ ...t }));
  store.projects = [SACADA, COZINHA];
  store.events = [];
  store.runningEntry = null;
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("TaskList — filtros vindos da URL (feature 100)", () => {
  it("`?project=` abre a tela já recortada no projeto que a Orb escolheu", async () => {
    await renderEm(`/tasks?project=${SACADA.id}`);

    await waitFor(() => expect(titulosNaTela()).toEqual([VIDRO, PLANTA]));
    // E o `<Select>` da barra mostra o mesmo recorte — a URL vira estado, não um filtro paralelo.
    expect(screen.getByRole("combobox", { name: "Projeto" })).toHaveTextContent("Sacada");
  });

  it("`?q=` preenche a busca e recorta por texto, ignorando acento e caixa", async () => {
    await renderEm("/tasks?q=PLANTAS");

    await waitFor(() => expect(titulosNaTela()).toEqual([PLANTA]));
    expect(screen.getByLabelText("Buscar tarefa")).toHaveValue("PLANTAS");
  });

  it("`?project=` e `?q=` juntos somam os dois recortes", async () => {
    // "vidro" casa com duas tarefas, uma em cada projeto: só o par de filtros deixa uma.
    await renderEm(`/tasks?project=${SACADA.id}&q=vidro`);

    await waitFor(() => expect(titulosNaTela()).toEqual([VIDRO]));
  });

  it("trocar a URL troca o recorte SEM remontar a tela (segunda navegação da Orb)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderEm(
      `/tasks?project=${SACADA.id}`,
      <IrPara para={`/tasks?project=${COZINHA.id}`} rotulo="ir para cozinha" />
    );

    await waitFor(() => expect(titulosNaTela()).toEqual([VIDRO, PLANTA]));
    const cargasAntes = mockedFetchTasks.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "ir para cozinha" }));

    await waitFor(() => expect(titulosNaTela()).toEqual([PIA, JANELA]));
    // Se a tela tivesse remontado, `load()` rodaria de novo: a contagem parada é a prova de que o
    // recorte mudou pelo efeito que escuta a query string, não por um `useState` inicial.
    expect(mockedFetchTasks.mock.calls.length).toBe(cargasAntes);
  });

  it("parâmetro ausente na URL nova não faz faxina no filtro já aplicado", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderEm(
      `/tasks?project=${SACADA.id}`,
      <IrPara para="/tasks?status=all" rotulo="só o status" />
    );

    await waitFor(() => expect(titulosNaTela()).toEqual([VIDRO, PLANTA]));

    await user.click(screen.getByRole("button", { name: "só o status" }));

    // Quem chega por link pede um recorte a mais, não a limpeza dos outros.
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Projeto" })).toHaveTextContent("Sacada")
    );
    expect(titulosNaTela()).toEqual([VIDRO, PLANTA]);
  });

  it("`?q=` que não casa com nada deixa a lista vazia, não mostra tudo", async () => {
    await renderEm("/tasks?q=zzzz-nao-existe");

    await waitFor(() => expect(titulosNaTela()).toEqual([]));
  });
});

/**
 * Feature 102 — `?task=<id>` é o DESTINO de uma tarefa: o que a referência rastreável no texto
 * (features 103–106) vai linkar e o que a Orb passa a mandar no lugar de `/tasks?q=<título>`.
 *
 * Diferente dos outros parâmetros, ele não recorta a lista: abre o Dialog de edição daquela tarefa.
 */
describe("TaskList — `?task=` abre a tarefa (feature 102)", () => {
  /** O painel do Dialog aberto, para não confundir o título do formulário com a linha da lista. */
  async function dialogAberto() {
    return within(await screen.findByRole("dialog"));
  }

  it("abre o Dialog de edição na tarefa apontada pelo id", async () => {
    await renderEm("/tasks?task=t-planta");

    const painel = await dialogAberto();
    expect(painel.getByText("Editar tarefa")).toBeInTheDocument();
    expect(painel.getByLabelText(/^Título/)).toHaveValue(PLANTA);
  });

  it("busca pelo id quando a tarefa não está na lista carregada", async () => {
    // Nenhuma tarefa com este id sai de `fetchTasks`: é o caso da concluída com o filtro em
    // "pendentes", que desistir na lista transformaria num falso "não encontrada".
    mockedFetchTaskById.mockResolvedValue(
      makeTask({ id: "t-arquivada", title: ARQUIVADA, status: "done" })
    );

    await renderEm("/tasks?task=t-arquivada");

    const painel = await dialogAberto();
    expect(painel.getByLabelText(/^Título/)).toHaveValue(ARQUIVADA);
    expect(mockedFetchTaskById).toHaveBeenCalledWith("t-arquivada");
  });

  it("não vai ao banco quando a tarefa já está na lista", async () => {
    await renderEm("/tasks?task=t-planta");

    await dialogAberto();
    expect(mockedFetchTaskById).not.toHaveBeenCalled();
  });

  it("avisa que está abrindo enquanto a busca por id corre", async () => {
    let liberar: (task: Task | null) => void = () => {};
    mockedFetchTaskById.mockImplementation(
      () =>
        new Promise<Task | null>((resolve) => {
          liberar = resolve;
        })
    );

    await renderEm("/tasks?task=t-arquivada");

    // Sem este aviso a tela ficaria parada e o link pareceria não ter feito nada.
    expect(await screen.findByText("Abrindo a tarefa…")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    liberar(makeTask({ id: "t-arquivada", title: ARQUIVADA }));

    const painel = await dialogAberto();
    expect(painel.getByLabelText(/^Título/)).toHaveValue(ARQUIVADA);
    await waitFor(() => expect(screen.queryByText("Abrindo a tarefa…")).not.toBeInTheDocument());
  });

  it("id inexistente (ou de outra conta) avisa e sai da URL, sem quebrar a tela", async () => {
    // `fetchTaskById` filtra por `user_id`: id de outra conta devolve o MESMO `null` de um id que
    // não existe. Os dois caem neste caminho, de propósito — a tela não distingue, e não deve.
    mockedFetchTaskById.mockResolvedValue(null);

    await renderEm("/tasks?task=nao-existe", <UrlAtual />);

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Tarefa não encontrada" })
      )
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // A lista continua de pé: link errado não pode virar tela branca.
    expect(titulosNaTela()).toEqual(TITULOS);
    // E o parâmetro sai, senão recarregar repetiria o toast para sempre.
    await waitFor(() => expect(urlNaTela()).toBe("/tasks"));
  });

  it("id malformado não derruba a tela: mesmo aviso, mesma limpeza", async () => {
    // `fetchTaskById` propaga o erro do banco ("invalid input syntax for type uuid").
    mockedFetchTaskById.mockRejectedValue(new Error("invalid input syntax for type uuid"));

    await renderEm("/tasks?task=nao-e-uuid", <UrlAtual />);

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Tarefa não encontrada" })
      )
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(titulosNaTela()).toEqual(TITULOS);
    await waitFor(() => expect(urlNaTela()).toBe("/tasks"));
  });

  it("limpar o `task` preserva os outros parâmetros da URL", async () => {
    mockedFetchTaskById.mockResolvedValue(null);

    await renderEm(`/tasks?project=${SACADA.id}&task=nao-existe`, <UrlAtual />);

    await waitFor(() => expect(urlNaTela()).toBe(`/tasks?project=${SACADA.id}`));
    // O recorte sobrevive à limpeza — a faxina é da chave `task`, não da query inteira.
    expect(titulosNaTela()).toEqual([VIDRO, PLANTA]);
  });

  it("`?project=` e `?task=` juntos: a lista recorta E o Dialog abre", async () => {
    // A tarefa apontada é de OUTRO projeto que o recorte exclui — é o que separa "os dois
    // parâmetros valem" de "o `task` só funciona quando a tarefa já está na lista".
    mockedFetchTaskById.mockResolvedValue(
      makeTask({ id: "t-pia", title: PIA, project_id: COZINHA.id })
    );

    await renderEm(`/tasks?project=${SACADA.id}&task=t-pia`, <UrlAtual />);

    const painel = await dialogAberto();
    expect(painel.getByLabelText(/^Título/)).toHaveValue(PIA);
    expect(titulosNaTela()).toEqual([VIDRO, PLANTA]);
  });

  it("fechar o Dialog tira o `task` da URL e mantém o `project`", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderEm(`/tasks?project=${SACADA.id}&task=t-vidro`, <UrlAtual />);

    await dialogAberto();
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // O recorte sobrevive: a faxina é da chave `task`, não da query inteira.
    await waitFor(() => expect(urlNaTela()).toBe(`/tasks?project=${SACADA.id}`));
    // E o Dialog NÃO volta: tirar o parâmetro muda `searchParams` e roda o efeito de novo — se ele
    // se realimentasse, a tela entraria em laço de abrir/fechar.
    await waitFor(() => expect(titulosNaTela()).toEqual([VIDRO, PLANTA]));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("navegar de `?task=A` para `?task=B` troca a tarefa do Dialog", async () => {
    await renderEm("/tasks?task=t-vidro", <IrPara para="/tasks?task=t-pia" rotulo="ir para a pia" />);

    const painel = await dialogAberto();
    expect(painel.getByLabelText(/^Título/)).toHaveValue(VIDRO);

    // Com o Dialog modal aberto o resto da tela fica `aria-hidden`; `fireEvent` dispara a
    // navegação assim mesmo, que é o equivalente a colar a segunda URL na barra de endereço.
    fireEvent.click(screen.getByRole("button", { name: "ir para a pia", hidden: true }));

    // Ficar preso na tarefa A seria o sintoma de ler o parâmetro só na montagem.
    await waitFor(() =>
      expect(within(screen.getByRole("dialog")).getByLabelText(/^Título/)).toHaveValue(PIA)
    );
  });

  it("salvar também tira o `task` da URL — salvar fecha o Dialog", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderEm("/tasks?task=t-vidro", <UrlAtual />);

    await dialogAberto();
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Deixar o `?task=` aqui faria recarregar reabrir a tarefa que acabou de ser salva.
    await waitFor(() => expect(urlNaTela()).toBe("/tasks"));
  });

  it("colar a MESMA URL depois de fechar reabre o Dialog", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderEm("/tasks?task=t-vidro", <IrPara para="/tasks?task=t-vidro" rotulo="de novo" />);

    await dialogAberto();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "de novo" }));

    // O guarda de "id já resolvido" tem que ser rearmado quando o parâmetro sai da URL; sem isso o
    // mesmo link nunca mais abriria nada nesta sessão.
    const painel = await dialogAberto();
    expect(painel.getByLabelText(/^Título/)).toHaveValue(VIDRO);
  });

  it("fechar o Dialog de 'Nova tarefa' não mexe na URL", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderEm(`/tasks?project=${SACADA.id}`, <UrlAtual />);

    await user.click(screen.getByRole("button", { name: "Nova tarefa" }));
    await dialogAberto();
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // A limpeza só roda quando o `?task=` está mesmo lá — senão vira `replace` à toa no histórico.
    expect(urlNaTela()).toBe(`/tasks?project=${SACADA.id}`);
  });

  it("`/tasks` sem `?task=` não abre Dialog nenhum sozinho", async () => {
    await renderEm("/tasks");

    await waitFor(() => expect(titulosNaTela()).toEqual(TITULOS));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
