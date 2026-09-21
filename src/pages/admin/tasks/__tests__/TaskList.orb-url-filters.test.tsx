import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
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

const { fetchTasks } = await import("@/api/tasks");
const mockedFetchTasks = vi.mocked(fetchTasks);

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
