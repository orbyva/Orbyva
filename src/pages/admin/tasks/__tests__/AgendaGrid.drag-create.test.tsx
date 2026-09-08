import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AgendaGrid } from "@/pages/admin/tasks/AgendaGrid";
import {
  createProjectEvent,
  createTask,
  fetchProjectEvents,
  fetchProjects,
  fetchTags,
  fetchTasks,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import { formatLocalIsoDate } from "@/lib/dates";
import type { Project, ProjectEvent, Task } from "@/types/tasks";

/**
 * Feature 104 — o gesto de ponta a ponta: arrastar na grade de horas desenha a faixa, o menu
 * pergunta "Evento ou Tarefa?" e o formulário abre **já com o horário desenhado**. O que este
 * arquivo prova é justamente a costura que o teste de componente (`AgendaHourGrid.drag.test.tsx`)
 * não alcança: que a faixa vira payload de `createProjectEvent`/`createTask`.
 */

vi.mock("@/api/tasks", () => ({
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
  createProjectEvent: vi.fn(),
  updateProjectEvent: vi.fn(),
  deleteProjectEvent: vi.fn(),
}));

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn(),
}));

vi.mock("@/api/health/medications", () => ({
  fetchMedications: vi.fn(async () => []),
  endMedicationAndDeleteFutureDoses: vi.fn(),
  EndMedicationError: class extends Error {},
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
const mockedCreateProjectEvent = vi.mocked(createProjectEvent);
const mockedCreateTask = vi.mocked(createTask);
const mockedFetchRecurringTransactions = vi.mocked(fetchRecurringTransactions);

const ALPHA: Project = { id: "p-alpha", name: "Alpha", status: "active", tag_ids: [] };

/** A visão Dia abre no dia de hoje — é a coluna em que o arrasto acontece. */
const HOJE = new Date();
const HOJE_ISO = formatLocalIsoDate(HOJE);

/** Coluna fingida com 1440px de altura: 1px = 1 minuto, então `clientY: 540` é 09:00. */
const COLUMN_PX = 1440;

function makeEvent(overrides: Partial<ProjectEvent> = {}): ProjectEvent {
  return {
    id: "ev-1",
    project_id: null,
    title: "Reunião",
    starts_at: `${HOJE_ISO}T09:00:00`,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Estudar",
    status: "todo",
    tag_ids: [],
    due_date: HOJE_ISO,
    due_time: null,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    ...overrides,
  };
}

function stubColumnRect(el: HTMLElement) {
  el.getBoundingClientRect = () =>
    ({
      top: 0,
      left: 0,
      right: 200,
      bottom: COLUMN_PX,
      width: 200,
      height: COLUMN_PX,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

const POINTER = { pointerId: 1, button: 0, pointerType: "mouse", clientX: 50 };

/** Arrasta na coluna do dia de `de` até `ate` (minutos desde a meia-noite). */
function arrastar(col: HTMLElement, de: number, ate: number) {
  fireEvent.pointerDown(col, { ...POINTER, clientY: de });
  fireEvent.pointerMove(col, { ...POINTER, clientY: ate });
  fireEvent.pointerUp(col, { ...POINTER, clientY: ate });
}

async function renderVisaoDia(user: ReturnType<typeof userEvent.setup>) {
  render(
    <MemoryRouter>
      <AgendaGrid />
    </MemoryRouter>
  );
  await screen.findByText("Dom");
  await user.click(screen.getByRole("tab", { name: "Dia" }));
  const col = await screen.findByTestId(`day-column-${HOJE_ISO}`);
  stubColumnRect(col);
  return col;
}

beforeEach(() => {
  localStorage.clear();
  mockedFetchTasks.mockReset().mockResolvedValue([]);
  mockedFetchProjects.mockReset().mockResolvedValue([ALPHA]);
  mockedFetchProjectEvents.mockReset().mockResolvedValue([]);
  mockedFetchTags.mockReset().mockResolvedValue([]);
  mockedCreateProjectEvent.mockReset().mockResolvedValue(makeEvent());
  mockedCreateTask.mockReset().mockResolvedValue(makeTask());
  mockedFetchRecurringTransactions.mockReset().mockResolvedValue([]);
  toastMock.mockReset();
});

describe("AgendaGrid — arrastar na grade e criar evento (feature 104)", () => {
  it("arrastar das 09:00 às 10:30 → «Evento» abre o formulário com data, início e fim da faixa", async () => {
    const user = userEvent.setup();
    const col = await renderVisaoDia(user);

    arrastar(col, 9 * 60, 10 * 60 + 30);

    // O menu abre ancorado na faixa, com os mesmos dois itens do botão "Novo" (feature 103).
    await user.click(await screen.findByRole("menuitem", { name: "Evento" }));
    await screen.findByText("Novo evento");

    expect(screen.getByLabelText(/^Data/)).toHaveValue(HOJE_ISO);
    expect(screen.getByLabelText(/^Início/)).toHaveValue("09:00");
    expect(screen.getByLabelText(/^Fim/)).toHaveValue("10:30");
  });

  it("salvar grava o evento com ends_at correspondente à duração arrastada", async () => {
    const user = userEvent.setup();
    const col = await renderVisaoDia(user);

    arrastar(col, 9 * 60, 10 * 60 + 30);
    await user.click(await screen.findByRole("menuitem", { name: "Evento" }));
    await screen.findByText("Novo evento");
    await user.type(screen.getByLabelText(/^Título/), "Reunião");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mockedCreateProjectEvent).toHaveBeenCalledTimes(1));
    const [payload] = mockedCreateProjectEvent.mock.calls[0];
    const inicio = new Date(payload.starts_at);
    const fim = new Date(payload.ends_at!);
    expect(inicio.getHours()).toBe(9);
    expect(inicio.getMinutes()).toBe(0);
    // 90 min de faixa arrastada viram 90 min de evento — não os 30 min de fallback.
    expect((fim.getTime() - inicio.getTime()) / 60000).toBe(90);
    expect(fim.getHours()).toBe(10);
    expect(fim.getMinutes()).toBe(30);
  });
});

describe("AgendaGrid — a mesma faixa criando tarefa (feature 104)", () => {
  it("«Tarefa» abre o formulário e grava due_date, due_time e estimated_duration da faixa", async () => {
    const user = userEvent.setup();
    const criada = makeTask({ due_time: "09:00", estimated_duration: 90 });
    mockedCreateTask.mockResolvedValue(criada);
    mockedFetchTasks.mockResolvedValueOnce([]).mockResolvedValue([criada]);
    const col = await renderVisaoDia(user);

    arrastar(col, 9 * 60, 10 * 60 + 30);
    await user.click(await screen.findByRole("menuitem", { name: "Tarefa" }));
    await screen.findByText("Nova tarefa");

    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText(/^Título/), "Estudar");
    await user.click(dialog.getByRole("button", { name: "Criar tarefa" }));

    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Estudar",
        due_date: HOJE_ISO,
        due_time: "09:00",
        estimated_duration: 90,
      })
    );

    // E a tarefa reaparece no mesmo lugar da grade depois do reload: bloco posicionado às 09:00
    // com a altura dos 90 minutos (é o que `getItemTimeRange` lê desses dois campos).
    const bloco = (await screen.findByRole("button", { name: /Estudar/ })).closest(
      'div[style*="top"]'
    ) as HTMLElement;
    expect(bloco.style.top).toBe(`${(540 / 1440) * 100}%`);
    expect(bloco.style.height).toBe(`${(90 / 1440) * 100}%`);
  });
});

describe("AgendaGrid — onde o gesto não vale (feature 104)", () => {
  it("na visão Mês não há canvas de horas: arrastar numa célula não cria nada", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AgendaGrid />
      </MemoryRouter>
    );
    await screen.findByText("Dom");

    // A visão Mês é a que abre por padrão — nenhuma coluna de dia com eixo de tempo existe aqui.
    expect(screen.queryByTestId(`day-column-${HOJE_ISO}`)).not.toBeInTheDocument();

    // A célula do dia não vira faixa nem por acidente: o caminho de criar ali continua sendo o `+`.
    const celula = screen.getAllByRole("button", { name: /^Ver tudo do dia / })[0]
      .parentElement as HTMLElement;
    fireEvent.pointerDown(celula, { ...POINTER, clientY: 9 * 60 });
    fireEvent.pointerMove(celula, { ...POINTER, clientY: 10 * 60 });
    fireEvent.pointerUp(celula, { ...POINTER, clientY: 10 * 60 });

    expect(screen.queryByRole("menuitem", { name: "Evento" })).not.toBeInTheDocument();
    expect(screen.queryByText("Novo evento")).not.toBeInTheDocument();

    // Contraprova: o `+` da 103 continua sendo o caminho de criação da célula do mês.
    await user.click(screen.getAllByRole("button", { name: /^Novo item em / })[0]);
    expect(await screen.findByRole("menuitem", { name: "Evento" })).toBeInTheDocument();
  });

  it("arrastar na faixa «Sem horário» não cria nada — não há eixo de tempo ali", async () => {
    const user = userEvent.setup();
    mockedFetchTasks.mockResolvedValue([makeTask({ title: "Sem hora", due_time: null })]);
    await renderVisaoDia(user);

    // A faixa existe (a tarefa sem horário está nela), mas é fundo morto para o gesto.
    const faixa = screen.getByText("Sem horário").parentElement as HTMLElement;
    const celulaDoDia = faixa.querySelectorAll(":scope > div")[1] as HTMLElement;
    fireEvent.pointerDown(celulaDoDia, { ...POINTER, clientY: 9 * 60 });
    fireEvent.pointerMove(celulaDoDia, { ...POINTER, clientY: 10 * 60 });
    fireEvent.pointerUp(celulaDoDia, { ...POINTER, clientY: 10 * 60 });

    expect(screen.queryByRole("menuitem", { name: "Evento" })).not.toBeInTheDocument();
    expect(screen.queryByText("Novo evento")).not.toBeInTheDocument();
    expect(screen.queryByText("Nova tarefa")).not.toBeInTheDocument();
  });
});

describe("AgendaGrid — fechar o menu sem escolher descarta a faixa (feature 104)", () => {
  it("Escape no menu não abre formulário nenhum, e um novo arrasto começa do zero", async () => {
    const user = userEvent.setup();
    const col = await renderVisaoDia(user);

    arrastar(col, 9 * 60, 10 * 60 + 30);
    await screen.findByRole("menuitem", { name: "Evento" });

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("menuitem", { name: "Evento" })).not.toBeInTheDocument()
    );
    expect(screen.queryByText("Novo evento")).not.toBeInTheDocument();
    expect(screen.queryByText("Nova tarefa")).not.toBeInTheDocument();

    // A faixa descartada não volta: o próximo arrasto é o que manda no formulário.
    arrastar(col, 14 * 60, 15 * 60);
    await user.click(await screen.findByRole("menuitem", { name: "Evento" }));
    await screen.findByText("Novo evento");
    expect(screen.getByLabelText(/^Início/)).toHaveValue("14:00");
    expect(screen.getByLabelText(/^Fim/)).toHaveValue("15:00");
  });
});
