import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AgendaGrid } from "@/pages/admin/tasks/AgendaGrid";
import { fetchProjectEvents, fetchProjects, fetchTags, fetchTasks, updateTask } from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import { formatLocalIsoDate } from "@/lib/dates";
import type { Task } from "@/types/tasks";

/**
 * Feature 072 — o gesto que o prompt pede, ponta a ponta: "eu consiga marcar a bolinha, ela fica
 * verde e sabemos que a tarefa foi concluída". Sem navegador na verificação, é este arquivo que
 * prova o update otimista (verde **antes** da resposta da API), a chamada real de `updateTask` e a
 * reversão da cor quando a API falha.
 */

vi.mock("@/api/tasks", () => ({
  fetchTasks: vi.fn(),
  fetchProjects: vi.fn(),
  fetchProjectEvents: vi.fn(),
  fetchTags: vi.fn(),
  createTag: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  updateTask: vi.fn(),
  createProjectEvent: vi.fn(),
  updateProjectEvent: vi.fn(),
  deleteProjectEvent: vi.fn(),
}));

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn(),
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
const mockedUpdateTask = vi.mocked(updateTask);

const TODAY = formatLocalIsoDate(new Date());

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Tarefa qualquer",
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

/** Tarefa pontual pelo controle explícito do usuário: `estimated_duration === 0` (feature 072). */
function pointTask(overrides: Partial<Task> = {}): Task {
  return makeTask({ estimated_duration: 0, due_time: "08:00", ...overrides });
}

async function renderLoaded() {
  const utils = render(
    <MemoryRouter>
      <AgendaGrid />
    </MemoryRouter>
  );
  await screen.findByText("Dom");
  return utils;
}

beforeEach(() => {
  toastMock.mockReset();
  mockedFetchTasks.mockReset().mockResolvedValue([]);
  mockedFetchProjects.mockReset().mockResolvedValue([]);
  mockedFetchProjectEvents.mockReset().mockResolvedValue([]);
  mockedFetchTags.mockReset().mockResolvedValue([]);
  mockedFetchRecurringTransactions.mockReset().mockResolvedValue([]);
  mockedUpdateTask.mockReset().mockResolvedValue(undefined);
});

describe("AgendaGrid — marcar a bolinha de uma tarefa pontual (feature 072)", () => {
  it("clicar na bolinha pinta de verde ANTES da resposta da API e chama updateTask com status done", async () => {
    const user = userEvent.setup();
    mockedFetchTasks.mockResolvedValue([pointTask({ id: "med-1", title: "Remédio" })]);
    // Promise presa: prova que o verde não espera a rede (update otimista).
    let resolveUpdate: () => void = () => {};
    mockedUpdateTask.mockImplementation(
      () => new Promise<void>((resolve) => (resolveUpdate = () => resolve()))
    );

    await renderLoaded();

    await user.click(screen.getByRole("button", { name: "Concluir: Remédio (08:00)" }));

    const marcada = screen.getByRole("button", { name: "Reabrir: Remédio (08:00)" });
    expect(marcada).toHaveAttribute("aria-pressed", "true");
    expect(marcada.className).toContain("bg-success");
    expect(mockedUpdateTask).toHaveBeenCalledWith({ id: "med-1", status: "done" });

    resolveUpdate();
  });

  it("clicar de novo volta a tarefa para todo", async () => {
    const user = userEvent.setup();
    mockedFetchTasks.mockResolvedValue([pointTask({ id: "med-1", title: "Remédio", status: "done" })]);

    await renderLoaded();

    await user.click(screen.getByRole("button", { name: "Reabrir: Remédio (08:00)" }));

    expect(mockedUpdateTask).toHaveBeenCalledWith({ id: "med-1", status: "todo" });
    const pendente = screen.getByRole("button", { name: "Concluir: Remédio (08:00)" });
    expect(pendente).toHaveAttribute("aria-pressed", "false");
    expect(pendente.className).not.toContain("bg-success");
  });

  it("falha da API reverte a cor da bolinha e mostra toast destrutivo", async () => {
    const user = userEvent.setup();
    mockedFetchTasks.mockResolvedValue([pointTask({ id: "med-1", title: "Remédio" })]);
    mockedUpdateTask.mockRejectedValue(new Error("sem rede"));

    await renderLoaded();

    await user.click(screen.getByRole("button", { name: "Concluir: Remédio (08:00)" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Concluir: Remédio (08:00)" })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
    });
    expect(screen.getByRole("button", { name: "Concluir: Remédio (08:00)" }).className).not.toContain(
      "bg-success"
    );
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Erro", variant: "destructive" })
    );
  });
});

describe("AgendaGrid — visão Mês: bolinhas fora da contagem de chips (feature 072)", () => {
  it("dia com 4 remédios + 3 tarefas comuns mostra 4 bolinhas e os 3 chips, sem '+N mais'", async () => {
    mockedFetchTasks.mockResolvedValue([
      ...Array.from({ length: 4 }, (_, i) =>
        pointTask({ id: `med-${i}`, title: `Remédio ${i}`, due_time: `0${7 + i}:00` })
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        makeTask({ id: `comum-${i}`, title: `Tarefa comum ${i}`, due_time: "14:00" })
      ),
    ]);

    await renderLoaded();

    const fileira = screen.getByRole("group", { name: /^Tarefas pontuais/ });
    expect(within(fileira).getAllByRole("button", { name: /^Concluir: Remédio/ })).toHaveLength(4);
    for (let i = 0; i < 3; i++) {
      expect(screen.getByText(`Tarefa comum ${i}`)).toBeInTheDocument();
    }
    // Nenhum "+N mais" de chip: as 4 bolinhas não gastaram nenhum dos 3 chips do dia.
    expect(screen.queryByText(/mais$/)).toBeNull();
    // O rótulo da fileira é o caminho para abrir a tarefa (a bolinha só conclui).
    expect(within(fileira).getByText("4 pontuais")).toBeInTheDocument();
  });

  it("com 4 pontuais e 5 tarefas comuns, o '+N mais' conta só as comuns que sobraram", async () => {
    mockedFetchTasks.mockResolvedValue([
      ...Array.from({ length: 4 }, (_, i) =>
        pointTask({ id: `med-${i}`, title: `Remédio ${i}`, due_time: `0${7 + i}:00` })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeTask({ id: `comum-${i}`, title: `Tarefa comum ${i}`, due_time: "14:00" })
      ),
    ]);

    await renderLoaded();

    // 5 comuns - 3 chips visíveis = +2 mais (as 4 bolinhas não entram na conta).
    expect(screen.getByText("+2 mais")).toBeInTheDocument();
  });

  it("acima de 8 pontuais no dia, o '+N' da fileira abre o dialog do dia", async () => {
    const user = userEvent.setup();
    mockedFetchTasks.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) =>
        pointTask({ id: `med-${i}`, title: `Remédio ${i}`, due_time: "08:00" })
      )
    );

    await renderLoaded();

    await user.click(screen.getByText("+4"));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

describe("AgendaGrid — visão Semana/Dia também marca a bolinha (feature 072)", () => {
  it("na visão Semana a bolinha continua marcável e chama updateTask", async () => {
    const user = userEvent.setup();
    mockedFetchTasks.mockResolvedValue([pointTask({ id: "med-1", title: "Remédio" })]);

    await renderLoaded();
    await user.click(screen.getByRole("tab", { name: "Semana" }));
    await screen.findByText("00:00");

    await user.click(screen.getByRole("button", { name: "Concluir: Remédio (08:00)" }));

    expect(mockedUpdateTask).toHaveBeenCalledWith({ id: "med-1", status: "done" });
    expect(screen.getByRole("button", { name: "Reabrir: Remédio (08:00)" }).className).toContain(
      "bg-success"
    );
  });

  it("na visão Dia a bolinha continua marcável e chama updateTask", async () => {
    const user = userEvent.setup();
    mockedFetchTasks.mockResolvedValue([pointTask({ id: "med-1", title: "Remédio" })]);

    await renderLoaded();
    await user.click(screen.getByRole("tab", { name: "Dia" }));
    await screen.findByText("00:00");

    await user.click(screen.getByRole("button", { name: "Concluir: Remédio (08:00)" }));

    expect(mockedUpdateTask).toHaveBeenCalledWith({ id: "med-1", status: "done" });
  });
});

describe("AgendaGrid — editar uma tarefa pontual não apaga a pontualidade (feature 072)", () => {
  /** A bolinha só conclui; quem abre o form é o rótulo da fileira -> dialog do dia -> chip. */
  async function abrirFormDoPontual(user: ReturnType<typeof userEvent.setup>) {
    await renderLoaded();
    await user.click(screen.getByText("1 pontuais"));
    await user.click(await screen.findByRole("button", { name: /Remédio/ }));
    return screen.findByRole("button", { name: "Salvar alterações" });
  }

  it("salvar sem mexer em nada mantém estimated_duration 0 (e as flags de medicação/consulta)", async () => {
    const user = userEvent.setup();
    mockedFetchTasks.mockResolvedValue([
      pointTask({ id: "med-1", title: "Remédio", is_medication: true }),
    ]);

    const salvar = await abrirFormDoPontual(user);
    await user.click(salvar);

    expect(mockedUpdateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "med-1",
        estimated_duration: 0,
        is_medication: true,
        is_consultation: false,
      })
    );
  });

  it("tarefa comum aberta pelo mesmo caminho continua com estimated_duration null", async () => {
    const user = userEvent.setup();
    mockedFetchTasks.mockResolvedValue([
      pointTask({ id: "med-1", title: "Remédio" }),
      makeTask({ id: "comum-1", title: "Revisar contrato", due_time: "14:00" }),
    ]);

    await renderLoaded();
    await user.click(screen.getByText("Revisar contrato"));
    await user.click(await screen.findByRole("button", { name: "Salvar alterações" }));

    expect(mockedUpdateTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: "comum-1", estimated_duration: null })
    );
  });
});
