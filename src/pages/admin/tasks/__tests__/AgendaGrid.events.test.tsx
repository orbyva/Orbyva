import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AgendaGrid } from "@/pages/admin/tasks/AgendaGrid";
import {
  createProjectEvent,
  deleteProjectEvent,
  fetchProjectEvents,
  fetchProjects,
  fetchTags,
  fetchTasks,
  updateProjectEvent,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import { toLocalDateTimeInputValue } from "@/lib/dates";
import type { Project, ProjectEvent, Task } from "@/types/tasks";

/**
 * Feature 067: a Agenda deixou de ser só leitura de evento — passa a criar, editar e excluir no
 * lugar onde o compromisso é marcado. Sem navegador na verificação, é este arquivo que prova o
 * caminho de escrita ponta a ponta (clique -> dialog -> chamada de API com o payload certo).
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
const mockedCreateProjectEvent = vi.mocked(createProjectEvent);
const mockedUpdateProjectEvent = vi.mocked(updateProjectEvent);
const mockedDeleteProjectEvent = vi.mocked(deleteProjectEvent);

/** Meio-dia de hoje: cai sempre dentro da grade do mês corrente, que é a visão padrão. */
function todayAtNoon(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0);
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Tarefa qualquer",
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

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "Projeto Alpha",
    color: "#ff0000",
    status: "active",
    tag_ids: [],
    ...overrides,
  };
}

function makeEvent(overrides: Partial<ProjectEvent> = {}): ProjectEvent {
  return {
    id: "event-1",
    project_id: null,
    task_id: null,
    title: "Evento",
    starts_at: todayAtNoon().toISOString(),
    ends_at: null,
    ...overrides,
  };
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

function saveButton(): HTMLElement {
  return screen.getByRole("button", { name: /Criar evento|Salvar alterações/ });
}

beforeEach(() => {
  toastMock.mockReset();
  mockedFetchTasks.mockReset().mockResolvedValue([]);
  mockedFetchProjects.mockReset().mockResolvedValue([]);
  mockedFetchProjectEvents.mockReset().mockResolvedValue([]);
  mockedFetchTags.mockReset().mockResolvedValue([]);
  mockedFetchRecurringTransactions.mockReset().mockResolvedValue([]);
  mockedCreateProjectEvent.mockReset().mockResolvedValue(makeEvent());
  mockedUpdateProjectEvent.mockReset().mockResolvedValue(makeEvent());
  mockedDeleteProjectEvent.mockReset().mockResolvedValue(undefined);
});

describe("AgendaGrid — criar evento (feature 067)", () => {
  it("'Novo evento' abre o dialog de criação", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    expect(screen.queryByText("Novo evento", { selector: "h2, h3" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Novo evento" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Título/)).toHaveValue("");
    expect(screen.getByLabelText(/^Início/)).toHaveValue("");
  });

  it("salvar chama createProjectEvent com o evento avulso e recarrega a agenda", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    expect(mockedFetchProjectEvents).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Novo evento" }));
    await user.type(screen.getByLabelText(/^Título/), "Dentista");
    await user.type(screen.getByLabelText(/^Início/), "2026-08-17T09:00");
    await user.click(saveButton());

    await waitFor(() =>
      expect(mockedCreateProjectEvent).toHaveBeenCalledWith({
        title: "Dentista",
        starts_at: new Date(2026, 7, 17, 9, 0).toISOString(),
        ends_at: null,
        project_id: null,
        task_id: null,
      })
    );
    // Recarrega a agenda depois de salvar (mesmo padrão de `handleDeleteEvent`).
    await waitFor(() => expect(mockedFetchProjectEvents).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("vincular a uma tarefa manda task_id preenchido e project_id null", async () => {
    const user = userEvent.setup();
    mockedFetchProjects.mockResolvedValue([makeProject()]);
    mockedFetchTasks.mockResolvedValue([
      makeTask({ id: "task-1", project_id: "project-1", title: "Comprar cimento" }),
    ]);
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: "Novo evento" }));
    await user.type(screen.getByLabelText(/^Título/), "Reunião sobre o cimento");
    await user.type(screen.getByLabelText(/^Início/), "2026-08-17T09:00");
    await user.click(screen.getByRole("tab", { name: "Tarefa" }));
    await user.click(await screen.findByRole("option", { name: /Comprar cimento/ }));
    await user.click(saveButton());

    await waitFor(() =>
      expect(mockedCreateProjectEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Reunião sobre o cimento",
          project_id: null,
          task_id: "task-1",
        })
      )
    );
  });

  it("clicar num dia vazio do mês abre a criação com o dia às 09:00 já preenchido", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    const day = todayAtNoon();
    const label = `Novo evento em ${format(day, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`;
    await user.click(screen.getByRole("button", { name: label }));

    const startsInput = await screen.findByLabelText(/^Início/);
    expect(startsInput).toHaveValue(
      toLocalDateTimeInputValue(
        new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0).toISOString()
      )
    );
    expect(startsInput).toHaveValue(`${format(day, "yyyy-MM-dd")}T09:00`);
  });

  it("clicar num chip de evento não dispara a criação (o alvo do dia não rouba o clique)", async () => {
    const user = userEvent.setup();
    mockedFetchProjectEvents.mockResolvedValue([makeEvent({ title: "Dentista" })]);
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: "Dentista" }));

    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: "Criar evento" })).not.toBeInTheDocument();
  });

  it("erro na criação mostra toast e mantém o dialog aberto com o que foi digitado", async () => {
    const user = userEvent.setup();
    mockedCreateProjectEvent.mockRejectedValue(new Error("insert falhou"));
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: "Novo evento" }));
    await user.type(screen.getByLabelText(/^Título/), "Dentista");
    await user.type(screen.getByLabelText(/^Início/), "2026-08-17T09:00");
    await user.click(saveButton());

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      )
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Título/)).toHaveValue("Dentista");
    expect(saveButton()).toBeEnabled();
  });
});

describe("AgendaGrid — editar e excluir evento pelo mesmo dialog (feature 067)", () => {
  it("clicar num evento abre o form preenchido (não o antigo detalhe read-only)", async () => {
    const user = userEvent.setup();
    // Hoje (a visão mês abre no mês corrente, é lá que o chip aparece) com hora fixa: o que se
    // verifica é a ida ISO -> `datetime-local` na hora local, não a data em si.
    const day = todayAtNoon();
    const starts = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 14, 30);
    const ends = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 15, 30);
    mockedFetchProjectEvents.mockResolvedValue([
      makeEvent({
        id: "event-9",
        title: "Reunião de obra",
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
      }),
    ]);
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: "Reunião de obra" }));
    const dialog = await screen.findByRole("dialog");

    // O dialog antigo era read-only (só título + data em texto); agora há campos editáveis.
    expect(within(dialog).getByLabelText(/^Título/)).toHaveValue("Reunião de obra");
    expect(within(dialog).getByLabelText(/^Início/)).toHaveValue(`${format(day, "yyyy-MM-dd")}T14:30`);
    expect(within(dialog).getByLabelText(/^Fim/)).toHaveValue(`${format(day, "yyyy-MM-dd")}T15:30`);
    expect(within(dialog).getByRole("button", { name: "Salvar alterações" })).toBeInTheDocument();
  });

  it("salvar a edição chama updateProjectEvent com o id do evento clicado", async () => {
    const user = userEvent.setup();
    mockedFetchProjectEvents.mockResolvedValue([
      makeEvent({ id: "event-9", title: "Reunião de obra" }),
    ]);
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: "Reunião de obra" }));
    const title = await screen.findByLabelText(/^Título/);
    await user.clear(title);
    await user.type(title, "Reunião de obra remarcada");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(mockedUpdateProjectEvent).toHaveBeenCalledWith(
        expect.objectContaining({ id: "event-9", title: "Reunião de obra remarcada" })
      )
    );
    expect(mockedCreateProjectEvent).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("excluir dentro do form chama deleteProjectEvent e fecha o dialog", async () => {
    const user = userEvent.setup();
    mockedFetchProjectEvents.mockResolvedValue([
      makeEvent({ id: "event-9", title: "Reunião de obra" }),
    ]);
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: "Reunião de obra" }));
    await user.click(await screen.findByRole("button", { name: /Excluir/ }));
    // `ConfirmDeleteDialog` — o botão de confirmação do alerta.
    const alert = await screen.findByRole("alertdialog");
    await user.click(within(alert).getByRole("button", { name: /Excluir/ }));

    await waitFor(() => expect(mockedDeleteProjectEvent).toHaveBeenCalledWith("event-9"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("'Ir para o projeto' só aparece quando o evento resolve um projeto", async () => {
    const user = userEvent.setup();
    const project = makeProject();
    mockedFetchProjects.mockResolvedValue([project]);
    mockedFetchProjectEvents.mockResolvedValue([
      makeEvent({ id: "event-a", project_id: project.id, title: "Com projeto" }),
      makeEvent({ id: "event-b", title: "Avulso" }),
    ]);
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: "Com projeto" }));
    const withProject = await screen.findByRole("dialog");
    expect(within(withProject).getByRole("link", { name: /Ir para o projeto/ })).toHaveAttribute(
      "href",
      "/tasks/projects/project-1"
    );

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Avulso" }));
    const standalone = await screen.findByRole("dialog");
    expect(within(standalone).queryByText("Ir para o projeto")).not.toBeInTheDocument();
  });
});

describe("AgendaGrid — filtro de projeto resolve o vínculo indireto (feature 067)", () => {
  /** O `Select` do filtro é o único combobox da tela com a agenda carregada e nenhum dialog aberto. */
  async function pickProjectFilter(user: ReturnType<typeof userEvent.setup>, option: string) {
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: option }));
  }

  it("filtrar pelo projeto mantém o evento vinculado a uma TAREFA daquele projeto", async () => {
    const user = userEvent.setup();
    mockedFetchProjects.mockResolvedValue([
      makeProject(),
      makeProject({ id: "project-2", name: "Projeto Beta", color: "#0000ff" }),
    ]);
    mockedFetchTasks.mockResolvedValue([
      makeTask({ id: "task-1", project_id: "project-1", title: "Comprar cimento" }),
    ]);
    mockedFetchProjectEvents.mockResolvedValue([
      makeEvent({ id: "event-a", task_id: "task-1", title: "Reunião da tarefa" }),
      makeEvent({ id: "event-b", title: "Avulso" }),
    ]);
    await renderLoaded();

    expect(screen.getByText("Reunião da tarefa")).toBeInTheDocument();

    await pickProjectFilter(user, "Projeto Alpha");
    // Sem `resolveEventProjectId` o evento sumiria: o `project_id` da linha é null.
    expect(screen.getByText("Reunião da tarefa")).toBeInTheDocument();
    expect(screen.queryByText("Avulso")).not.toBeInTheDocument();

    await pickProjectFilter(user, "Projeto Beta");
    expect(screen.queryByText("Reunião da tarefa")).not.toBeInTheDocument();
  });

  it("'Sem projeto' deixa só os avulsos (esconde evento de projeto e evento de tarefa com projeto)", async () => {
    const user = userEvent.setup();
    mockedFetchProjects.mockResolvedValue([makeProject()]);
    mockedFetchTasks.mockResolvedValue([
      makeTask({ id: "task-1", project_id: "project-1", title: "Comprar cimento" }),
    ]);
    mockedFetchProjectEvents.mockResolvedValue([
      makeEvent({ id: "event-a", project_id: "project-1", title: "Do projeto" }),
      makeEvent({ id: "event-b", task_id: "task-1", title: "Da tarefa com projeto" }),
      makeEvent({ id: "event-c", title: "Avulso" }),
    ]);
    await renderLoaded();

    await pickProjectFilter(user, "Sem projeto");

    expect(screen.getByText("Avulso")).toBeInTheDocument();
    expect(screen.queryByText("Do projeto")).not.toBeInTheDocument();
    expect(screen.queryByText("Da tarefa com projeto")).not.toBeInTheDocument();
  });
});
