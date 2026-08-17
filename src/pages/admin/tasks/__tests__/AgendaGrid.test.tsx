import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
  updateTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Project, Tag, Task } from "@/types/tasks";

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
  it("abrir uma tarefa pela Agenda mostra as 4 abas completas do form unificado, não o dialog reduzido antigo", async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: "Tarefa da agenda" });
    mockedFetchTasks.mockResolvedValue([task]);
    mockedFetchProjects.mockResolvedValue([]);
    mockedFetchProjectEvents.mockResolvedValue([]);

    await renderLoaded();
    await user.click(screen.getByText("Tarefa da agenda"));

    expect(screen.getByText("Editar tarefa")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Geral" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Data e repetição" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Organização" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Registros de tempo" })).toBeInTheDocument();
    // Campos que o dialog reduzido antigo (CalendarTaskDialog) nunca ofereceu.
    expect(screen.getByText("Marco")).toBeInTheDocument();
    expect(screen.getByText("Ícone")).toBeInTheDocument();
    // O aviso fixo "Recorrência, tags, subtarefas e projeto: edite em Tarefas" não existe mais.
    expect(screen.queryByText(/edite em/i)).not.toBeInTheDocument();
  });

  it("campo Projeto (ProjectPicker) aparece ao editar tarefa pela Agenda", async () => {
    const user = userEvent.setup();
    const project = makeProject({ name: "Projeto Alpha" });
    const task = makeTask({ title: "Tarefa da agenda", project_id: project.id });
    mockedFetchTasks.mockResolvedValue([task]);
    mockedFetchProjects.mockResolvedValue([project]);
    mockedFetchProjectEvents.mockResolvedValue([]);

    await renderLoaded();
    await user.click(screen.getByText("Tarefa da agenda"));

    expect(screen.getByRole("listbox", { name: "Projeto" })).toBeInTheDocument();
  });

  it("salvar persiste campos das abas novas (Marco e Tags) via updateTask, algo o dialog antigo não fazia", async () => {
    const user = userEvent.setup();
    const tag = makeTag();
    const task = makeTask({ id: "task-1", title: "Tarefa da agenda" });
    mockedFetchTasks.mockResolvedValue([task]);
    mockedFetchProjects.mockResolvedValue([]);
    mockedFetchProjectEvents.mockResolvedValue([]);
    mockedFetchTags.mockResolvedValue([tag]);

    await renderLoaded();
    await user.click(screen.getByText("Tarefa da agenda"));

    // Marco — único checkbox do form nas condições padrão (sem recorrência ativada).
    await user.click(screen.getByRole("checkbox"));

    // Tags — abre o combobox e seleciona a tag existente.
    await user.click(screen.getByRole("tab", { name: "Organização" }));
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
    await user.click(screen.getByRole("tab", { name: "Organização" }));
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
    await user.click(screen.getByRole("tab", { name: "Organização" }));

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
    await user.click(screen.getByRole("tab", { name: "Organização" }));
    expect(screen.queryByPlaceholderText("Adicionar subtarefa")).not.toBeInTheDocument();
  });
});
