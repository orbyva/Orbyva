import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AgendaGrid } from "@/pages/admin/tasks/AgendaGrid";
import {
  createProjectEvent,
  fetchProjectEvents,
  fetchProjects,
  fetchTags,
  fetchTasks,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Project, ProjectEvent } from "@/types/tasks";

/**
 * Feature 103 — criar evento **de dentro da Agenda**.
 *
 * Antes desta feature `project_event` só nascia dentro do dialog de projeto: para marcar uma
 * reunião de quinta o usuário tinha de sair da Agenda, abrir o projeto e editá-lo. O que este
 * arquivo prova é o caminho curto ("Novo" → "Evento" → salvar) e que o evento criado **aparece na
 * grade** — criar e não ver o item é o mesmo bug que a 099 consertou na Lista.
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
const mockedFetchRecurringTransactions = vi.mocked(fetchRecurringTransactions);

const ALPHA: Project = { id: "p-alpha", name: "Alpha", status: "active", tag_ids: [] };

/** Dia 10 do mês em foco: existe em qualquer mês e está sempre na grade que a Agenda abre. */
const HOJE = new Date();
const MES = `${HOJE.getFullYear()}-${String(HOJE.getMonth() + 1).padStart(2, "0")}`;
const DIA = `${MES}-10`;

function makeEvent(overrides: Partial<ProjectEvent> = {}): ProjectEvent {
  return {
    id: "ev-1",
    project_id: null,
    title: "Reunião de equipe",
    starts_at: `${DIA}T10:00:00`,
    ...overrides,
  };
}

/** "Novo" → "Evento" e o formulário aberto. */
async function abrirFormularioDeEvento(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Novo item na agenda" }));
  await user.click(await screen.findByRole("menuitem", { name: "Evento" }));
  await screen.findByText("Novo evento");
}

async function preencherEvento(
  user: ReturnType<typeof userEvent.setup>,
  { titulo = "Reunião de equipe", data = DIA, inicio = "10:00" } = {}
) {
  await user.type(screen.getByLabelText(/^Título/), titulo);
  if (data) await user.type(screen.getByLabelText(/^Data/), data);
  if (inicio) await user.type(screen.getByLabelText(/^Início/), inicio);
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
  localStorage.clear();
  mockedFetchTasks.mockReset().mockResolvedValue([]);
  mockedFetchProjects.mockReset().mockResolvedValue([ALPHA]);
  mockedFetchProjectEvents.mockReset().mockResolvedValue([]);
  mockedFetchTags.mockReset().mockResolvedValue([]);
  mockedCreateProjectEvent.mockReset();
  mockedFetchRecurringTransactions.mockReset().mockResolvedValue([]);
  toastMock.mockReset();
});

describe("AgendaGrid — menu «Novo» (feature 103)", () => {
  it("a barra tem o botão «Novo» com as duas opções: Evento e Tarefa", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: "Novo item na agenda" }));

    expect(await screen.findByRole("menuitem", { name: "Evento" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Tarefa" })).toBeInTheDocument();
  });
});

describe("AgendaGrid — `+` de cada dia (feature 103)", () => {
  /** O `+` do dia 10 do mês em foco — o rótulo é datado, como o do número do dia. */
  function maisDoDia10(): HTMLElement {
    const dia10 = new Date(HOJE.getFullYear(), HOJE.getMonth(), 10);
    const rotulo = `Novo item em ${dia10.getDate()} de`;
    return screen.getAllByRole("button", { name: new RegExp(`^${rotulo}`) })[0];
  }

  it("a célula do mês tem um `+` datado que abre o mesmo menu Evento/Tarefa", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(maisDoDia10());

    expect(await screen.findByRole("menuitem", { name: "Evento" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Tarefa" })).toBeInTheDocument();
  });

  /**
   * A célula do mês já tinha dois alvos clicáveis antes desta feature (o número do dia, que abre o
   * modal do dia, e cada chip, que abre o item). O `+` é o terceiro: se o clique nele escapasse
   * para os vizinhos, escolher "Evento" abriria o formulário **por cima** do modal do dia.
   */
  it("clicar no `+` não dispara o número do dia nem o chip vizinho — nenhum dialog abre", async () => {
    const user = userEvent.setup();
    mockedFetchProjectEvents.mockResolvedValue([makeEvent()]);
    await renderLoaded();

    await user.click(maisDoDia10());

    await screen.findByRole("menuitem", { name: "Evento" });
    // Menu aberto (role="menu"), nenhum dialog: nem o modal do dia, nem o detalhe do evento.
    expect(screen.queryByRole("dialog")).toBeNull();

    // Contraprova: os dois alvos vizinhos continuam funcionando por conta própria.
    await user.keyboard("{Escape}");
    await user.click(screen.getByText("Reunião de equipe"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("criar pelo `+` de um dia já vem com aquela data no formulário de evento", async () => {
    const user = userEvent.setup();
    mockedCreateProjectEvent.mockResolvedValue(makeEvent());
    await renderLoaded();

    await user.click(maisDoDia10());
    await user.click(await screen.findByRole("menuitem", { name: "Evento" }));
    await screen.findByText("Novo evento");

    expect(screen.getByLabelText(/^Data/)).toHaveValue(DIA);

    // E o evento sai com essa data, sem o usuário digitar nada além do título e da hora.
    await user.type(screen.getByLabelText(/^Título/), "Dentista");
    await user.type(screen.getByLabelText(/^Início/), "15:00");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mockedCreateProjectEvent).toHaveBeenCalledTimes(1));
    const inicio = new Date(mockedCreateProjectEvent.mock.calls[0][0].starts_at);
    expect(inicio.getDate()).toBe(10);
    expect(inicio.getHours()).toBe(15);
  });

  it("na visão Semana o `+` fica no cabeçalho da coluna e abre o mesmo menu", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("tab", { name: "Semana" }));
    await screen.findByText("00:00");

    // Um `+` por coluna de dia: 7 na semana.
    const mais = screen.getAllByRole("button", { name: /^Novo item em / });
    expect(mais).toHaveLength(7);

    await user.click(mais[0]);
    expect(await screen.findByRole("menuitem", { name: "Evento" })).toBeInTheDocument();
  });
});

describe("AgendaGrid — criar evento pela barra (feature 103)", () => {
  it("«Novo» → «Evento» → preencher → createProjectEvent com starts_at no dia/hora escolhidos", async () => {
    const user = userEvent.setup();
    mockedCreateProjectEvent.mockResolvedValue(makeEvent());
    await renderLoaded();

    await abrirFormularioDeEvento(user);
    await preencherEvento(user);
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mockedCreateProjectEvent).toHaveBeenCalledTimes(1));
    const [payload] = mockedCreateProjectEvent.mock.calls[0];
    expect(payload.title).toBe("Reunião de equipe");
    expect(payload.ends_at).toBeNull();
    // Hora local, não UTC: reler o ISO devolve as 10h do relógio do usuário, no dia 10.
    const inicio = new Date(payload.starts_at);
    expect(inicio.getHours()).toBe(10);
    expect(inicio.getDate()).toBe(10);
    expect(inicio.getMonth()).toBe(HOJE.getMonth());
  });

  it("o evento criado aparece na grade depois do reload", async () => {
    const user = userEvent.setup();
    const criado = makeEvent();
    mockedCreateProjectEvent.mockResolvedValue(criado);
    // O `load()` de depois do save é quem traz o evento — nada de inserção otimista.
    mockedFetchProjectEvents.mockResolvedValueOnce([]).mockResolvedValue([criado]);
    await renderLoaded();

    expect(screen.queryByText("Reunião de equipe")).not.toBeInTheDocument();

    await abrirFormularioDeEvento(user);
    await preencherEvento(user);
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Reunião de equipe")).toBeInTheDocument();
    // E o formulário fecha no sucesso.
    await waitFor(() => expect(screen.queryByText("Novo evento")).not.toBeInTheDocument());
  });

  it("sem escolher projeto manda project_id nulo e o chip sai com a cor neutra", async () => {
    const user = userEvent.setup();
    const semProjeto = makeEvent({ project_id: null, title: "Dentista" });
    mockedCreateProjectEvent.mockResolvedValue(semProjeto);
    mockedFetchProjectEvents.mockResolvedValueOnce([]).mockResolvedValue([semProjeto]);
    await renderLoaded();

    await abrirFormularioDeEvento(user);
    // "Sem projeto" já vem selecionado no `ProjectPicker` — não precisa clicar em nada.
    expect(screen.getByRole("option", { name: "Sem projeto" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await preencherEvento(user, { titulo: "Dentista", inicio: "15:00" });
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mockedCreateProjectEvent).toHaveBeenCalledTimes(1));
    expect(mockedCreateProjectEvent.mock.calls[0][0].project_id).toBeNull();

    // Na grade, a bolinha do chip cai no cinza neutro (`eventProjectColor` devolve null).
    const chip = (await screen.findByText("Dentista")).closest("button")!;
    expect(chip.querySelector("span")).toHaveStyle({
      backgroundColor: "hsl(var(--muted-foreground))",
    });

    // E o detalhe mostra o rótulo neutro no lugar do badge de projeto.
    await user.click(chip);
    expect(await screen.findByText("Recebido por convite")).toBeInTheDocument();
  });

  it("falha do createProjectEvent avisa e mantém o formulário aberto com o que foi digitado", async () => {
    const user = userEvent.setup();
    mockedCreateProjectEvent.mockRejectedValue(new Error("sem rede"));
    await renderLoaded();

    await abrirFormularioDeEvento(user);
    await preencherEvento(user);
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    // Toast destrutivo com a mensagem real do erro (`getErrorMessage`).
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: "sem rede", variant: "destructive" })
      )
    );
    // Perder o formulário num erro de rede é o pior desfecho possível: ele fica aberto e cheio.
    expect(screen.getByText("Novo evento")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Título/)).toHaveValue("Reunião de equipe");
    expect(screen.getByLabelText(/^Data/)).toHaveValue(DIA);
    expect(screen.getByLabelText(/^Início/)).toHaveValue("10:00");
    // E dá pra tentar de novo (o botão destravou).
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
  });
});
