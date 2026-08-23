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

// O atalho "Lembretes" (063) trouxe `@/api/health` para esta tela — mockado para o teste não
// falar com o Supabase.
vi.mock("@/api/health", () => ({
  fetchReminderPreferences: vi.fn(async () => []),
  upsertReminderPreference: vi.fn(),
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

  // Feature 071: o controle do tratamento (incluindo o alerta) mora na Saúde.
  it("mostra a próxima dose prevista de cada tratamento", async () => {
    mockedFetchMedications.mockResolvedValue([medication()]);
    renderPage();

    // 17/08 às 12:00 — 08:00 já passou, 20:00 ainda não.
    expect(await screen.findByTestId("next-dose-med-1")).toHaveTextContent(
      "Próxima dose: hoje às 20:00"
    );
  });

  it("tratamento encerrado não anuncia próxima dose", async () => {
    mockedFetchMedications.mockResolvedValue([
      medication({ active: false, ended_on: "2026-08-12" }),
    ]);
    renderPage();

    await screen.findByRole("listitem", { name: "Losartana" });
    expect(screen.queryByTestId("next-dose-med-1")).toBeNull();
  });

  it("Lembretes abre o dialog de preferências da 063 direto desta tela", async () => {
    const user = userEvent.setup();
    mockedFetchMedications.mockResolvedValue([medication()]);
    renderPage();

    await screen.findByRole("listitem", { name: "Losartana" });
    await user.click(screen.getByRole("button", { name: "Lembretes" }));

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Lembretes")).toBeInTheDocument();
    expect(dialog.getByText("Medicação")).toBeInTheDocument();
  });

  it("Lembretes existe mesmo sem tratamento cadastrado", async () => {
    renderPage();

    expect(
      await screen.findByRole("button", { name: "Lembretes" })
    ).toBeInTheDocument();
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
