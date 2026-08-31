import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AgendaGrid } from "@/pages/admin/tasks/AgendaGrid";
import {
  countTaskSeries,
  createTask,
  deleteTask,
  deleteTaskSeries,
  fetchProjectEvents,
  fetchProjects,
  fetchTags,
  fetchTasks,
  updateTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import {
  endMedicationAndDeleteFutureDoses,
  fetchMedications,
} from "@/api/health/medications";
import type { Medication } from "@/types/health";
import type { Task } from "@/types/tasks";

/**
 * Feature 071 na agenda: a dose de medicação é uma **tarefa pontual** (bolinha marcável no horário,
 * com o ícone de comprimido) e o futuro do tratamento aparece no calendário sem virar linha no
 * banco.
 *
 * O que este arquivo prova, sem navegador:
 * - a dose de hoje — a que `materializeMedicationDoses` já criou — é bolinha clicável e marcá-la
 *   grava `status: "done"`;
 * - a dose de depois de amanhã aparece mesmo assim, tracejada e desabilitada (a materialização só
 *   vai até hoje, então ela é sintetizada por `computeVirtualDoses`);
 * - sintetizar não escreve nada: nenhuma `createTask`/`updateTask` sai por causa da dose virtual;
 * - se o carregamento dos tratamentos falhar, a agenda continua de pé com as tarefas.
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
  deleteTaskSeries: vi.fn(),
  countTaskSeries: vi.fn(),
  updateTask: vi.fn(),
  deleteProjectEvent: vi.fn(),
}));

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn(),
}));

vi.mock("@/api/health/medications", () => ({
  fetchMedications: vi.fn(),
  endMedicationAndDeleteFutureDoses: vi.fn(),
  EndMedicationError: class EndMedicationError extends Error {},
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
const mockedFetchMedications = vi.mocked(fetchMedications);
const mockedUpdateTask = vi.mocked(updateTask);
const mockedCreateTask = vi.mocked(createTask);
const mockedDeleteTask = vi.mocked(deleteTask);
const mockedDeleteTaskSeries = vi.mocked(deleteTaskSeries);
const mockedCountTaskSeries = vi.mocked(countTaskSeries);
const mockedEndMedication = vi.mocked(endMedicationAndDeleteFutureDoses);

/** Domingo, 16/08/2026 — a grade do mês vai de 26/07 a 05/09, então 18/08 cabe nela. */
const TODAY = "2026-08-16";

function makeMedication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: "med-1",
    name: "Losartana",
    dose_amount: 2,
    dose_unit: "comprimidos",
    times: ["08:00"],
    interval_days: 1,
    started_on: "2026-08-10",
    ended_on: null,
    active: true,
    ...overrides,
  };
}

/** Uma dose **já materializada** pela 064 + 071: `is_quick` e `icon_key` gravados na linha. */
function makeDose(overrides: Partial<Task> = {}): Task {
  return {
    id: "dose-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Losartana 2 comprimidos",
    status: "todo",
    tag_ids: [],
    due_date: TODAY,
    due_time: "08:00",
    dose_time: "08:00",
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    icon_key: "pill",
    is_quick: true,
    is_medication: true,
    medication_id: "med-1",
    ...overrides,
  };
}

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

async function renderLoaded(tasks: Task[], medications: Medication[]) {
  mockedFetchTasks.mockResolvedValue(tasks);
  mockedFetchMedications.mockResolvedValue(medications);
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

/** As bolinhas de um dia do mês — só o que está dentro da fileira de pontuais
 * (`QuickTaskDotRow`, `role="group"`). Desde a feature 075 a célula também tem o botão do número
 * do dia, que abre o modal do dia; ele não é bolinha e não pode entrar nas contagens da 074. */
function dotsOfDay(dayNumber: string): HTMLElement[] {
  const row = within(dayCellOf(dayNumber)).queryByRole("group");
  return row ? within(row).queryAllByRole("button") : [];
}

/** O desenho da bolinha (o `<span>` dentro do botão) — é ele que fica verde ou tracejado. */
function dotOf(button: HTMLElement): HTMLElement {
  return button.querySelector("span") as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 16, 9, 0, 0));
  toastMock.mockReset();
  mockedFetchTasks.mockReset();
  mockedUpdateTask.mockReset().mockResolvedValue(undefined);
  mockedCreateTask.mockReset();
  mockedDeleteTask.mockReset();
  mockedFetchProjects.mockReset().mockResolvedValue([]);
  mockedFetchProjectEvents.mockReset().mockResolvedValue([]);
  mockedFetchTags.mockReset().mockResolvedValue([]);
  mockedFetchRecurringTransactions.mockReset().mockResolvedValue([]);
  mockedFetchMedications.mockReset().mockResolvedValue([]);
  mockedCountTaskSeries.mockReset().mockResolvedValue(3);
  mockedDeleteTaskSeries.mockReset().mockResolvedValue(3);
  mockedEndMedication.mockReset().mockResolvedValue(2);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AgendaGrid — a dose é bolinha (feature 071)", () => {
  it("a dose de hoje é bolinha marcável na célula do dia, com o ícone de comprimido", async () => {
    const user = userEvent.setup();
    await renderLoaded([makeDose()], [makeMedication()]);

    const cell = dayCellOf("16");
    const dot = within(cell).getByRole("button", {
      name: /^Concluir «Losartana 2 comprimidos» às 08:00/,
    });
    // Bolinha, não chip: o título não é escrito na célula.
    expect(within(cell).queryByText("Losartana 2 comprimidos")).toBeNull();
    // O ícone de comprimido veio do `icon_key` gravado na dose (preset `pill`).
    expect(dotOf(dot).querySelector("svg.lucide-pill")).not.toBeNull();

    await user.click(dot);

    expect(mockedUpdateTask).toHaveBeenCalledWith({ id: "dose-1", status: "done" });
    const done = await screen.findByRole("button", {
      name: /^Reabrir «Losartana 2 comprimidos» às 08:00/,
    });
    expect(dotOf(done).className).toContain("bg-green-500");
    // Um clique só: nenhum diálogo de formulário no caminho.
    expect(screen.queryByText("Editar tarefa")).toBeNull();
  });

  it("marcar a dose confirma a hora no toast, e reabrir avisa que não foi tomada", async () => {
    const user = userEvent.setup();
    await renderLoaded([makeDose()], [makeMedication()]);

    // 16/08/2026 09:00 pelo relógio fake: uma dose das 08:00 marcada agora está atrasada.
    await user.click(
      screen.getByRole("button", { name: /^Concluir «Losartana 2 comprimidos» às 08:00/ })
    );

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        title: "Tomado às 09:00",
        description: "Losartana 2 comprimidos",
      })
    );

    // O estado local já reflete o horário real: a bolinha anuncia previsto × tomado e o atraso.
    const done = await screen.findByRole("button", {
      name: "Reabrir «Losartana 2 comprimidos» às 08:00 — Previsto 08:00 · Tomado 09:00 (atrasada)",
    });
    expect(dotOf(done).className).toContain("ring-amber-500");

    toastMock.mockClear();
    await user.click(done);
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        title: "Marcada como não tomada",
        description: "Losartana 2 comprimidos",
      })
    );
  });

  it("marcar uma pontual comum não dispara o toast de dose", async () => {
    const user = userEvent.setup();
    await renderLoaded(
      [makeTask({ id: "q1", title: "Trocar escova", due_time: "07:00", is_quick: true })],
      []
    );

    await user.click(screen.getByRole("button", { name: "Concluir «Trocar escova» às 07:00" }));

    await waitFor(() => expect(mockedUpdateTask).toHaveBeenCalled());
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("duas doses no mesmo dia viram duas bolinhas, uma por horário", async () => {
    await renderLoaded(
      [
        makeDose({ id: "dose-manha", due_time: "08:00", dose_time: "08:00" }),
        makeDose({ id: "dose-noite", due_time: "20:00", dose_time: "20:00" }),
      ],
      [makeMedication({ times: ["08:00", "20:00"] })]
    );

    const fileira = within(dayCellOf("16")).getByRole("group", {
      name: /Tarefas pontuais de 16 de agosto/,
    });
    expect(within(fileira).getAllByRole("button")).toHaveLength(2);
    expect(
      within(fileira).getByRole("button", { name: /«Losartana 2 comprimidos» às 08:00/ })
    ).toBeInTheDocument();
    expect(
      within(fileira).getByRole("button", { name: /«Losartana 2 comprimidos» às 20:00/ })
    ).toBeInTheDocument();
  });

  it("a dose de depois de amanhã aparece tracejada e não clicável, sem existir no banco", async () => {
    // Só a dose de hoje está materializada — é até onde `materializeMedicationDoses` vai.
    await renderLoaded([makeDose()], [makeMedication()]);

    const futura = within(dayCellOf("18")).getByRole("button", {
      name: /Losartana 2 comprimidos às 08:00 — próxima ocorrência, ainda não criada/,
    });
    expect(futura).toBeDisabled();
    expect(dotOf(futura).className).toContain("border-dashed");

    // E não é só o dia seguinte ao seguinte: a dose de daqui a três dias (19/08) também está lá.
    const emTresDias = within(dayCellOf("19")).getByRole("button", {
      name: /Losartana 2 comprimidos às 08:00 — próxima ocorrência, ainda não criada/,
    });
    expect(emTresDias).toBeDisabled();
    expect(dotOf(emTresDias).className).toContain("border-dashed");

    // Clicar não faz nada: nenhuma escrita, nenhum diálogo.
    fireEvent.click(futura);
    expect(mockedUpdateTask).not.toHaveBeenCalled();
    expect(screen.queryByText("Editar tarefa")).toBeNull();
  });

  it("sintetizar a dose futura não insere linha nenhuma no banco", async () => {
    await renderLoaded([makeDose()], [makeMedication({ times: ["08:00", "20:00"] })]);

    // A janela do mês vai até 05/09: são muitas doses virtuais desenhadas...
    expect(
      screen.getAllByRole("button", { name: /próxima ocorrência, ainda não criada/ }).length
    ).toBeGreaterThan(5);
    // ...e nenhuma delas virou escrita.
    expect(mockedCreateTask).not.toHaveBeenCalled();
    expect(mockedUpdateTask).not.toHaveBeenCalled();
    expect(mockedDeleteTask).not.toHaveBeenCalled();
  });

  it("a dose de hoje não é duplicada por uma virtual do mesmo horário", async () => {
    await renderLoaded([makeDose()], [makeMedication()]);

    const fileira = within(dayCellOf("16")).getByRole("group", {
      name: /Tarefas pontuais de 16 de agosto/,
    });
    const botoes = within(fileira).getAllByRole("button");
    expect(botoes).toHaveLength(1);
    expect(botoes[0]).toBeEnabled();
  });

  it("tratamento encerrado não sintetiza dose futura", async () => {
    await renderLoaded([makeDose()], [makeMedication({ active: false })]);

    expect(screen.queryByRole("button", { name: /próxima ocorrência, ainda não criada/ })).toBeNull();
    expect(dotsOfDay("18")).toHaveLength(0);
  });

  it("`ended_on` corta a síntese no fim do tratamento", async () => {
    await renderLoaded([makeDose()], [makeMedication({ ended_on: "2026-08-18" })]);

    expect(
      within(dayCellOf("18")).getByRole("button", { name: /próxima ocorrência/ })
    ).toBeInTheDocument();
    expect(dotsOfDay("19")).toHaveLength(0);
  });

  it("falha ao carregar os tratamentos não derruba a agenda", async () => {
    mockedFetchTasks.mockResolvedValue([makeTask({ id: "t1", title: "Comprar cimento" })]);
    mockedFetchMedications.mockRejectedValue(new Error("offline"));

    render(
      <MemoryRouter>
        <AgendaGrid />
      </MemoryRouter>
    );

    // A tarefa comum continua na tela...
    expect(await screen.findByText("Comprar cimento")).toBeInTheDocument();
    // ...sem dose virtual e sem o toast de erro da agenda (o tratamento é enfeite, não a agenda).
    expect(screen.queryByRole("button", { name: /próxima ocorrência/ })).toBeNull();
    await waitFor(() => expect(mockedFetchMedications).toHaveBeenCalled());
    expect(toastMock).not.toHaveBeenCalled();
  });
});

/**
 * Feature 074 — o bug que o usuário fotografou: a medicação "SEMTRI" aparecia com **duas** bolinhas
 * de comprimido em quase todo dia do mês.
 *
 * O cenário aqui é o do banco dele: uma medicação migrada da 049 pelo backfill da 064, que preserva
 * `recurrence_rule` na tarefa-origem e lhe dá `medication_id`/`dose_time`, e que a 071 marcou como
 * pontual com ícone de comprimido. Essa linha é, ao mesmo tempo, série recorrente e dose — e a
 * agenda a lia pelos dois caminhos.
 */
describe("AgendaGrid — medicação backfillada não duplica a bolinha (feature 074)", () => {
  /** A tarefa-origem depois de `20260816233000_medication_backfill.sql` + `20260819110000`. */
  function makeBackfilledOrigin(overrides: Partial<Task> = {}): Task {
    return makeDose({
      id: "origem-semtri",
      title: "SEMTRI",
      due_date: "2026-08-10",
      // O backfill **preserva** a regra: é o registro do que a série era.
      recurrence_rule: { frequency: "daily", interval: 1, time: "08:00" },
      recurrence_origin_id: null,
      ...overrides,
    });
  }

  /** As doses reais de 11/08 até hoje, como `materializeMedicationDoses` as grava. */
  function makeRealDoses(): Task[] {
    return ["11", "12", "13", "14", "15", "16"].map((day) =>
      makeDose({ id: `dose-${day}`, title: "SEMTRI", due_date: `2026-08-${day}` })
    );
  }

  it("cada dia do mês tem uma bolinha só — a origem, a dose real e a dose futura", async () => {
    await renderLoaded(
      [makeBackfilledOrigin(), ...makeRealDoses()],
      [makeMedication({ id: "med-1", name: "SEMTRI", started_on: "2026-08-10" })]
    );

    // O dia da origem (10/08) sempre teve uma só — é o "dia 17" da imagem do usuário.
    expect(dotsOfDay("10")).toHaveLength(1);
    // Passado com dose real materializada: era aqui que a ocorrência virtual entrava por cima.
    expect(dotsOfDay("12")).toHaveLength(1);
    expect(dotsOfDay("15")).toHaveLength(1);
    // Hoje.
    expect(dotsOfDay("16")).toHaveLength(1);
    // Futuro: só a dose virtual da 071, não mais ela + a ocorrência virtual da série.
    expect(dotsOfDay("18")).toHaveLength(1);
    expect(dotsOfDay("25")).toHaveLength(1);
  });

  it("a bolinha do passado é a dose real (clicável), não a ocorrência virtual", async () => {
    await renderLoaded(
      [makeBackfilledOrigin(), ...makeRealDoses()],
      [makeMedication({ id: "med-1", name: "SEMTRI", started_on: "2026-08-10" })]
    );

    const [dot] = dotsOfDay("12");
    expect(dot).toBeEnabled();
    expect(dot).toHaveAccessibleName(/^Concluir «SEMTRI» às 08:00/);
    expect(dotOf(dot).className).not.toContain("border-dashed");
  });

  it("a bolinha do futuro continua sendo a dose sintetizada pela 071", async () => {
    await renderLoaded(
      [makeBackfilledOrigin(), ...makeRealDoses()],
      [makeMedication({ id: "med-1", name: "SEMTRI", started_on: "2026-08-10" })]
    );

    const [dot] = dotsOfDay("18");
    expect(dot).toBeDisabled();
    // O título vem de `formatDoseTitle(medication)` ("SEMTRI 2 comprimidos"), não do `title` da
    // tarefa-origem ("SEMTRI") — é a prova de que a bolinha que sobrou é a dose virtual da 071 e
    // não a ocorrência virtual da série.
    expect(dot).toHaveAccessibleName(
      /^SEMTRI 2 comprimidos às 08:00 — próxima ocorrência, ainda não criada/
    );
  });

  /**
   * O pedido literal do prompt ("they are duplicated"), montado como o banco do usuário: origem
   * backfillada (regra **e** `medication_id`), doses reais até hoje, mês inteiro aberto. Cadência
   * semanal de propósito — é o caso em que a regra de recorrência e o `interval_days` do tratamento
   * caem exatamente nos mesmos dias, então uma duplicação apareceria como duas bolinhas no mesmo
   * dia em vez de bolinhas em dias diferentes.
   */
  it("tratamento semanal: um dia de dose = uma bolinha; dia sem dose = nenhuma", async () => {
    await renderLoaded(
      [
        makeBackfilledOrigin({
          due_date: "2026-08-02",
          recurrence_rule: { frequency: "weekly", interval: 1, time: "08:00" },
        }),
        makeDose({ id: "dose-09", title: "SEMTRI", due_date: "2026-08-09" }),
        makeDose({ id: "dose-16", title: "SEMTRI", due_date: "2026-08-16" }),
      ],
      [
        makeMedication({
          id: "med-1",
          name: "SEMTRI",
          started_on: "2026-08-02",
          interval_days: 7,
        }),
      ]
    );

    // Passado (dose real), hoje (dose real) e futuro (dose sintetizada): uma bolinha em cada.
    expect(dotsOfDay("9")).toHaveLength(1);
    expect(dotsOfDay("16")).toHaveLength(1);
    expect(dotsOfDay("23")).toHaveLength(1);
    // E os dias entre as doses continuam vazios — a correção não empurrou a duplicata para o lado.
    expect(dotsOfDay("12")).toHaveLength(0);
    expect(dotsOfDay("19")).toHaveLength(0);
    expect(dotsOfDay("24")).toHaveLength(0);
  });

  it("uma recorrência comum no mesmo mês continua com a prévia da próxima ocorrência", async () => {
    // Guarda contra corrigir demais: o filtro é `medication_id`, não "tem `is_quick`".
    await renderLoaded(
      [
        makeBackfilledOrigin(),
        ...makeRealDoses(),
        makeTask({
          id: "lencois",
          title: "Trocar lençóis",
          due_date: "2026-08-11",
          due_time: "09:00",
          is_quick: true,
          recurrence_rule: { frequency: "weekly", interval: 1, time: "09:00" },
        }),
      ],
      [makeMedication({ id: "med-1", name: "SEMTRI", started_on: "2026-08-10" })]
    );

    // 18/08 é a semana seguinte de "trocar lençóis": a dose (1) + a prévia da troca (1).
    expect(dotsOfDay("18")).toHaveLength(2);
    expect(
      within(dayCellOf("18")).getByRole("button", {
        name: /^Trocar lençóis às 09:00 — próxima ocorrência, ainda não criada/,
      })
    ).toBeDisabled();
  });
});

describe("AgendaGrid — a dose futura nas visões de semana e dia (feature 071)", () => {
  it("na semana, a dose de depois de amanhã é bolinha tracejada no horário", async () => {
    const user = userEvent.setup();
    await renderLoaded([makeDose()], [makeMedication()]);

    await user.click(screen.getByRole("tab", { name: "Semana" }));
    expect(await screen.findByText("00:00")).toBeInTheDocument();

    const fileiras = screen.getAllByRole("group", { name: "Tarefas pontuais às 08:00" });
    const botoes = fileiras.flatMap((fileira) => within(fileira).getAllByRole("button"));
    // A semana de 16 a 22/08: a de hoje marcável e as de 17 a 22 sintetizadas.
    expect(botoes.filter((b) => !b.hasAttribute("disabled"))).toHaveLength(1);
    expect(botoes.filter((b) => b.hasAttribute("disabled"))).toHaveLength(6);
  });
});

/**
 * Feature 075 — a Agenda ganha exclusão, e o caminho começa onde o usuário estava: a célula do mês.
 *
 * O botão do número do dia abre o modal do dia, onde a dose é um chip normal; o chip abre o dialog
 * de editar tarefa, que agora tem a lixeira. Antes disto, uma dose sozinha na célula era
 * **inalcançável** no mês — a bolinha só conclui/reabre, e o `+N` da fileira só aparece com excesso.
 *
 * Quem prova que "encerrar o tratamento" de fato desativa a `medication` (e que sem isso a dose
 * volta na carga seguinte) é `src/api/__tests__/health.medications.test.ts`; aqui a API é falsa e o
 * que está sob teste é o caminho da tela até ela.
 */
describe("AgendaGrid — excluir uma dose pela agenda (feature 075)", () => {
  /** Abre o modal do dia pelo número da célula e clica no chip da dose. */
  async function abrirEditorDaDose(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Ver tudo do dia 16 de agosto" }));
    await user.click(await screen.findByText("Losartana 2 comprimidos"));
    await screen.findByText("Editar tarefa");
    await user.click(screen.getByRole("button", { name: "Excluir tarefa" }));
    return within(await screen.findByRole("alertdialog"));
  }

  it("a dose abre o editor pelo modal do dia e o editor oferece excluir", async () => {
    const user = userEvent.setup();
    await renderLoaded([makeDose()], [makeMedication()]);

    const dialog = await abrirEditorDaDose(user);

    expect(dialog.getByText("Excluir dose de medicação")).toBeInTheDocument();
    expect(
      await dialog.findByRole("button", { name: /^Encerrar o tratamento e apagar as doses futuras/ })
    ).toBeInTheDocument();
    expect(dialog.getByLabelText("Incluir as doses já tomadas")).not.toBeChecked();
  });

  it("'encerrar o tratamento' encerra e a bolinha some sem reload manual", async () => {
    const user = userEvent.setup();
    const dose = makeDose();
    await renderLoaded([dose], [makeMedication()]);

    const dialog = await abrirEditorDaDose(user);
    // Só depois de o dialog ter lido a contagem e o tratamento: a carga seguinte (o `load()` de
    // depois da exclusão) já não traz nem a dose nem o tratamento encerrado.
    await dialog.findByRole("button", { name: /^Encerrar o tratamento e apagar as doses futuras/ });
    mockedFetchTasks.mockResolvedValue([]);
    mockedFetchMedications.mockResolvedValue([]);

    await user.click(
      await dialog.findByRole("button", { name: /^Encerrar o tratamento e apagar as doses futuras/ })
    );

    await waitFor(() => expect(mockedEndMedication).toHaveBeenCalledWith(dose));
    // Nenhum `deleteTask` solto: quem apaga é a operação de duas partes.
    expect(mockedDeleteTask).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Losartana 2 comprimidos/ })
      ).toBeNull()
    );
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "2 tarefas excluídas" })
    );
  });

  it("'apagar todas as doses' passa pelo escopo do servidor, com as tomadas de fora", async () => {
    const user = userEvent.setup();
    const dose = makeDose();
    await renderLoaded([dose], [makeMedication()]);

    const dialog = await abrirEditorDaDose(user);
    await user.click(
      await dialog.findByRole("button", { name: /^Apagar todas as doses deste tratamento/ })
    );

    await waitFor(() =>
      expect(mockedDeleteTaskSeries).toHaveBeenCalledWith(dose, {
        mode: "all-doses",
        includeCompleted: false,
      })
    );
  });

  it("dose virtual (ainda não criada) não tem editor, logo não tem exclusão", async () => {
    const user = userEvent.setup();
    await renderLoaded([makeDose()], [makeMedication()]);

    // 18/08 só tem a dose sintetizada por `computeVirtualDoses` — nada no banco para apagar.
    expect(dotsOfDay("18")[0]).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Ver tudo do dia 18 de agosto" }));

    // No modal do dia ela é um chip **não clicável** (`TaskChip` devolve um `div` para virtuais).
    const modal = within(await screen.findByRole("dialog"));
    const chip = (await modal.findAllByTitle(/Próxima ocorrência — ainda não criada/))[0];
    expect(chip.tagName).toBe("DIV");
    expect(screen.queryByText("Editar tarefa")).toBeNull();
  });
});
