import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskDeleteDialog } from "@/pages/admin/tasks/TaskDeleteDialog";
import { countTaskSeries } from "@/api/tasks";
import { fetchMedications } from "@/api/health/medications";
import type { Task } from "@/types/tasks";

/**
 * Feature 075 — as três variantes do dialog e a contagem que vem do servidor.
 *
 * O que estes testes protegem, e que nenhum outro lugar protege: o usuário precisa **entender o que
 * vai ser apagado antes de confirmar**. Isso significa nunca mostrar um número inventado (por isso o
 * "…" enquanto carrega), nunca apagar o histórico de adesão por omissão (por isso o checkbox começa
 * desmarcado) e nunca oferecer "apagar só esta dose" sem dizer que ela volta.
 */

vi.mock("@/api/tasks", () => ({ countTaskSeries: vi.fn() }));
vi.mock("@/api/health/medications", () => ({ fetchMedications: vi.fn() }));

const mockedCount = vi.mocked(countTaskSeries);
const mockedFetchMedications = vi.mocked(fetchMedications);

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    user_id: "user-1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Tarefa",
    description: null,
    status: "todo",
    tag_ids: [],
    due_date: "2026-08-17",
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    ...overrides,
  } as Task;
}

const dose = makeTask({ id: "dose-1", title: "SEMTRI", medication_id: "med-1" });
const ocorrencia = makeTask({ id: "oco-2", recurrence_origin_id: "origem" });

async function abrir(ui: React.ReactElement) {
  const user = userEvent.setup();
  render(ui);
  await user.click(screen.getByRole("button", { name: "Abrir exclusão" }));
  return user;
}

function dialog(props: Partial<React.ComponentProps<typeof TaskDeleteDialog>> = {}) {
  return (
    <TaskDeleteDialog task={makeTask()} onConfirm={() => {}} {...props}>
      <button type="button">Abrir exclusão</button>
    </TaskDeleteDialog>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedCount.mockResolvedValue(0);
  mockedFetchMedications.mockResolvedValue([]);
});

describe("TaskDeleteDialog — tarefa comum", () => {
  it("mostra um botão só e não gasta uma contagem no servidor", async () => {
    const onConfirm = vi.fn();
    const user = await abrir(dialog({ onConfirm, onConfirmScoped: vi.fn() }));

    expect(screen.getByText("Excluir esta tarefa?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /todas as ocorrências/i })).not.toBeInTheDocument();
    expect(mockedCount).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Excluir" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("sem `onConfirmScoped`, nem uma recorrência ganha a opção em massa", async () => {
    await abrir(dialog({ task: ocorrencia }));

    expect(screen.getByText("Excluir esta tarefa?")).toBeInTheDocument();
    expect(mockedCount).not.toHaveBeenCalled();
  });
});

describe("TaskDeleteDialog — recorrência simples", () => {
  it("mostra as duas opções de sempre e a contagem só depois de o servidor responder", async () => {
    let resolveCount: (n: number) => void = () => {};
    mockedCount.mockReturnValue(new Promise<number>((r) => (resolveCount = r)));

    await abrir(dialog({ task: ocorrencia, onConfirmScoped: vi.fn() }));

    expect(screen.getByRole("button", { name: "Excluir somente esta" })).toBeInTheDocument();
    // Enquanto o servidor não responde, "…" — nunca um número tirado da lista da tela.
    expect(screen.getByRole("button", { name: "Excluir todas as ocorrências (…)" })).toBeInTheDocument();

    resolveCount(7);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Excluir todas as ocorrências (7)" })).toBeInTheDocument()
    );
    expect(screen.getByText(/recorrência com 7 ocorrências/)).toBeInTheDocument();
    expect(mockedCount).toHaveBeenCalledWith(ocorrencia, { mode: "series" });
  });

  it("série de uma ocorrência só fala no singular", async () => {
    mockedCount.mockResolvedValue(1);

    await abrir(dialog({ task: ocorrencia, onConfirmScoped: vi.fn() }));

    await waitFor(() => expect(screen.getByText(/recorrência com 1 ocorrência\./)).toBeInTheDocument());
  });

  it("'excluir todas' manda a opção, não uma lista de ids montada na tela", async () => {
    const onConfirmScoped = vi.fn();
    mockedCount.mockResolvedValue(3);
    const user = await abrir(dialog({ task: ocorrencia, onConfirmScoped }));

    await user.click(await screen.findByRole("button", { name: "Excluir todas as ocorrências (3)" }));

    expect(onConfirmScoped).toHaveBeenCalledWith({ mode: "series" });
  });
});

describe("TaskDeleteDialog — dose de medicação", () => {
  it("mostra as três ações, com o aviso de que a dose volta enquanto o tratamento estiver ativo", async () => {
    mockedCount.mockResolvedValue(4);
    mockedFetchMedications.mockResolvedValue([{ id: "med-1" }] as never);

    await abrir(dialog({ task: dose, onConfirmScoped: vi.fn() }));

    expect(screen.getByText(/voltam/)).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Encerrar o tratamento e apagar as doses futuras/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Apagar todas as doses deste tratamento/ })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apagar só esta dose" })).toBeInTheDocument();
  });

  it("o checkbox 'incluir as doses já tomadas' começa desmarcado", async () => {
    await abrir(dialog({ task: dose, onConfirmScoped: vi.fn() }));

    const checkbox = screen.getByLabelText("Incluir as doses já tomadas");
    expect(checkbox).not.toBeChecked();
    // A primeira contagem também é feita **sem** as concluídas — o número bate com o padrão.
    expect(mockedCount).toHaveBeenCalledWith(dose, { mode: "all-doses", includeCompleted: false });
  });

  it("marcar o checkbox recontagem e muda o que a ação vai apagar", async () => {
    mockedCount.mockImplementation(async (_task, option) =>
      option.mode === "all-doses" && option.includeCompleted ? 10 : 6
    );
    const onConfirmScoped = vi.fn();
    const user = await abrir(dialog({ task: dose, onConfirmScoped }));

    await screen.findByRole("button", { name: "Apagar todas as doses deste tratamento (6)" });
    await user.click(screen.getByLabelText("Incluir as doses já tomadas"));

    const botao = await screen.findByRole("button", {
      name: "Apagar todas as doses deste tratamento (10)",
    });
    await user.click(botao);

    expect(onConfirmScoped).toHaveBeenCalledWith({ mode: "all-doses", includeCompleted: true });
  });

  it("a ação recomendada encerra o tratamento junto", async () => {
    const onConfirmScoped = vi.fn();
    mockedCount.mockResolvedValue(2);
    mockedFetchMedications.mockResolvedValue([{ id: "med-1" }] as never);
    const user = await abrir(dialog({ task: dose, onConfirmScoped }));

    await user.click(
      await screen.findByRole("button", {
        name: "Encerrar o tratamento e apagar as doses futuras (2)",
      })
    );

    expect(onConfirmScoped).toHaveBeenCalledWith({ mode: "end-treatment" });
  });

  it("tratamento já inativo: a ação recomendada não fala em encerrar de novo", async () => {
    mockedCount.mockResolvedValue(2);
    // `fetchMedications(true)` traz só os ativos; o tratamento desta dose não está lá.
    mockedFetchMedications.mockResolvedValue([{ id: "outro" }] as never);

    await abrir(dialog({ task: dose, onConfirmScoped: vi.fn() }));

    expect(await screen.findByRole("button", { name: "Apagar as doses futuras (2)" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Encerrar o tratamento/ })
    ).not.toBeInTheDocument();
  });

  it("'apagar só esta dose' usa o caminho de sempre", async () => {
    const onConfirm = vi.fn();
    const user = await abrir(dialog({ task: dose, onConfirm, onConfirmScoped: vi.fn() }));

    await user.click(screen.getByRole("button", { name: "Apagar só esta dose" }));

    expect(onConfirm).toHaveBeenCalled();
  });
});

describe("TaskDeleteDialog — a contagem falhou", () => {
  it("o dialog continua utilizável e explica que o escopo é do servidor", async () => {
    const onConfirmScoped = vi.fn();
    mockedCount.mockRejectedValue(new Error("permission denied for table task"));
    const user = await abrir(dialog({ task: ocorrencia, onConfirmScoped }));

    expect(await screen.findByText(/Não foi possível contar as ocorrências/)).toBeInTheDocument();
    // Sem número inventado: continua "…".
    const botao = screen.getByRole("button", { name: "Excluir todas as ocorrências (…)" });
    await user.click(botao);

    expect(onConfirmScoped).toHaveBeenCalledWith({ mode: "series" });
  });
});
