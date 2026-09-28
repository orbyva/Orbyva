import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TaskList from "@/pages/admin/tasks/TaskList";
import ProjectDetail from "@/pages/admin/tasks/ProjectDetail";
import {
  countTaskSeries,
  deleteTaskSeries,
  deleteTasks,
  fetchDependencies,
  fetchProjectById,
  fetchProjectEvents,
  fetchProjects,
  fetchTags,
  fetchTasks,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import {
  endMedicationAndDeleteFutureDoses,
  fetchMedications,
} from "@/api/health/medications";
import type { Project, Task } from "@/types/tasks";

/**
 * Feature 075 — regressão do bug do escopo vindo do cliente.
 *
 * Antes desta feature, "excluir todas as ocorrências" mandava para a API a lista de ids que
 * `findSeriesTasks` conseguisse achar **no array carregado na tela**. Em `ProjectDetail` esse array
 * é `taskList.filter(t => t.project_id === id)` — as ocorrências da mesma série em outro projeto
 * (ou sem projeto, como toda dose de medicação) simplesmente não estavam lá, e o botão apagava um
 * pedaço da série em silêncio.
 *
 * Os dois testes abaixo montam exatamente esse cenário — uma tela mostrando **uma** linha de uma
 * série que tem várias — e provam duas coisas: a exclusão manda a **opção** (o servidor resolve o
 * conjunto), e o número no botão é o do servidor, não o que dá para contar na tela.
 */


// O guia do módulo depende do `AuthProvider` e não tem nada a ver com o que este teste afirma.
vi.mock("@/components/ModuleGuide", () => ({
  ModuleGuide: () => null,
  ModuleGuideButton: () => null,
}));

vi.mock("@/api/tasks", () => ({
  // Feature 085: os donos do formulário/lista carregam e gravam os links externos.
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchTasks: vi.fn(),
  fetchProjects: vi.fn(),
  fetchProjectById: vi.fn(),
  fetchProjectEvents: vi.fn(),
  fetchTags: vi.fn(),
  fetchDependencies: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  deleteTasks: vi.fn(),
  deleteTaskSeries: vi.fn(),
  countTaskSeries: vi.fn(),
  createTag: vi.fn(),
  updateProject: vi.fn(),
  createProjectEvent: vi.fn(),
  deleteProjectEvent: vi.fn(),
}));

// Feature 131: a biblioteca de assets importa `@/api/tasks/iconAssets` direto (nunca o barril, que
// arrastaria a API de tarefas inteira para o chunk de quem a monta) — é este mock que a intercepta.
vi.mock("@/api/tasks/iconAssets", () => ({
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
}));


vi.mock("@/api/health/medications", () => ({
  fetchMedications: vi.fn(async () => []),
  endMedicationAndDeleteFutureDoses: vi.fn(),
  EndMedicationError: class EndMedicationError extends Error {},
  createMedicationWithDoses: vi.fn(),
  updateMedication: vi.fn(),
}));

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn(),
  createRecurringApi: vi.fn(),
}));

vi.mock("@/hooks/useDimensions", () => ({
  useDimensions: () => ({ dimensions: [], loading: false, error: null, refetch: vi.fn() }),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const PROJECT_ID = "project-1";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Tarefa",
    status: "todo",
    tag_ids: [],
    due_date: "2026-08-20",
    due_time: null,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    ...overrides,
  } as Task;
}

/** A única ocorrência da série que a tela consegue enxergar. */
const ocorrenciaVisivel = makeTask({
  id: "oco-visivel",
  project_id: PROJECT_ID,
  title: "Trocar o lençol",
  recurrence_origin_id: "origem",
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchProjects).mockResolvedValue([]);
  vi.mocked(fetchTags).mockResolvedValue([]);
  vi.mocked(fetchDependencies).mockResolvedValue([]);
  vi.mocked(fetchProjectEvents).mockResolvedValue([]);
  vi.mocked(fetchRecurringTransactions).mockResolvedValue([]);
  vi.mocked(countTaskSeries).mockResolvedValue(9);
  vi.mocked(deleteTaskSeries).mockResolvedValue(9);
});

/** Abre o `TaskDeleteDialog` da única linha da tela e devolve o dialog aberto. */
async function abrirExclusao(user: ReturnType<typeof userEvent.setup>) {
  // Com o filtro de projeto ativo a Lista ainda mostra o título no painel do projeto; a linha que
  // interessa é a que tem os botões de ação.
  const linhas = screen
    .getAllByText("Trocar o lençol")
    .map((el) => el.closest("div[class*='rounded']") as HTMLElement | null)
    .filter((el): el is HTMLElement => !!el && within(el).queryAllByRole("button").length > 0);
  const botoes = within(linhas[linhas.length - 1]).getAllByRole("button");
  // O `Trash2` é o último botão de ação da linha (depois de editar).
  await user.click(botoes[botoes.length - 1]);
  return within(await screen.findByRole("alertdialog"));
}

describe("TaskList — a exclusão da série não depende da lista da tela", () => {
  it("com filtro de projeto ativo, apaga a série inteira e mostra a contagem do servidor", async () => {
    vi.mocked(fetchTasks).mockResolvedValue([ocorrenciaVisivel]);
    vi.mocked(fetchProjects).mockResolvedValue([
      { id: PROJECT_ID, name: "Casa", status: "active", tag_ids: [] } as Project,
    ]);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TaskList />
      </MemoryRouter>
    );
    await screen.findByText("Trocar o lençol");

    // Filtro de projeto ativo — a tela passa a mostrar só o que é do projeto "Casa".
    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "Casa" }));
    await screen.findAllByText("Trocar o lençol");

    const dialog = await abrirExclusao(user);

    // A tela tem UMA ocorrência; o botão promete nove, porque quem conta é o servidor.
    const apagarTudo = await dialog.findByRole("button", {
      name: "Excluir todas as ocorrências (9)",
    });
    await user.click(apagarTudo);

    expect(deleteTaskSeries).toHaveBeenCalledWith(ocorrenciaVisivel, { mode: "series" });
    // O caminho antigo (montar ids no cliente) não é mais usado.
    expect(deleteTasks).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "9 tarefas excluídas" })
    );
  });

  it("exclusão que falha mostra toast destrutivo e a tarefa continua na tela", async () => {
    vi.mocked(fetchTasks).mockResolvedValue([ocorrenciaVisivel]);
    vi.mocked(deleteTaskSeries).mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TaskList />
      </MemoryRouter>
    );
    await screen.findByText("Trocar o lençol");

    const dialog = await abrirExclusao(user);
    await user.click(
      await dialog.findByRole("button", { name: "Excluir todas as ocorrências (9)" })
    );

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      )
    );
    // Nada some da tela: a linha continua lá e não houve recarga.
    expect(screen.getAllByText("Trocar o lençol").length).toBeGreaterThan(0);
    expect(vi.mocked(fetchTasks)).toHaveBeenCalledTimes(1);
  });
});

describe("ProjectDetail — a série continua inteira mesmo com a tela recortada pelo projeto", () => {
  it("apaga a série inteira, não só as ocorrências deste projeto", async () => {
    // `ProjectDetail` só guarda as tarefas com `project_id === id`: as irmãs desta série moram em
    // outro projeto e nunca chegam ao cliente. Era exatamente aqui que o botão apagava pela metade.
    vi.mocked(fetchProjectById).mockResolvedValue({
      id: PROJECT_ID,
      name: "Casa",
      status: "active",
      tag_ids: [],
    } as Project);
    vi.mocked(fetchTasks).mockResolvedValue([
      ocorrenciaVisivel,
      makeTask({ id: "oco-outro-projeto", project_id: "project-2", recurrence_origin_id: "origem" }),
      makeTask({ id: "origem", project_id: "project-2", recurrence_rule: { frequency: "weekly", interval: 1 } }),
    ]);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[`/tasks/projects/${PROJECT_ID}`]}>
        <Routes>
          <Route path="/tasks/projects/:id" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findAllByText("Trocar o lençol");
    await user.click(screen.getByRole("tab", { name: "Lista" }));

    const dialog = await abrirExclusao(user);
    await user.click(
      await dialog.findByRole("button", { name: "Excluir todas as ocorrências (9)" })
    );

    expect(deleteTaskSeries).toHaveBeenCalledWith(ocorrenciaVisivel, { mode: "series" });
    expect(deleteTasks).not.toHaveBeenCalled();
  });
});

/**
 * Feature 075 — o pedido literal do usuário, na Lista: "i'm unable to delete it… make a forms with
 * the possibility to delete all the items".
 *
 * A partir da dose de um tratamento **ativo** (o caso "SEMTRI"), um dialog só resolve: a tarefa some
 * da tela e não volta, porque a mesma ação encerra o tratamento. Que encerrar é o que impede a
 * recriação está provado contra o banco falso em `src/api/__tests__/health.medications.test.ts`
 * ("com o tratamento ativo… ela volta na carga seguinte" × "encerrando o tratamento junto… não
 * volta"); aqui o que se prova é que a tela oferece esse caminho e chega até ele.
 */
describe("TaskList — o pedido literal: apagar a SEMTRI e ela não voltar", () => {
  const doseSemtri = makeTask({
    id: "dose-semtri",
    title: "SEMTRI",
    medication_id: "med-1",
    is_medication: true,
    dose_time: "08:00",
  });

  it("um dialog só encerra o tratamento e faz a dose sumir", async () => {
    vi.mocked(fetchTasks).mockResolvedValue([doseSemtri]);
    vi.mocked(fetchMedications).mockResolvedValue([
      { id: "med-1", name: "SEMTRI", active: true },
    ] as never);
    vi.mocked(endMedicationAndDeleteFutureDoses).mockResolvedValue(5);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TaskList />
      </MemoryRouter>
    );
    await screen.findByText("SEMTRI");

    const linhas = screen
      .getAllByText("SEMTRI")
      .map((el) => el.closest("div[class*='rounded']") as HTMLElement | null)
      .filter((el): el is HTMLElement => !!el && within(el).queryAllByRole("button").length > 0);
    const botoes = within(linhas[linhas.length - 1]).getAllByRole("button");
    await user.click(botoes[botoes.length - 1]);

    const dialog = within(await screen.findByRole("alertdialog"));
    // O dialog explica o que ninguém explicava: apagar só a dose não resolve.
    expect(dialog.getByText(/voltam/)).toBeInTheDocument();

    // A carga seguinte já não traz a dose — o tratamento acabou de ser encerrado.
    vi.mocked(fetchTasks).mockResolvedValue([]);
    await user.click(
      await dialog.findByRole("button", {
        name: /^Encerrar o tratamento e apagar as doses futuras/,
      })
    );

    await waitFor(() =>
      expect(endMedicationAndDeleteFutureDoses).toHaveBeenCalledWith(doseSemtri)
    );
    await waitFor(() => expect(screen.queryByText("SEMTRI")).toBeNull());
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "5 tarefas excluídas",
        description: expect.stringContaining("não voltam"),
      })
    );
  });
});
