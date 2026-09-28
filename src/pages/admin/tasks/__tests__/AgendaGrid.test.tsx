import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AgendaGrid } from "@/pages/admin/tasks/AgendaGrid";
import {
  createTag,
  createTask,
  deleteTask,
  fetchProjectEvents,
  fetchProjects,
  fetchTags,
  fetchTasks,
  fetchExternalLinksForTask,
  saveExternalLinksForTask,
  updateTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import { TASK_PROJECT_FILTER_STORAGE_KEY } from "@/lib/taskProjectFilterPreference";
import type { Project, ProjectEvent, Tag, Task } from "@/types/tasks";

/**
 * Cobre a feature 034 no nível de wiring: prova que só as visões Semana/Dia passaram a usar
 * `AgendaHourGrid` (grade de horas 00–23) e que a visão Mês continua com a grade de chips antiga
 * (`grid-cols-7`), sem regressão — item "Confirmar que month continua exatamente como está" da
 * lista de tarefas, e o pedido original "mesma ideia [de grade de horas] pra semana inteira" só
 * se aplica a semana/dia, não a mês.
 *
 * O detalhe de posicionamento/overlap/faixa "Sem horário" dentro da grade de horas já está
 * coberto em `AgendaHourGrid.test.tsx` — aqui o interesse é só a troca de visão dentro de
 * `AgendaGrid`, então a discriminação usada é a presença do rótulo "00:00" (só existe na grade de
 * horas), sem repetir asserções de conteúdo.
 *
 * Também cobre a feature 043: a Agenda deixou de ter seu próprio `CalendarTaskDialog` reduzido
 * (só título/descrição/prazo+horário/prioridade) e passou a usar `TaskFormFields`, o mesmo form
 * completo (4 abas) que `TaskList.tsx`/`ProjectDetail.tsx` já usam desde a feature 042.
 */

vi.mock("@/api/tasks", () => ({
  // Feature 106: o formulário em edição procura quem cita a tarefa ("Referenciada em").
  fetchTasksMentioningTask: vi.fn(async () => []),
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
  createProjectEvent: vi.fn(),
  updateProjectEvent: vi.fn(),
  deleteProjectEvent: vi.fn(),
}));

// Feature 106: a outra metade de "Referenciada em" vem das notas. Só o que é novo é dublado — o
// resto do módulo continua real, como estes testes já esperavam.
vi.mock("@/api/notes/notes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/notes/notes")>()),
  fetchNotesMentioningTask: vi.fn(async () => []),
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

const mockedFetchTasks = vi.mocked(fetchTasks);
const mockedFetchProjects = vi.mocked(fetchProjects);
const mockedFetchProjectEvents = vi.mocked(fetchProjectEvents);
const mockedFetchTags = vi.mocked(fetchTags);
const mockedCreateTag = vi.mocked(createTag);
const mockedCreateTask = vi.mocked(createTask);
const mockedDeleteTask = vi.mocked(deleteTask);
const mockedUpdateTask = vi.mocked(updateTask);
const mockedFetchRecurringTransactions = vi.mocked(fetchRecurringTransactions);

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Tarefa do mês",
    status: "todo",
    tag_ids: [],
    due_date: new Date().toISOString().slice(0, 10),
    due_time: null,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "Projeto X",
    status: "active",
    tag_ids: [],
    ...overrides,
  };
}

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: "tag-1",
    name: "Urgente",
    color: "#ef4444",
    ...overrides,
  };
}

async function renderLoaded() {
  const utils = render(
    <MemoryRouter>
      <AgendaGrid />
    </MemoryRouter>
  );
  // A grade de chips do mês só existe depois que `loading` vira false — os rótulos de dia da
  // semana ("Dom".."Sáb") só aparecem na visão mês.
  await screen.findByText("Dom");
  return utils;
}

beforeEach(() => {
  localStorage.clear();
  mockedFetchTasks.mockReset();
  mockedFetchProjects.mockReset();
  mockedFetchProjectEvents.mockReset();
  mockedFetchTags.mockReset().mockResolvedValue([]);
  mockedCreateTag.mockReset();
  mockedCreateTask.mockReset();
  mockedDeleteTask.mockReset().mockResolvedValue(undefined);
  mockedUpdateTask.mockReset().mockResolvedValue(undefined);
  mockedFetchRecurringTransactions.mockReset().mockResolvedValue([]);
});

describe("AgendaGrid — visão Mês inalterada, Semana/Dia usam a grade de horas", () => {
  it("visão Mês (padrão) não mostra a grade de horas (sem rótulo '00:00')", async () => {
    mockedFetchTasks.mockResolvedValue([makeTask()]);
    mockedFetchProjects.mockResolvedValue([]);
    mockedFetchProjectEvents.mockResolvedValue([]);

    await renderLoaded();

    expect(screen.queryByText("00:00")).not.toBeInTheDocument();
    // Cabeçalho de chips de mês, 7 colunas fixas (WEEKDAY_LABELS).
    for (const label of ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("trocar para a aba Semana troca pra AgendaHourGrid (rótulo '00:00' aparece)", async () => {
    mockedFetchTasks.mockResolvedValue([makeTask()]);
    mockedFetchProjects.mockResolvedValue([]);
    mockedFetchProjectEvents.mockResolvedValue([]);
    const user = userEvent.setup();

    await renderLoaded();
    await user.click(screen.getByRole("tab", { name: "Semana" }));

    expect(await screen.findByText("00:00")).toBeInTheDocument();
    expect(await screen.findByText("23:00")).toBeInTheDocument();
  });

  it("trocar para a aba Dia também troca pra AgendaHourGrid (rótulo '00:00' aparece)", async () => {
    mockedFetchTasks.mockResolvedValue([makeTask()]);
    mockedFetchProjects.mockResolvedValue([]);
    mockedFetchProjectEvents.mockResolvedValue([]);
    const user = userEvent.setup();

    await renderLoaded();
    await user.click(screen.getByRole("tab", { name: "Dia" }));

    expect(await screen.findByText("00:00")).toBeInTheDocument();
  });
});

describe("AgendaGrid — dialog de editar tarefa usa o form unificado TaskFormFields (feature 043)", () => {
  it("abrir uma tarefa pela Agenda mostra o painel completo do form unificado, não o dialog reduzido antigo", async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: "Tarefa da agenda" });
    mockedFetchTasks.mockResolvedValue([task]);
    mockedFetchProjects.mockResolvedValue([]);
    mockedFetchProjectEvents.mockResolvedValue([]);

    await renderLoaded();
    await user.click(screen.getByText("Tarefa da agenda"));

    expect(screen.getByText("Editar tarefa")).toBeInTheDocument();
    // Feature 080: painel único, sem abas — tudo no mesmo lugar.
    const dialog = within(screen.getByRole("dialog"));
    expect(screen.queryByRole("tab", { name: "Geral" })).not.toBeInTheDocument();
    expect(dialog.getByLabelText(/^Título/)).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: /Descrição/ })).toBeInTheDocument();
    expect(dialog.getByText("Data limite")).toBeInTheDocument();
    expect(dialog.getByText("Tags")).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: /Registros de tempo/ })).toBeInTheDocument();
    // Campos que o dialog reduzido antigo (CalendarTaskDialog) nunca ofereceu.
    expect(dialog.getByText("Marco")).toBeInTheDocument();
    expect(dialog.getByText("Ícone")).toBeInTheDocument();
    // O aviso fixo "Recorrência, tags, subtarefas e projeto: edite em Tarefas" não existe mais.
    expect(screen.queryByText(/edite em/i)).not.toBeInTheDocument();
  });

  it("campo Projeto aparece ao editar tarefa pela Agenda", async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: "Projeto Alpha" });
    const task = makeTask({ title: "Tarefa da agenda", project_id: project.id });
    mockedFetchTasks.mockResolvedValue([task]);
    mockedFetchProjects.mockResolvedValue([project]);
    mockedFetchProjectEvents.mockResolvedValue([]);

    await renderLoaded();
    await user.click(screen.getByText("Tarefa da agenda"));

    // Feature 080: badge clicável de uma linha; a lista de projetos abre no popover.
    const dialog = within(screen.getByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Projeto Alpha" }));
    expect(await screen.findByRole("listbox", { name: "Projeto" })).toBeInTheDocument();
  });

  it("salvar persiste Marco e Tags via updateTask, algo o dialog antigo não fazia", async () => {
    const user = userEvent.setup();
    const tag = makeTag();
    const task = makeTask({ id: "task-1", title: "Tarefa da agenda" });
    mockedFetchTasks.mockResolvedValue([task]);
    mockedFetchProjects.mockResolvedValue([]);
    mockedFetchProjectEvents.mockResolvedValue([]);
    mockedFetchTags.mockResolvedValue([tag]);

    await renderLoaded();
    await user.click(screen.getByText("Tarefa da agenda"));

    await user.click(screen.getByRole("checkbox", { name: /Marco no Gantt/ }));

    // Tags — abre o combobox e seleciona a tag existente (mesmo painel, sem trocar de aba).
    await user.click(screen.getByPlaceholderText("Buscar ou criar tag…"));
    await user.click(await screen.findByText(tag.name));

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(mockedUpdateTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-1", is_milestone: true, tag_ids: [tag.id] })
    );
  });

  it("adicionar subtarefa a partir da Agenda chama createTask com parent_task_id/project_id, mesmo helper de Lista/Detalhe (taskDraft.ts)", async () => {
    const user = userEvent.setup();
    const project = makeProject();
    const parent = makeTask({ id: "parent-1", title: "Tarefa principal", project_id: project.id });
    mockedFetchTasks.mockResolvedValue([parent]);
    mockedFetchProjects.mockResolvedValue([project]);
    mockedFetchProjectEvents.mockResolvedValue([]);
    mockedCreateTask.mockResolvedValue({ ...parent, id: "sub-1", parent_task_id: "parent-1" });

    await renderLoaded();
    await user.click(screen.getByText("Tarefa principal"));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Subtarefas/ }));
    await user.type(screen.getByPlaceholderText("Adicionar subtarefa"), "Nova subtarefa");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        parent_task_id: "parent-1",
        project_id: project.id,
        title: "Nova subtarefa",
      })
    );
  });

  it("remover uma subtarefa existente a partir da Agenda chama deleteTask com o id certo, mesmo helper de Lista/Detalhe (taskDraft.ts)", async () => {
    const user = userEvent.setup();
    const parent = makeTask({ id: "parent-1", title: "Tarefa principal" });
    const subtask = makeTask({ id: "sub-1", parent_task_id: "parent-1", title: "Subtarefa filha" });
    mockedFetchTasks.mockResolvedValue([parent, subtask]);
    mockedFetchProjects.mockResolvedValue([]);
    mockedFetchProjectEvents.mockResolvedValue([]);

    await renderLoaded();
    await user.click(screen.getByText("Tarefa principal"));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Subtarefas/ }));

    // A subtarefa agora também vira um chip próprio no grid de fundo (feature 048), então a busca
    // pelo item da lista de subtarefas do form precisa ser escopada ao dialog.
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Subtarefa filha")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Remover subtarefa" }));

    expect(mockedDeleteTask).toHaveBeenCalledWith("sub-1");
  });
});

describe("AgendaGrid — subtarefas com prazo próprio aparecem na Agenda (feature 048)", () => {
  it("subtarefa com due_date próprio aparece agrupada no dia certo (visão Mês), com indicador de vínculo com o pai", async () => {
    const parent = makeTask({ id: "parent-1", title: "Tarefa principal" });
    const subtask = makeTask({ id: "sub-1", parent_task_id: "parent-1", title: "Subtarefa filha" });
    mockedFetchTasks.mockResolvedValue([parent, subtask]);
    mockedFetchProjects.mockResolvedValue([]);
    mockedFetchProjectEvents.mockResolvedValue([]);

    await renderLoaded();

    // A subtarefa vira chip próprio no dia (não fica mais totalmente filtrada da Agenda).
    const chip = screen.getByText("Subtarefa filha").closest("button")!;
    expect(chip).toBeInTheDocument();
    // Indicador discreto de vínculo com a tarefa-mãe: tooltip com o nome do pai.
    expect(chip.getAttribute("title")).toBe('Subtarefa de "Tarefa principal"');
    // Tarefa de topo continua sem esse indicador.
    const parentChip = screen.getByText("Tarefa principal").closest("button")!;
    expect(parentChip.getAttribute("title")).toBeNull();
  });

  it("subtarefa com due_time próprio aparece na grade de horas (visão Semana), com o mesmo indicador de vínculo", async () => {
    const user = userEvent.setup();
    const parent = makeTask({ id: "parent-1", title: "Tarefa principal" });
    const subtask = makeTask({
      id: "sub-1",
      parent_task_id: "parent-1",
      title: "Subtarefa com horário",
      due_time: "09:00",
    });
    mockedFetchTasks.mockResolvedValue([parent, subtask]);
    mockedFetchProjects.mockResolvedValue([]);
    mockedFetchProjectEvents.mockResolvedValue([]);

    await renderLoaded();
    await user.click(screen.getByRole("tab", { name: "Semana" }));

    const button = await screen.findByRole("button", { name: /Subtarefa com horário/ });
    expect(button.getAttribute("title")).toBe('Subtarefa com horário — Subtarefa de "Tarefa principal"');
  });

  it("subtarefa sem due_date continua ausente da Agenda, mesmo comportamento de antes", async () => {
    const parent = makeTask({ id: "parent-1", title: "Tarefa principal" });
    const subtask = makeTask({
      id: "sub-1",
      parent_task_id: "parent-1",
      title: "Subtarefa sem prazo",
      due_date: null,
    });
    mockedFetchTasks.mockResolvedValue([parent, subtask]);
    mockedFetchProjects.mockResolvedValue([]);
    mockedFetchProjectEvents.mockResolvedValue([]);

    await renderLoaded();

    expect(screen.queryByText("Subtarefa sem prazo")).not.toBeInTheDocument();
  });

  it("abrir uma subtarefa a partir do chip da Agenda usa o mesmo form completo (TaskFormFields) de uma tarefa de topo, com os campos de subtarefa certos", async () => {
    const user = userEvent.setup();
    const parent = makeTask({ id: "parent-1", title: "Tarefa principal" });
    const subtask = makeTask({ id: "sub-1", parent_task_id: "parent-1", title: "Subtarefa filha" });
    mockedFetchTasks.mockResolvedValue([parent, subtask]);
    mockedFetchProjects.mockResolvedValue([]);
    mockedFetchProjectEvents.mockResolvedValue([]);

    await renderLoaded();
    await user.click(screen.getByText("Subtarefa filha"));

    // Mesmo dialog/form completo usado por tarefas de topo (feature 043), não um tratamento à parte.
    expect(screen.getByText("Editar tarefa")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Subtarefa filha")).toBeInTheDocument();
    // Restrições de subtarefa já garantidas pelo form compartilhado (projeto herdado do pai, sem
    // campo de subtarefas dentro de uma subtarefa).
    expect(screen.getByText("Herdado da tarefa principal")).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", { name: /Subtarefas/ })
    ).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Adicionar subtarefa")).not.toBeInTheDocument();
  });
});

/**
 * Feature 085 — a Agenda é o **terceiro** dono do formulário completo, e edita tarefas que já
 * existem. A decisão registrada na feature foi fiar a seção de links igual às outras duas telas, em
 * vez de passá-la desabilitada: uma seção que abrisse vazia numa tarefa com links (e perdesse a
 * edição no salvar) seria pior do que não existir. O que continua fora de escopo é o **chip** nos
 * itens da agenda — nem ela nem o Gantt mostram chip de link.
 */
describe("AgendaGrid — seção de links externos fiada como nas outras telas (feature 085)", () => {
  it("abrir a tarefa carrega os links dela e mostra na seção", async () => {
    const user = userEvent.setup();
    const task = makeTask({ id: "task-1", title: "Tarefa da agenda" });
    mockedFetchTasks.mockResolvedValue([task]);
    mockedFetchProjects.mockResolvedValue([]);
    mockedFetchProjectEvents.mockResolvedValue([]);
    vi.mocked(fetchExternalLinksForTask).mockResolvedValue([
      {
        id: "l1",
        task_id: "task-1",
        url: "https://github.com/owner/repo/issues/5",
        comment: "issue de origem",
        position: 0,
      },
    ]);

    await renderLoaded();
    await user.click(screen.getByText("Tarefa da agenda"));

    expect(fetchExternalLinksForTask).toHaveBeenCalledWith("task-1");
    const dialog = within(screen.getByRole("dialog"));
    await user.click(await dialog.findByRole("button", { name: /Links externos/ }));
    expect(dialog.getByLabelText("URL do link 1 de 1")).toHaveValue(
      "https://github.com/owner/repo/issues/5"
    );
    expect(dialog.getByLabelText("Comentário do link 1 de 1")).toHaveValue("issue de origem");
  });

  it("salvar pela Agenda grava a lista de links junto com a tarefa", async () => {
    const user = userEvent.setup();
    const task = makeTask({ id: "task-1", title: "Tarefa da agenda" });
    mockedFetchTasks.mockResolvedValue([task]);
    mockedFetchProjects.mockResolvedValue([]);
    mockedFetchProjectEvents.mockResolvedValue([]);
    vi.mocked(fetchExternalLinksForTask).mockResolvedValue([]);

    await renderLoaded();
    await user.click(screen.getByText("Tarefa da agenda"));

    const dialog = within(screen.getByRole("dialog"));
    await user.click(await dialog.findByRole("button", { name: /Links externos/ }));
    await user.click(dialog.getByRole("button", { name: "Adicionar link" }));
    await user.type(dialog.getByLabelText("URL do link 1 de 1"), "https://a.com");
    await user.type(dialog.getByLabelText("Comentário do link 1 de 1"), "anotação");

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(saveExternalLinksForTask).toHaveBeenCalledWith("task-1", [
      { url: "https://a.com", comment: "anotação", position: 0 },
    ]);
  });
});

/**
 * Feature 097 — a Agenda deixou de ter um filtro de projeto próprio e concorrente. Dentro do
 * `TaskList` ela é **controlada** (o recorte vem da barra de cima, que agora aparece também nesta
 * aba, e o `<Select>` interno não é desenhado); na rota standalone `/tasks/agenda` ela continua
 * dona do próprio, só que lendo e gravando a mesma preferência do navegador.
 *
 * O último teste do bloco é a consequência que as Decisões assumiram por escrito: com um projeto
 * selecionado, a dose de medicação some da Agenda, porque ela nasce sem `project_id`. Está aqui
 * para ser uma escolha visível, e não uma regressão silenciosa descoberta pelo usuário.
 */
describe("AgendaGrid — filtro de projeto compartilhado (feature 097)", () => {
  const ALPHA = makeProject({ id: "p-alpha", name: "Alpha" });
  /** Dias 10 e 20 do mês em foco (o mês local de hoje, que é o que a grade abre): existem em
   * qualquer mês e estão sempre na grade. Tarefas e eventos ficam em dias **diferentes** porque a
   * célula do mês só desenha 3 chips e esconde o resto atrás de "+N mais". */
  const MES = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const DIA_TAREFAS = `${MES}-10`;
  const DIA_EVENTOS = `${MES}-20`;

  const DO_ALPHA = "Tarefa do Alpha";
  const SEM_PROJETO = "Tarefa sem projeto";
  const EVENTO_DO_ALPHA = "Reunião do Alpha";
  const EVENTO_SEM_PROJETO = "Convite recebido";
  const DOSE = "Losartana 2 comprimidos";

  function seed() {
    mockedFetchProjects.mockResolvedValue([ALPHA]);
    mockedFetchTasks.mockResolvedValue([
      makeTask({ id: "t-alpha", title: DO_ALPHA, project_id: ALPHA.id, due_date: DIA_TAREFAS }),
      makeTask({ id: "t-sem", title: SEM_PROJETO, due_date: DIA_TAREFAS }),
      // Dose já materializada (features 064/071): tarefa pontual, sempre sem projeto.
      makeTask({
        id: "dose-1",
        title: DOSE,
        due_date: DIA_TAREFAS,
        due_time: "08:00",
        dose_time: "08:00",
        is_quick: true,
        is_medication: true,
        medication_id: "med-1",
      }),
    ]);
    mockedFetchProjectEvents.mockResolvedValue([
      {
        id: "ev-1",
        project_id: ALPHA.id,
        task_id: null,
        title: EVENTO_DO_ALPHA,
        starts_at: `${DIA_EVENTOS}T10:00:00`,
      },
      // Evento sem projeto: a cópia recebida por convite (feature 076).
      {
        id: "ev-2",
        project_id: null,
        task_id: null,
        title: EVENTO_SEM_PROJETO,
        starts_at: `${DIA_EVENTOS}T11:00:00`,
      },
    ] satisfies ProjectEvent[]);
  }

  /** O que a grade está desenhando agora — chips de tarefa/evento pelo texto, e a dose pela
   * bolinha (tarefa pontual não escreve o título na célula). */
  function naTela(): string[] {
    const nomes = [DO_ALPHA, SEM_PROJETO, EVENTO_DO_ALPHA, EVENTO_SEM_PROJETO].filter(
      (texto) => screen.queryAllByText(texto).length > 0
    );
    if (screen.queryAllByRole("button", { name: new RegExp(DOSE) }).length > 0) nomes.push(DOSE);
    return nomes;
  }

  async function renderAgenda(props: Parameters<typeof AgendaGrid>[0] = {}) {
    const utils = render(
      <MemoryRouter>
        <AgendaGrid {...props} />
      </MemoryRouter>
    );
    await screen.findByText("Dom");
    return utils;
  }

  it("controlada, obedece à prop e não desenha um segundo seletor de projeto", async () => {
    seed();
    const onChange = vi.fn();
    await renderAgenda({ projectFilter: ALPHA.id, onProjectFilterChange: onChange });

    expect(naTela()).toEqual([DO_ALPHA, EVENTO_DO_ALPHA]);
    // Quem desenha o controle é a barra de cima do `TaskList`.
    expect(screen.queryByRole("combobox", { name: "Projeto" })).toBeNull();
    // E ela não guarda estado próprio: nada de preferência gravada por conta dela.
    expect(localStorage.getItem(TASK_PROJECT_FILTER_STORAGE_KEY)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("controlada, trocar a prop troca o recorte — o estado é de fora", async () => {
    seed();
    const { rerender } = await renderAgenda({ projectFilter: ALPHA.id });
    expect(naTela()).toEqual([DO_ALPHA, EVENTO_DO_ALPHA]);

    rerender(
      <MemoryRouter>
        <AgendaGrid projectFilter="all" />
      </MemoryRouter>
    );

    expect(naTela()).toEqual([DO_ALPHA, SEM_PROJETO, EVENTO_DO_ALPHA, EVENTO_SEM_PROJETO, DOSE]);
  });

  it("«Sem projeto» mostra tarefa e evento sem projeto, e esconde os do projeto", async () => {
    seed();
    await renderAgenda({ projectFilter: "null" });

    expect(naTela()).toEqual([SEM_PROJETO, EVENTO_SEM_PROJETO, DOSE]);
  });

  it("com um projeto selecionado, a dose de medicação some — consequência assumida nas Decisões", async () => {
    seed();
    await renderAgenda({ projectFilter: ALPHA.id });

    expect(screen.queryByRole("button", { name: new RegExp(DOSE) })).toBeNull();
    expect(naTela()).not.toContain(DOSE);
  });

  it("não controlada (rota standalone), lê a preferência salva no navegador", async () => {
    seed();
    localStorage.setItem(TASK_PROJECT_FILTER_STORAGE_KEY, ALPHA.id);

    await renderAgenda();

    expect(naTela()).toEqual([DO_ALPHA, EVENTO_DO_ALPHA]);
    expect(screen.getByRole("combobox", { name: "Projeto" })).toHaveTextContent("Alpha");
  });

  it("não controlada, escolher no `<Select>` grava a preferência e avisa quem estiver ouvindo", async () => {
    seed();
    const user = userEvent.setup();
    const onChange = vi.fn();
    await renderAgenda({ onProjectFilterChange: onChange });

    // "Sem projeto" é a opção que a Agenda não tinha antes desta feature.
    await user.click(screen.getByRole("combobox", { name: "Projeto" }));
    await user.click(await screen.findByRole("option", { name: "Sem projeto" }));

    expect(localStorage.getItem(TASK_PROJECT_FILTER_STORAGE_KEY)).toBe("null");
    expect(onChange).toHaveBeenCalledWith("null");
    expect(naTela()).toEqual([SEM_PROJETO, EVENTO_SEM_PROJETO, DOSE]);
  });

  it("não controlada, id de projeto apagado cai para «Todos os projetos» e reescreve a chave", async () => {
    seed();
    localStorage.setItem(TASK_PROJECT_FILTER_STORAGE_KEY, "p-apagado");

    await renderAgenda();

    await waitFor(() =>
      expect(localStorage.getItem(TASK_PROJECT_FILTER_STORAGE_KEY)).toBe("all")
    );
    expect(naTela()).toEqual([DO_ALPHA, SEM_PROJETO, EVENTO_DO_ALPHA, EVENTO_SEM_PROJETO, DOSE]);
  });
});
