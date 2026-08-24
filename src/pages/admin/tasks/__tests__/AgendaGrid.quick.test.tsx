import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AgendaGrid } from "@/pages/admin/tasks/AgendaGrid";
import {
  fetchProjectEvents,
  fetchProjects,
  fetchTags,
  fetchTasks,
  updateTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Task } from "@/types/tasks";

/**
 * Feature 070 no mês — a visão em que o pedido ("ou até mês") é mais fácil de quebrar, porque a
 * célula do dia tem um teto de 3 chips. Prova, sem navegador: a bolinha aparece na célula do dia
 * certo, marcar deixa verde na hora (otimista) chamando `updateTask` com `status: "done"`, falha da
 * API reverte a cor e mostra o toast, e as bolinhas não roubam as vagas de chip do dia.
 */

vi.mock("@/api/tasks", () => ({
  // Feature 085: os donos do formulário/lista carregam e gravam os links externos.
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchTasks: vi.fn(),
  fetchProjects: vi.fn(),
  fetchProjectEvents: vi.fn(),
  fetchTags: vi.fn(),
  createTag: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  updateTask: vi.fn(),
  deleteProjectEvent: vi.fn(),
}));

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn(),
}));

// A agenda passou a carregar os tratamentos ativos para sintetizar as doses futuras (feature 071).
// Aqui não há nenhum, então o comportamento da 070 é exercitado exatamente como antes.
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
const mockedUpdateTask = vi.mocked(updateTask);

/** Domingo, 16/08/2026 — a grade do mês vai de 26/07 a 05/09. */
const TODAY = "2026-08-16";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Tarefa comum",
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

async function renderLoaded(tasks: Task[]) {
  mockedFetchTasks.mockResolvedValue(tasks);
  const utils = render(
    <MemoryRouter>
      <AgendaGrid />
    </MemoryRouter>
  );
  await screen.findByText("Dom");
  return utils;
}

/** A célula do mês que contém o número do dia — o `<div>` da grade, não o badge do número. */
function dayCellOf(dayNumber: string): HTMLElement {
  const badge = screen
    .getAllByText(dayNumber)
    .find((node) => node.className.includes("rounded-full"));
  if (!badge) throw new Error(`célula do dia ${dayNumber} não encontrada`);
  return badge.parentElement as HTMLElement;
}

/** O desenho da bolinha (o `<span>` dentro do botão) — é ele que fica verde. */
function dotOf(button: HTMLElement): HTMLElement {
  return button.querySelector("span") as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 16, 9, 0, 0));
  toastMock.mockReset();
  mockedFetchTasks.mockReset();
  mockedUpdateTask.mockReset().mockResolvedValue(undefined);
  mockedFetchProjects.mockReset().mockResolvedValue([]);
  mockedFetchProjectEvents.mockReset().mockResolvedValue([]);
  mockedFetchTags.mockReset().mockResolvedValue([]);
  mockedFetchRecurringTransactions.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AgendaGrid — bolinhas no mês (feature 070)", () => {
  it("a pontual aparece como bolinha na célula do dia certo, e não como chip", async () => {
    await renderLoaded([
      makeTask({ id: "q1", title: "Trocar lençol", due_time: "08:00", is_quick: true }),
    ]);

    const cell = dayCellOf("16");
    const dot = within(cell).getByRole("button", { name: "Concluir «Trocar lençol» às 08:00" });
    expect(dot).toBeInTheDocument();
    // Bolinha não escreve o título na célula (é o chip que faz isso).
    expect(within(cell).queryByText("Trocar lençol")).toBeNull();
    // E está mesmo no dia 16, não em outro.
    // Só o botão do número do dia (feature 075) — bolinha nenhuma.
    expect(within(dayCellOf("17")).queryByRole("group")).toBeNull();
  });

  it("marcar a bolinha deixa verde na hora e chama updateTask com status done", async () => {
    const user = userEvent.setup();
    await renderLoaded([
      makeTask({ id: "q1", title: "Trocar lençol", due_time: "08:00", is_quick: true }),
    ]);

    const dot = screen.getByRole("button", { name: "Concluir «Trocar lençol» às 08:00" });
    expect(dotOf(dot).className).not.toContain("bg-green-500");

    await user.click(dot);

    // Otimista: verde antes mesmo de a API responder, sem diálogo nenhum aberto.
    const done = await screen.findByRole("button", { name: "Reabrir «Trocar lençol» às 08:00" });
    expect(dotOf(done).className).toContain("bg-green-500");
    expect(done).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Editar tarefa")).toBeNull();

    expect(mockedUpdateTask).toHaveBeenCalledWith({ id: "q1", status: "done" });
  });

  it("clicar de novo reabre (status todo)", async () => {
    const user = userEvent.setup();
    await renderLoaded([
      makeTask({ id: "q1", title: "Trocar lençol", due_time: "08:00", is_quick: true, status: "done" }),
    ]);

    await user.click(screen.getByRole("button", { name: "Reabrir «Trocar lençol» às 08:00" }));

    expect(mockedUpdateTask).toHaveBeenCalledWith({ id: "q1", status: "todo" });
    const reopened = await screen.findByRole("button", { name: "Concluir «Trocar lençol» às 08:00" });
    expect(dotOf(reopened).className).not.toContain("bg-green-500");
  });

  it("falha da API reverte a cor e mostra o toast de erro", async () => {
    const user = userEvent.setup();
    mockedUpdateTask.mockRejectedValue(new Error("offline"));
    await renderLoaded([
      makeTask({ id: "q1", title: "Trocar lençol", due_time: "08:00", is_quick: true }),
    ]);

    await user.click(screen.getByRole("button", { name: "Concluir «Trocar lençol» às 08:00" }));

    // Volta a pendente (sem verde) e avisa o usuário.
    const reverted = await screen.findByRole("button", { name: "Concluir «Trocar lençol» às 08:00" });
    expect(dotOf(reverted).className).not.toContain("bg-green-500");
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      )
    );
  });

  it("as bolinhas não roubam as 3 vagas de chip do dia", async () => {
    await renderLoaded([
      makeTask({ id: "q1", title: "Losartana", due_time: "08:00", is_quick: true }),
      makeTask({ id: "q2", title: "Vitamina D", due_time: "08:00", is_quick: true }),
      makeTask({ id: "c1", title: "Comprar cimento" }),
      makeTask({ id: "c2", title: "Ligar para o banco" }),
      makeTask({ id: "c3", title: "Revisar contrato" }),
    ]);

    const cell = dayCellOf("16");
    // As três tarefas comuns continuam visíveis como chips...
    for (const title of ["Comprar cimento", "Ligar para o banco", "Revisar contrato"]) {
      expect(within(cell).getByText(title)).toBeInTheDocument();
    }
    // ...sem "+N mais" (o overflow conta só os chips)...
    expect(within(cell).queryByText(/\+\d+ mais/)).toBeNull();
    // ...e as duas bolinhas aparecem além delas.
    expect(within(cell).getByRole("button", { name: /Concluir «Losartana»/ })).toBeInTheDocument();
    expect(within(cell).getByRole("button", { name: /Concluir «Vitamina D»/ })).toBeInTheDocument();
  });

  it("o +N mais do dia continua contando só os chips", async () => {
    await renderLoaded([
      makeTask({ id: "q1", title: "Losartana", due_time: "08:00", is_quick: true }),
      makeTask({ id: "c1", title: "Comprar cimento" }),
      makeTask({ id: "c2", title: "Ligar para o banco" }),
      makeTask({ id: "c3", title: "Revisar contrato" }),
      makeTask({ id: "c4", title: "Pagar boleto" }),
    ]);

    const cell = dayCellOf("16");
    // 4 chips com teto de 3 -> "+1 mais" (não "+2", que seria contar a bolinha junto).
    expect(within(cell).getByText("+1 mais")).toBeInTheDocument();
  });
});

describe("AgendaGrid — bolinhas em semana e dia (feature 070)", () => {
  it("na semana, a pontual é bolinha no canvas de horas e a comum continua bloco", async () => {
    const user = userEvent.setup();
    await renderLoaded([
      makeTask({ id: "q1", title: "Losartana", due_time: "08:00", is_quick: true }),
      makeTask({ id: "n1", title: "Reunião", due_time: "09:00", estimated_duration: 60 }),
    ]);

    await user.click(screen.getByRole("tab", { name: "Semana" }));
    expect(await screen.findByText("00:00")).toBeInTheDocument();

    expect(
      await screen.findByRole("button", { name: "Concluir «Losartana» às 08:00" })
    ).toBeInTheDocument();
    // A tarefa comum segue sendo bloco (com o título visível dentro dele).
    expect(screen.getByRole("button", { name: /Reunião/ })).toBeInTheDocument();
  });

  it("no dia, marcar a bolinha conclui sem abrir diálogo", async () => {
    const user = userEvent.setup();
    await renderLoaded([
      makeTask({ id: "q1", title: "Trocar escova", due_time: "07:30", is_quick: true }),
    ]);

    await user.click(screen.getByRole("tab", { name: "Dia" }));
    expect(await screen.findByText("00:00")).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Concluir «Trocar escova» às 07:30" }));

    expect(mockedUpdateTask).toHaveBeenCalledWith({ id: "q1", status: "done" });
    expect(screen.queryByText("Editar tarefa")).toBeNull();
    const done = await screen.findByRole("button", { name: "Reabrir «Trocar escova» às 07:30" });
    expect(dotOf(done).className).toContain("bg-green-500");
  });

  it("o número do dia abre o modal do dia, com os chips normais para editar a pontual", async () => {
    const user = userEvent.setup();
    await renderLoaded([
      makeTask({ id: "q1", title: "Trocar escova", due_time: "07:30", is_quick: true }),
    ]);

    await user.click(screen.getByRole("tab", { name: "Dia" }));
    expect(await screen.findByText("00:00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver tudo do dia 16" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Trocar escova")).toBeInTheDocument();
  });
});

/**
 * Verificação do pedido literal da feature 070, por teste e não no navegador: **um mesmo dia** com
 * três pontuais (duas às 08:00, uma sem horário) e uma tarefa comum de uma hora, checado nas três
 * visões — "na visualização de semana/dia ou até mês eu consiga marcar a bolinha, ela fica verde".
 */
const CENARIO_DO_PROMPT = () => [
  makeTask({ id: "q1", title: "Losartana", due_time: "08:00", is_quick: true }),
  makeTask({ id: "q2", title: "Vitamina D", due_time: "08:00", is_quick: true }),
  makeTask({ id: "q3", title: "Trocar lençol", due_time: null, is_quick: true }),
  makeTask({ id: "n1", title: "Reunião de obra", due_time: "09:00", estimated_duration: 60 }),
];

/** Marca as três bolinhas uma a uma e confere: verde na hora, `aria-pressed`, nenhum diálogo. */
async function marcarAsTresBolinhas(user: ReturnType<typeof userEvent.setup>) {
  for (const [titulo, sufixo] of [
    ["Losartana", " às 08:00"],
    ["Vitamina D", " às 08:00"],
    ["Trocar lençol", ""],
  ] as const) {
    await user.click(screen.getByRole("button", { name: `Concluir «${titulo}»${sufixo}` }));
    const verde = await screen.findByRole("button", { name: `Reabrir «${titulo}»${sufixo}` });
    expect(dotOf(verde).className).toContain("bg-green-500");
    expect(verde).toHaveAttribute("aria-pressed", "true");
    // "sem abrir diálogo nenhum": o formulário de tarefa nunca aparece.
    expect(screen.queryByRole("dialog")).toBeNull();
  }

  expect(mockedUpdateTask).toHaveBeenCalledWith({ id: "q1", status: "done" });
  expect(mockedUpdateTask).toHaveBeenCalledWith({ id: "q2", status: "done" });
  expect(mockedUpdateTask).toHaveBeenCalledWith({ id: "q3", status: "done" });
}

describe("AgendaGrid — o pedido literal, nas três visões (feature 070)", () => {
  it("mês: as três pontuais são bolinhas na célula do dia, a comum continua chip, e marcar deixa verde", async () => {
    const user = userEvent.setup();
    await renderLoaded(CENARIO_DO_PROMPT());

    const cell = dayCellOf("16");
    const fileira = within(cell).getByRole("group", { name: /Tarefas pontuais de 16 de agosto/ });
    expect(within(fileira).getAllByRole("button")).toHaveLength(3);
    // A tarefa comum de uma hora não virou bolinha: continua chip, com o título escrito.
    expect(within(cell).getByText("Reunião de obra")).toBeInTheDocument();
    expect(within(fileira).queryByRole("button", { name: /Reunião de obra/ })).toBeNull();

    await marcarAsTresBolinhas(user);
  });

  it("semana: as duas das 08:00 dividem a mesma fileira no topo do horário, a sem horário fica na faixa 'Sem horário', e a comum continua bloco", async () => {
    const user = userEvent.setup();
    await renderLoaded(CENARIO_DO_PROMPT());

    await user.click(screen.getByRole("tab", { name: "Semana" }));
    expect(await screen.findByText("00:00")).toBeInTheDocument();

    // "uma na frente da outra, no prazo marcado": mesma fileira, posicionada no top de 08:00.
    const fileira08 = screen.getByRole("group", { name: "Tarefas pontuais às 08:00" });
    expect(within(fileira08).getAllByRole("button")).toHaveLength(2);
    expect(
      within(fileira08).getByRole("button", { name: "Concluir «Losartana» às 08:00" })
    ).toBeInTheDocument();
    expect(
      within(fileira08).getByRole("button", { name: "Concluir «Vitamina D» às 08:00" })
    ).toBeInTheDocument();
    // 8h de 24h = 33.33% do canvas.
    expect((fileira08.parentElement as HTMLElement).style.top).toMatch(/^33\.33/);

    // A pontual sem horário é bolinha na faixa "Sem horário", não chip de largura inteira.
    const fileiraSemHorario = screen.getByRole("group", { name: "Tarefas pontuais sem horário" });
    expect(
      within(fileiraSemHorario).getByRole("button", { name: "Concluir «Trocar lençol»" })
    ).toBeInTheDocument();

    // A tarefa comum de 1h continua bloco no canvas de horas, com o título dentro.
    const bloco = screen.getByRole("button", { name: /Reunião de obra/ });
    expect(bloco.closest("[style*='height']")).not.toBeNull();

    await marcarAsTresBolinhas(user);
  });

  it("dia: mesmas bolinhas e mesmo bloco, e marcar cada uma deixa verde sem abrir diálogo", async () => {
    const user = userEvent.setup();
    await renderLoaded(CENARIO_DO_PROMPT());

    await user.click(screen.getByRole("tab", { name: "Dia" }));
    expect(await screen.findByText("00:00")).toBeInTheDocument();

    const fileira08 = screen.getByRole("group", { name: "Tarefas pontuais às 08:00" });
    expect(within(fileira08).getAllByRole("button")).toHaveLength(2);
    expect(
      within(screen.getByRole("group", { name: "Tarefas pontuais sem horário" })).getAllByRole("button")
    ).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Reunião de obra/ })).toBeInTheDocument();

    await marcarAsTresBolinhas(user);
  });
});
