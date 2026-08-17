import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HealthDashboard from "@/pages/admin/life/HealthDashboard";
import type { HealthMetric, MetricType } from "@/types/health";

/**
 * Seção "Progresso" do Health Dashboard (feature 063) contra um backend falso em memória. Substitui
 * a verificação manual no navegador (proibida pela skill `next`): estado vazio → card por tipo com
 * valor, data e variação → IMC derivado de peso + altura → IMC ausente quando falta a altura.
 */

const { store } = vi.hoisted(() => ({
  store: { metrics: [] as HealthMetric[] },
}));

vi.mock("@/api/health", () => ({
  loadHealthSummary: vi.fn(async () => ({
    nextMedicationDose: null,
    nextConsultation: null,
    latestMetrics: store.metrics,
    reminderPreferences: [],
  })),
  fetchHealthHabitsToday: vi.fn(async () => []),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

let seq = 0;
function metric(
  metric_type: MetricType,
  value: number,
  recorded_date: string
): HealthMetric {
  seq += 1;
  return { id: `m${seq}`, metric_type, value, recorded_date };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/life/health"]}>
      <HealthDashboard />
    </MemoryRouter>
  );
}

function progressSection() {
  return screen.getByRole("heading", { name: "Progresso", level: 2 }).closest("section")!;
}

beforeEach(() => {
  vi.clearAllMocks();
  store.metrics = [];
});

describe("Health Dashboard — seção Progresso", () => {
  it("sem medição nenhuma, mostra o estado vazio", async () => {
    renderPage();

    expect(await screen.findByText("Nenhuma medição registrada")).toBeInTheDocument();
  });

  it("mostra a última medição de cada tipo com valor, unidade e data", async () => {
    store.metrics = [
      metric("weight", 77.9, "2026-08-16"),
      metric("weight", 78.4, "2026-08-10"),
      metric("waist", 84, "2026-07-01"),
    ];

    renderPage();

    await screen.findByRole("heading", { name: "Progresso", level: 2 });
    const peso = within(progressSection()).getByRole("article", { name: "Peso" });
    expect(within(peso).getByText("77,9 kg")).toBeInTheDocument();
    expect(within(peso).getByText(/16\/08\/2026/)).toBeInTheDocument();

    const cintura = within(progressSection()).getByRole("article", { name: "Cintura" });
    expect(within(cintura).getByText("84 cm")).toBeInTheDocument();

    // Tipo sem medição não vira card.
    expect(
      within(progressSection()).queryByRole("article", { name: "Quadril" })
    ).toBeNull();
  });

  it("mostra a variação em relação à medição anterior do mesmo tipo", async () => {
    store.metrics = [
      metric("weight", 78.4, "2026-08-10"),
      metric("weight", 77.9, "2026-08-16"),
    ];

    renderPage();

    await screen.findByRole("heading", { name: "Progresso", level: 2 });
    const peso = within(progressSection()).getByRole("article", { name: "Peso" });
    expect(within(peso).getByText("−0,5 kg")).toBeInTheDocument();
  });

  it("com uma única medição não inventa variação", async () => {
    store.metrics = [metric("weight", 78.4, "2026-08-16")];

    renderPage();

    await screen.findByRole("heading", { name: "Progresso", level: 2 });
    const peso = within(progressSection()).getByRole("article", { name: "Peso" });
    expect(within(peso).queryByText(/kg$/)).not.toBeNull(); // o valor, sim
    expect(within(peso).queryByText(/^[+−]/)).toBeNull(); // variação, não
  });

  it("calcula o IMC quando há peso e altura, com a faixa", async () => {
    store.metrics = [
      metric("weight", 78.4, "2026-08-16"),
      metric("height", 176, "2026-01-05"),
    ];

    renderPage();

    await screen.findByRole("heading", { name: "Progresso", level: 2 });
    const imc = within(progressSection()).getByRole("article", { name: "IMC" });
    expect(within(imc).getByText("25,3")).toBeInTheDocument();
    expect(within(imc).getByText("Sobrepeso")).toBeInTheDocument();
  });

  it("sem altura registrada, não mostra card de IMC", async () => {
    store.metrics = [metric("weight", 78.4, "2026-08-16")];

    renderPage();

    await screen.findByRole("heading", { name: "Progresso", level: 2 });
    expect(within(progressSection()).queryByRole("article", { name: "IMC" })).toBeNull();
  });
});
