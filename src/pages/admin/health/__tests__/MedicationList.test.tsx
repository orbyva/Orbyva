import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import MedicationList from "@/pages/admin/health/MedicationList";
import {
  createMedicationWithDoses,
  deactivateMedication,
  fetchDosesSince,
  fetchMedications,
} from "@/api/health/medications";
import type { Medication } from "@/types/health";
import type { Task } from "@/types/tasks";

/**
 * Lista de tratamentos (feature 064) contra a API mockada. Substitui a verificação manual no
 * navegador (proibida pela skill `next`): estado vazio → criar → ver posologia, horários e adesão
 * calculada → editar → encerrar.
 */

vi.mock("@/api/health/medications", () => ({
  fetchMedications: vi.fn(),
  fetchDosesSince: vi.fn(),
  deactivateMedication: vi.fn(),
  createMedicationWithDoses: vi.fn(),
  updateMedication: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const mockedFetchMedications = vi.mocked(fetchMedications);
const mockedFetchDoses = vi.mocked(fetchDosesSince);
const mockedDeactivate = vi.mocked(deactivateMedication);
const mockedCreate = vi.mocked(createMedicationWithDoses);

function medication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: "med-1",
    name: "Losartana",
    dose_amount: 2,
    dose_unit: "comprimidos",
    instructions: "em jejum",
    times: ["08:00:00", "20:00:00"],
    interval_days: 1,
    started_on: "2026-08-10",
    ended_on: null,
    active: true,
    ...overrides,
  };
}

function dose(overrides: Partial<Task>): Task {
  return {
    id: `d-${Math.random()}`,
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Losartana 2 comprimidos",
    status: "todo",
    tag_ids: [],
    due_date: "2026-08-15",
    due_time: "08:00",
    dose_time: "08:00",
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    is_medication: true,
    medication_id: "med-1",
    ...overrides,
  } as Task;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 17, 12, 0, 0));
  mockedFetchMedications.mockResolvedValue([]);
  mockedFetchDoses.mockResolvedValue([]);
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/life/health/medications"]}>
      <MedicationList />
    </MemoryRouter>
  );
}

describe("MedicationList", () => {
  it("sem tratamento, mostra o EmptyState com o CTA", async () => {
    renderPage();

    expect(
      await screen.findByText("Nenhuma medicação cadastrada")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova medicação" })).toBeInTheDocument();
  });

  // Reabertura de 2026-08-18: esta tela virou o **único** destino do cadastro (o atalho saiu de
  // `/tasks`), então ela precisa abrir o dialog sozinha nos dois estados — com e sem tratamento.
  it("o CTA do EmptyState abre o dialog de cadastro", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Nenhuma medicação cadastrada");
    await user.click(screen.getByRole("button", { name: "Nova medicação" }));

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Nova medicação", { selector: "h2" })).toBeInTheDocument();
    expect(dialog.getByLabelText(/Nome do remédio/)).toBeInTheDocument();
  });

  it("com tratamento na lista, o botão do cabeçalho abre o mesmo dialog", async () => {
    const user = userEvent.setup();
    mockedFetchMedications.mockResolvedValue([medication()]);
    renderPage();

    await screen.findByRole("listitem", { name: "Losartana" });
    // Sem EmptyState, o CTA é o do cabeçalho — não há dois botões iguais competindo na tela.
    const buttons = screen.getAllByRole("button", { name: "Nova medicação" });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]!);

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Nova medicação", { selector: "h2" })).toBeInTheDocument();
    // Cadastro, não edição: os campos vêm vazios mesmo com um tratamento na lista.
    expect(dialog.getByLabelText(/Nome do remédio/)).toHaveValue("");
  });

  it("mostra posologia, horários e cadência do tratamento", async () => {
    mockedFetchMedications.mockResolvedValue([medication()]);
    renderPage();

    const row = within(await screen.findByRole("listitem", { name: "Losartana" }));
    expect(
      row.getByText("2 comprimidos · 08:00, 20:00 · todos os dias")
    ).toBeInTheDocument();
    expect(row.getByText("em jejum")).toBeInTheDocument();
  });

  it("adesão dos últimos 30 dias sai das doses, não de uma coluna", async () => {
    mockedFetchMedications.mockResolvedValue([medication()]);
    mockedFetchDoses.mockResolvedValue([
      // no horário
      dose({
        due_date: "2026-08-15",
        status: "done",
        completed_at: new Date(2026, 7, 15, 8, 10).toISOString(),
      }),
      // atrasada
      dose({
        due_date: "2026-08-16",
        status: "done",
        completed_at: new Date(2026, 7, 16, 12, 0).toISOString(),
      }),
      // vencida e não tomada
      dose({ due_date: "2026-08-17" }),
      // ainda não vencida — fora da conta
      dose({ due_date: "2026-08-17", due_time: "20:00", dose_time: "20:00" }),
    ]);
    renderPage();

    expect(await screen.findByTestId("adherence-med-1")).toHaveTextContent(
      "Adesão 30 dias: 67% (2 de 3) · 33% no horário"
    );
  });

  it("tratamento sem dose vencida na janela não mostra percentual", async () => {
    mockedFetchMedications.mockResolvedValue([medication()]);
    renderPage();

    expect(
      await screen.findByText("Sem doses vencidas nos últimos 30 dias")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("adherence-med-1")).toBeNull();
  });

  // Reabertura de 2026-08-18: o elo remédio → tarefa tem de aparecer onde o remédio é gerenciado.
  it("mostra a próxima dose com data e horário, e o link para a agenda", async () => {
    mockedFetchMedications.mockResolvedValue([medication()]);
    renderPage();

    const row = within(await screen.findByRole("listitem", { name: "Losartana" }));
    // Agora são 12:00 de 17/08 e o tratamento é 08:00 + 20:00 → a próxima é hoje às 20:00.
    expect(row.getByTestId("next-dose-med-1")).toHaveTextContent(
      "Próxima dose: 17/08/2026 às 20:00"
    );
    expect(
      row.getByRole("link", { name: "Ver doses de Losartana na agenda" })
    ).toHaveAttribute("href", "/tasks/agenda");
  });

  it("passado o último horário do dia, a próxima dose é a de amanhã", async () => {
    vi.setSystemTime(new Date(2026, 7, 17, 21, 0, 0));
    mockedFetchMedications.mockResolvedValue([medication()]);
    renderPage();

    const row = within(await screen.findByRole("listitem", { name: "Losartana" }));
    expect(row.getByTestId("next-dose-med-1")).toHaveTextContent(
      "Próxima dose: 18/08/2026 às 08:00"
    );
  });

  it("tratamento encerrado não anuncia próxima dose, mas mantém o link da agenda", async () => {
    mockedFetchMedications.mockResolvedValue([
      medication({ active: false, ended_on: "2026-08-12" }),
    ]);
    renderPage();

    const row = within(await screen.findByRole("listitem", { name: "Losartana" }));
    expect(row.queryByTestId("next-dose-med-1")).toBeNull();
    // O histórico de doses continua na agenda — o link não some com o encerramento.
    expect(
      row.getByRole("link", { name: "Ver doses de Losartana na agenda" })
    ).toHaveAttribute("href", "/tasks/agenda");
  });

  it("tratamento encerrado aparece com badge e sem ação de encerrar", async () => {
    mockedFetchMedications.mockResolvedValue([
      medication({ active: false, ended_on: "2026-08-12" }),
    ]);
    renderPage();

    const row = within(await screen.findByRole("listitem", { name: "Losartana" }));
    expect(row.getByText("Encerrado")).toBeInTheDocument();
    expect(row.getByText("Término: 12/08/2026")).toBeInTheDocument();
    expect(row.queryByRole("button", { name: "Encerrar" })).toBeNull();
    // Editar continua disponível: encerrado não é apagado.
    expect(row.getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });

  it("encerrar confirma e chama deactivateMedication, recarregando a lista", async () => {
    const user = userEvent.setup();
    mockedFetchMedications.mockResolvedValue([medication()]);
    mockedDeactivate.mockResolvedValue(undefined);
    renderPage();

    const row = within(await screen.findByRole("listitem", { name: "Losartana" }));
    await user.click(row.getByRole("button", { name: "Encerrar" }));
    // O ConfirmDeleteDialog pede confirmação antes — encerrar não é acidental.
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Encerrar",
      })
    );

    await waitFor(() => expect(mockedDeactivate).toHaveBeenCalledWith("med-1"));
    await waitFor(() => expect(mockedFetchMedications).toHaveBeenCalledTimes(2));
  });

  it("Editar abre o dialog em modo edição, com os campos preenchidos", async () => {
    const user = userEvent.setup();
    mockedFetchMedications.mockResolvedValue([medication()]);
    renderPage();

    const row = within(await screen.findByRole("listitem", { name: "Losartana" }));
    await user.click(row.getByRole("button", { name: "Editar" }));

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Editar medicação")).toBeInTheDocument();
    expect(dialog.getByLabelText(/Nome do remédio/)).toHaveValue("Losartana");
    expect(dialog.getByLabelText("Horário 2")).toHaveValue("20:00");
    // Modo edição não cria tratamento novo.
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("falha ao carregar vira toast de erro, sem quebrar a tela", async () => {
    mockedFetchMedications.mockRejectedValue(new Error("Failed to fetch"));
    renderPage();

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      )
    );
    expect(
      screen.getByRole("heading", { name: "Medicações", level: 1 })
    ).toBeInTheDocument();
  });
});
