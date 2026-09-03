import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HealthDashboard from "@/pages/admin/life/HealthDashboard";
import type { AdherenceSummary } from "@/domain/health/adherence";
import type { Task } from "@/types/tasks";

/**
 * Seção "Medicações" do Health Dashboard depois da 064: além da próxima dose (060), ela mostra a
 * adesão do período e leva para `/life/health/medications`, onde os tratamentos são geridos.
 */

const { store } = vi.hoisted(() => ({
  store: {
    nextDose: null as Task | null,
    adherence: null as AdherenceSummary | null,
  },
}));


// O guia do módulo depende do `AuthProvider` e não tem nada a ver com o que este teste afirma.
vi.mock("@/components/ModuleGuide", () => ({
  ModuleGuide: () => null,
  ModuleGuideButton: () => null,
}));

vi.mock("@/api/health", () => ({
  fetchHealthHabitsToday: vi.fn(async () => []),
  loadHealthSummary: vi.fn(async () => ({
    nextMedicationDose: store.nextDose,
    nextConsultation: null,
    latestMetrics: [],
    reminderPreferences: [],
    medicationAdherence: store.adherence,
    activeMedicationCount: store.nextDose ? 1 : 0,
  })),
}));

vi.mock("@/api/tasks", () => ({ createTask: vi.fn() }));
vi.mock("@/api/health/medications", () => ({
  createMedicationWithDoses: vi.fn(),
  updateMedication: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

function dose(): Task {
  return {
    id: "t1",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Losartana 2 comprimidos",
    status: "todo",
    tag_ids: [],
    due_date: "2026-08-18",
    due_time: "08:00",
    dose_time: "08:00",
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    is_medication: true,
    medication_id: "med-1",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.nextDose = null;
  store.adherence = null;
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/life/health"]}>
      <HealthDashboard />
    </MemoryRouter>
  );
}

describe("Health Dashboard — seção Medicações (feature 064)", () => {
  it("a seção leva para a lista de tratamentos", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Medicações", level: 2 })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver medicações" })).toHaveAttribute(
      "href",
      "/life/health/medications"
    );
  });

  it("com doses vencidas, mostra a próxima dose e a adesão do período", async () => {
    store.nextDose = dose();
    store.adherence = {
      total: 3,
      taken: 2,
      onTime: 1,
      late: 1,
      missed: 1,
      takenRate: 0.6667,
      onTimeRate: 0.3333,
    };
    renderPage();

    expect(await screen.findByText("Losartana 2 comprimidos")).toBeInTheDocument();
    expect(screen.getByText("18/08/2026 08:00")).toBeInTheDocument();
    expect(screen.getByTestId("health-adherence")).toHaveTextContent(
      "Adesão 30 dias: 67% (2 de 3) · 33% no horário"
    );
  });

  it("tratamento recém-criado (nenhuma dose vencida) não exibe adesão — 0% seria acusação falsa", async () => {
    store.nextDose = dose();
    store.adherence = {
      total: 0,
      taken: 0,
      onTime: 0,
      late: 0,
      missed: 0,
      takenRate: 0,
      onTimeRate: 0,
    };
    renderPage();

    expect(await screen.findByText("Losartana 2 comprimidos")).toBeInTheDocument();
    expect(screen.queryByTestId("health-adherence")).toBeNull();
  });
});
