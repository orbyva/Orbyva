import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AgendaGrid } from "@/pages/admin/tasks/AgendaGrid";
import {
  fetchProjectEvents,
  fetchProjects,
  fetchTags,
  fetchTasks,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Task } from "@/types/tasks";

/**
 * O coração da feature 061: "CONSULTAS (VIRAM EVENTOS NO CALENDÁRIO GERAL)". Aqui a prova é no
 * calendário geral (`AgendaGrid`, a Agenda de `/tasks/agenda` e a aba Agenda de Tarefas), não no
 * dashboard de Saúde — uma consulta é uma `task` com `is_consultation`, então ela cai no mesmo
 * `groupCalendarItemsByDay` de qualquer tarefa e precisa (a) aparecer no dia certo, (b) se
 * distinguir de tarefa comum e de medicação, e (c) valer também para as ocorrências de uma série
 * recorrente, incluindo a prévia virtual que ainda não foi materializada.
 *
 * Substitui a verificação manual no navegador, proibida pela skill `next`. A propagação de
 * `is_consultation` na materialização em si (o insert) é coberta por
 * `src/api/__tests__/tasks.recurring-materialization.test.ts`; aqui o interesse é a renderização.
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

const mockedFetchTasks = vi.mocked(fetchTasks);
const mockedFetchProjects = vi.mocked(fetchProjects);
const mockedFetchProjectEvents = vi.mocked(fetchProjectEvents);
const mockedFetchTags = vi.mocked(fetchTags);
const mockedFetchRecurringTransactions = vi.mocked(fetchRecurringTransactions);

/** Domingo, 16/08/2026 — a grade do mês vai de 26/07 a 05/09, o que torna determinística a data
 * da ocorrência virtual usada abaixo (05/09, um mês depois da origem em 05/08). */
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
  // A grade de chips do mês só existe depois que `loading` vira false.
  await screen.findByText("Dom");
  return utils;
}

/** O chip/bloco que contém um título, seja `button` (tarefa real) ou `div` (ocorrência virtual). */
function chipFor(title: string): HTMLElement {
  const node = screen.getByText(title).closest("button, div[title]");
  if (!node) throw new Error(`chip não encontrado para "${title}"`);
  return node as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 16, 9, 0, 0));
  mockedFetchTasks.mockReset();
  mockedFetchProjects.mockReset().mockResolvedValue([]);
  mockedFetchProjectEvents.mockReset().mockResolvedValue([]);
  mockedFetchTags.mockReset().mockResolvedValue([]);
  mockedFetchRecurringTransactions.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AgendaGrid — consulta médica no calendário geral (feature 061)", () => {
  it("a consulta aparece como item do dia agendado, com o marcador de estetoscópio", async () => {
    await renderLoaded([
      makeTask({
        id: "consulta-1",
        title: "Cardiologista — Dr. Silva",
        is_consultation: true,
      }),
    ]);

    // Está no calendário geral, no dia agendado, e clicável como qualquer tarefa.
    const chip = chipFor("Cardiologista — Dr. Silva");
    expect(chip.tagName).toBe("BUTTON");
    expect(within(chip).getByLabelText("Consulta médica")).toBeInTheDocument();
  });

  it("se distingue de tarefa comum e de medicação, que continuam com o ponto de status", async () => {
    await renderLoaded([
      makeTask({ id: "comum", title: "Revisar contrato" }),
      makeTask({ id: "remedio", title: "Losartana", is_medication: true }),
      makeTask({
        id: "consulta-1",
        title: "Cardiologista — Dr. Silva",
        is_consultation: true,
      }),
    ]);

    // Um único marcador de consulta na tela: os outros dois itens não o ganham.
    expect(screen.getAllByLabelText("Consulta médica")).toHaveLength(1);

    for (const title of ["Revisar contrato", "Losartana"]) {
      const chip = chipFor(title);
      expect(within(chip).queryByLabelText("Consulta médica")).toBeNull();
      // Ponto de status (`STATUS_DOT_CLASS`) intacto — nenhuma regressão da 049 nem do padrão.
      expect(chip.querySelector("span.rounded-full")).not.toBeNull();
    }

    // E a consulta troca o ponto pelo estetoscópio, não acumula os dois.
    const consulta = chipFor("Cardiologista — Dr. Silva");
    expect(consulta.querySelector("span.rounded-full")).toBeNull();
  });

  it("consulta com horário vira bloco na grade de horas (visão Semana), na cor de Saúde", async () => {
    const user = userEvent.setup();
    await renderLoaded([
      makeTask({ id: "comum", title: "Reunião", due_time: "10:00" }),
      makeTask({
        id: "consulta-1",
        title: "Cardiologista — Dr. Silva",
        due_time: "14:30",
        is_consultation: true,
      }),
    ]);

    await user.click(screen.getByRole("tab", { name: "Semana" }));
    expect(await screen.findByText("00:00")).toBeInTheDocument();

    const bloco = await screen.findByRole("button", { name: /Cardiologista — Dr. Silva/ });
    expect(within(bloco).getByLabelText("Consulta médica")).toBeInTheDocument();
    expect(bloco.getAttribute("style") ?? "").toContain("--health");

    // Tarefa comum na mesma grade continua com o ponto de status e a borda padrão.
    const comum = await screen.findByRole("button", { name: /Reunião/ });
    expect(within(comum).queryByLabelText("Consulta médica")).toBeNull();
    expect(comum.getAttribute("style") ?? "").not.toContain("--health");
  });

  it("série recorrente: cada ocorrência materializada entra no calendário como consulta", async () => {
    await renderLoaded([
      makeTask({
        id: "origem",
        title: "Endocrinologista — retorno",
        due_date: "2026-08-05",
        recurrence_rule: { frequency: "monthly", interval: 1, time: null },
        is_consultation: true,
      }),
      // Ocorrência já materializada (o que `materializeRecurringInstances` insere, com a flag
      // propagada — ver src/api/__tests__/tasks.recurring-materialization.test.ts).
      makeTask({
        id: "ocorrencia-1",
        title: "Endocrinologista — retorno",
        due_date: "2026-08-12",
        recurrence_origin_id: "origem",
        is_consultation: true,
      }),
    ]);

    // Origem (05/08) + ocorrência materializada (12/08) + prévia do próximo retorno (05/09).
    const containers = screen
      .getAllByText("Endocrinologista — retorno")
      .map((chip) => chip.closest("button, div[title]") as HTMLElement);
    expect(containers).toHaveLength(3);
    for (const container of containers) {
      expect(within(container).getByLabelText("Consulta médica")).toBeInTheDocument();
    }
    // As duas linhas reais são clicáveis (abrem o form); só a prévia não é.
    expect(containers.filter((node) => node.tagName === "BUTTON")).toHaveLength(2);
  });

  it("a prévia da próxima ocorrência (virtual, ainda não materializada) também é reconhecida como consulta", async () => {
    await renderLoaded([
      makeTask({
        id: "origem",
        title: "Endocrinologista — retorno",
        due_date: "2026-08-05",
        recurrence_rule: { frequency: "monthly", interval: 1, time: null },
        is_consultation: true,
      }),
    ]);

    // A origem (05/08) + a prévia virtual do próximo mês (05/09, dentro da grade 26/07–05/09).
    const chips = screen.getAllByText("Endocrinologista — retorno");
    expect(chips).toHaveLength(2);
    expect(screen.getAllByLabelText("Consulta médica")).toHaveLength(2);

    // A prévia continua sendo prévia: não é botão clicável, e mantém o tooltip de "ainda não criada".
    const virtual = chips
      .map((chip) => chip.closest("button, div[title]") as HTMLElement)
      .find((node) => node.tagName !== "BUTTON");
    expect(virtual).toBeDefined();
    expect(virtual?.getAttribute("title")).toBe(
      "Próxima ocorrência — ainda não criada, aparece automaticamente nesse dia"
    );
    expect(within(virtual as HTMLElement).getByLabelText("Consulta médica")).toBeInTheDocument();
  });

  it("série recorrente comum não ganha marcador de consulta (nenhuma regressão fora da 061)", async () => {
    await renderLoaded([
      makeTask({
        id: "origem",
        title: "Reunião mensal",
        due_date: "2026-08-05",
        recurrence_rule: { frequency: "monthly", interval: 1, time: null },
      }),
    ]);

    expect(screen.getAllByText("Reunião mensal")).toHaveLength(2);
    expect(screen.queryByLabelText("Consulta médica")).toBeNull();
  });
});
