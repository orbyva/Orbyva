import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TaskList from "@/pages/admin/tasks/TaskList";
import {
  createTag,
  createTask,
  fetchDependencies,
  fetchProjects,
  fetchTags,
  fetchTasks,
  saveExternalLinksForTask,
  updateTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import { formatLocalIsoDate } from "@/lib/dates";
import type { Project, Tag, Task } from "@/types/tasks";

/**
 * Feature 080 — não-regressão de salvamento depois do refactor de layout. O painel reorganizou
 * **onde** cada campo aparece; o que não pode mudar é o que chega em `createTask`/`updateTask`.
 * Este teste preenche **um campo de cada bloco** do painel (título, descrição, projeto, duração,
 * prazo, horário, recorrência pelo modal, ícone, prioridade, marco, pontual, tag, link, subtarefa)
 * e confere o payload.
 */

vi.mock("@/api/tasks", () => ({
  // Feature 085: os donos do formulário/lista carregam e gravam os links externos.
  fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
  saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
  fetchTasks: vi.fn(),
  fetchProjects: vi.fn(),
  fetchTags: vi.fn(),
  fetchDependencies: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  deleteTasks: vi.fn(),
  createTag: vi.fn(),
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
  fetchEntriesForTask: vi.fn().mockResolvedValue([]),
  updateTimeEntry: vi.fn(),
  deleteTimeEntry: vi.fn(),
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

const mockedFetchTasks = vi.mocked(fetchTasks);
const mockedFetchProjects = vi.mocked(fetchProjects);
const mockedFetchTags = vi.mocked(fetchTags);
const mockedFetchDependencies = vi.mocked(fetchDependencies);
const mockedFetchRecurring = vi.mocked(fetchRecurringTransactions);
const mockedCreateTask = vi.mocked(createTask);
const mockedUpdateTask = vi.mocked(updateTask);
const mockedCreateTag = vi.mocked(createTag);

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Tarefa existente",
    status: "todo",
    tag_ids: [],
    due_date: null,
    due_time: null,
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    priority: null,
    ...overrides,
  };
}

const PROJECT: Project = { id: "project-1", name: "Projeto X", status: "active", tag_ids: [] };
const TAG: Tag = { id: "tag-1", name: "casa", color: "#ff0000" };

async function renderLoaded(tasks: Task[]) {
  mockedFetchTasks.mockResolvedValue(tasks);
  mockedFetchProjects.mockResolvedValue([PROJECT]);
  mockedFetchTags.mockResolvedValue([TAG]);
  mockedFetchDependencies.mockResolvedValue([]);
  mockedFetchRecurring.mockResolvedValue([]);
  render(
    <MemoryRouter>
      <TaskList />
    </MemoryRouter>
  );
  await screen.findAllByRole("button", { name: "Nova tarefa" });
}

/** Abre o painel de criação e devolve as queries escopadas ao dialog. */
async function openCreatePanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole("button", { name: "Nova tarefa" })[0]);
  return within(await screen.findByRole("dialog"));
}

/**
 * Feature 100: o título do card virou um botão de edição inline, então clicar nele **não** abre
 * mais o dialog completo — quem abre é o lápis da linha/card (ou qualquer ponto fora do título e
 * da descrição). O caminho do formulário continua existindo, só mudou de gesto.
 */
async function openFullDialog(
  user: ReturnType<typeof userEvent.setup>,
  title: string
) {
  const card = screen
    .getByRole("button", { name: `Editar título: ${title}` })
    .closest(".cursor-pointer") as HTMLElement;
  const pencil = card.querySelector("svg.lucide-pen")?.closest("button") as HTMLButtonElement;
  await user.click(pencil);
}

describe("TaskList — painel de tarefa salva todos os blocos (feature 080)", () => {
  beforeEach(() => {
    toastMock.mockReset();
    mockedCreateTask.mockReset();
    mockedUpdateTask.mockReset();
    mockedCreateTag.mockReset();
    mockedCreateTask.mockResolvedValue(makeTask({ id: "novo-1" }));
    mockedUpdateTask.mockResolvedValue(undefined);
  });

  it("criar: um campo de cada bloco do painel chega inteiro no `createTask`", async () => {
    const user = userEvent.setup();
    await renderLoaded([]);
    const panel = await openCreatePanel(user);

    // Bloco 1 — título.
    await user.type(panel.getByLabelText(/^Título/), "Tarefa do painel");

    // Bloco 2 — descrição (atrás do colapsável).
    await user.click(panel.getByRole("button", { name: /Descrição/ }));
    await user.type(panel.getByPlaceholderText(/Descrição em Markdown/), "Detalhes aqui");

    // Bloco 3 — projeto, duração, prazo, horário e recorrência.
    await user.click(panel.getByRole("button", { name: "Sem projeto" }));
    await user.click(await screen.findByRole("option", { name: "Projeto X" }));

    await user.click(panel.getByRole("button", { name: "+ Duração" }));
    await user.click(await screen.findByRole("button", { name: "1h" }));

    await user.click(panel.getByRole("button", { name: "Data limite" }));
    await user.click(await screen.findByRole("button", { name: "Hoje" }));
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;

    await user.clear(panel.getByLabelText(/Horário/));
    await user.type(panel.getByLabelText(/Horário/), "09:30");

    await user.click(panel.getByRole("button", { name: /Repetição da tarefa/ }));
    const recurrenceTitle = await screen.findByText("Repetição da tarefa");
    const recurrenceDialog = within(recurrenceTitle.closest('[role="dialog"]') as HTMLElement);
    await user.click(recurrenceDialog.getByRole("button", { name: "Recorrência simples" }));
    await user.keyboard("{Escape}");

    // Bloco 4 — prioridade e marco (o ícone tem upload próprio, coberto em TaskFormFields.test).
    await user.click(panel.getByRole("button", { name: "Alta" }));
    await user.click(panel.getByRole("checkbox", { name: /Marco no Gantt/ }));

    // Bloco 5 — tag e a seção de links externos (feature 085: o campo único virou lista, e o link
    // deixou de viajar no payload da tarefa).
    await user.click(panel.getByLabelText("Tags"));
    await user.click(await screen.findByText("casa"));
    await user.click(panel.getByRole("button", { name: /Links externos/ }));
    await user.click(panel.getByRole("button", { name: "Adicionar link" }));
    await user.type(
      panel.getByLabelText("URL do link 1 de 1"),
      "https://github.com/owner/repo/issues/7"
    );
    await user.type(panel.getByLabelText("Comentário do link 1 de 1"), "issue de origem");

    // Bloco 6 — subtarefa (rascunho, criada depois da tarefa-mãe).
    await user.click(panel.getByRole("button", { name: /Subtarefas/ }));
    await user.type(panel.getByPlaceholderText("Adicionar subtarefa"), "Passo 1");
    await user.click(panel.getByRole("button", { name: "Adicionar" }));

    await user.click(screen.getByRole("button", { name: "Criar tarefa" }));

    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Tarefa do painel",
        description: "Detalhes aqui",
        project_id: "project-1",
        estimated_duration: 60,
        due_date: todayIso,
        due_time: "09:30",
        recurrence_rule: expect.objectContaining({
          frequency: "daily",
          interval: 1,
          time: "09:30",
        }),
        priority: "high",
        is_milestone: true,
        tag_ids: ["tag-1"],
      })
    );
    // Feature 085: o link não vai mais no payload da tarefa — vai para `task_external_link`,
    // **depois** do `createTask`, já com o id novo e com o comentário do usuário.
    expect(mockedCreateTask.mock.calls[0][0]).not.toHaveProperty("external_url");
    expect(saveExternalLinksForTask).toHaveBeenCalledWith("novo-1", [
      {
        url: "https://github.com/owner/repo/issues/7",
        comment: "issue de origem",
        position: 0,
      },
    ]);
    // A subtarefa rascunho vira uma segunda chamada, com o pai já criado.
    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ parent_task_id: "novo-1", title: "Passo 1" })
    );
  });

  it("criar: 'Tarefa pontual' zera a duração no payload (exclusão mútua preservada)", async () => {
    const user = userEvent.setup();
    await renderLoaded([]);
    const panel = await openCreatePanel(user);

    await user.type(panel.getByLabelText(/^Título/), "Trocar a escova");
    await user.click(panel.getByRole("button", { name: "+ Duração" }));
    await user.click(await screen.findByRole("button", { name: "30min" }));
    await user.click(panel.getByRole("checkbox", { name: /Tarefa pontual \(sem duração\)/ }));

    await user.click(screen.getByRole("button", { name: "Criar tarefa" }));

    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Trocar a escova", is_quick: true, estimated_duration: null })
    );
  });

  it("editar: o painel abre com os valores atuais e o `updateTask` preserva o que não foi tocado", async () => {
    const user = userEvent.setup();
    const task = makeTask({
      id: "task-9",
      title: "Tarefa existente",
      description: "Descrição antiga",
      project_id: "project-1",
      due_date: "2026-08-19",
      due_time: "08:00",
      estimated_duration: 30,
      priority: "low",
      is_milestone: true,
      tag_ids: ["tag-1"],
    });
    await renderLoaded([task]);

    await openFullDialog(user, "Tarefa existente");
    const panel = within(screen.getByRole("dialog"));

    // O painel reflete o que está salvo, sem precisar abrir aba nenhuma.
    expect(panel.getByLabelText(/^Título/)).toHaveValue("Tarefa existente");
    expect(panel.getByRole("button", { name: /Descrição antiga/ })).toBeInTheDocument();
    expect(panel.getByRole("button", { name: "Projeto X" })).toBeInTheDocument();
    expect(panel.getByRole("button", { name: "30min" })).toBeInTheDocument();
    expect(panel.getByLabelText(/Horário/)).toHaveValue("08:00");
    expect(panel.getByRole("checkbox", { name: /Marco no Gantt/ })).toBeChecked();

    // Muda só a prioridade e salva.
    await user.click(panel.getByRole("button", { name: "Alta" }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(mockedUpdateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "task-9",
        title: "Tarefa existente",
        description: "Descrição antiga",
        project_id: "project-1",
        due_date: "2026-08-19",
        due_time: "08:00",
        estimated_duration: 30,
        is_milestone: true,
        tag_ids: ["tag-1"],
        priority: "high",
      })
    );
    // Feature 085: `external_url`/`external_provider` saíram do payload da tarefa — a coluna segue
    // no banco como rede de segurança, mas nada mais escreve nela.
    expect(mockedUpdateTask.mock.calls[0][0]).not.toHaveProperty("external_url");
    expect(mockedUpdateTask.mock.calls[0][0]).not.toHaveProperty("external_provider");
  });
  it("criar (feature 083): título + atalho 'Hoje' chega no `createTask` como prazo de hoje", async () => {
    const user = userEvent.setup();
    await renderLoaded([]);
    const panel = await openCreatePanel(user);

    await user.type(panel.getByLabelText(/^Título/), "Pagar o boleto");
    await user.click(panel.getByRole("button", { name: /^Hoje —/ }));

    await user.click(screen.getByRole("button", { name: "Criar tarefa" }));

    expect(mockedCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Pagar o boleto",
        due_date: formatLocalIsoDate(new Date()),
        due_time: null,
        recurrence_rule: null,
      })
    );
  });
});
