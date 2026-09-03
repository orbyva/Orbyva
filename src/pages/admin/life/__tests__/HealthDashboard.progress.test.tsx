import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import HealthDashboard from "@/pages/admin/life/HealthDashboard";
import type { HealthMetric, HealthMetricCreateRequest, MetricType } from "@/types/health";

/**
 * Seção "Progresso" do Health Dashboard (feature 063) contra um backend falso em memória — o que o
 * diálogo grava é a mesma lista que a seção lê, então o que aparece na tela depois vem mesmo do que
 * foi salvo. Substitui a verificação manual no navegador (proibida pela skill `next`): estado vazio
 * → registrar peso e altura pelo diálogo → card por tipo com valor, data e variação → IMC derivado
 * → erro de gravação virando toast.
 */

const { store } = vi.hoisted(() => ({
  store: {
    metrics: [] as HealthMetric[],
    /** Quando setado, o próximo `recordHealthMetric` estoura — simula falha de rede. */
    failNextRecord: null as Error | null,
  },
}));


// O guia do módulo depende do `AuthProvider` e não tem nada a ver com o que este teste afirma.
vi.mock("@/components/ModuleGuide", () => ({
  ModuleGuide: () => null,
  ModuleGuideButton: () => null,
}));

vi.mock("@/api/health", () => ({
  loadHealthSummary: vi.fn(async () => ({
    nextMedicationDose: null,
    nextConsultation: null,
    latestMetrics: store.metrics,
    reminderPreferences: [],
  })),
  fetchHealthHabitsToday: vi.fn(async () => []),
  recordHealthMetric: vi.fn(async (input: HealthMetricCreateRequest) => {
    if (store.failNextRecord) {
      const error = store.failNextRecord;
      store.failNextRecord = null;
      throw error;
    }
    const created = { id: `m${store.metrics.length + 100}`, ...input };
    store.metrics = [created, ...store.metrics];
    return created;
  }),
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
  store.failNextRecord = null;
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

describe("Health Dashboard — registrar medição", () => {
  it("grava o peso digitado com vírgula e o card aparece com o valor salvo", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Registrar medição" }));

    await user.type(await screen.findByLabelText(/Valor/), "78,4");
    await user.clear(screen.getByLabelText(/Data/));
    await user.type(screen.getByLabelText(/Data/), "2026-08-16");
    await user.click(screen.getByRole("button", { name: "Registrar" }));

    await waitFor(() => expect(store.metrics).toHaveLength(1));
    // Vírgula do teclado brasileiro chegou ao banco como número, não como string quebrada.
    expect(store.metrics[0]!.value).toBe(78.4);
    expect(store.metrics[0]!.metric_type).toBe("weight");
    expect(store.metrics[0]!.recorded_date).toBe("2026-08-16");

    // E a tela recarregou sozinha mostrando a medição recém-gravada.
    const peso = within(progressSection()).getByRole("article", { name: "Peso" });
    expect(within(peso).getByText("78,4 kg")).toBeInTheDocument();
  });

  it("observação vazia não vira string em branco no banco", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Registrar medição" }));
    await user.type(await screen.findByLabelText(/Valor/), "84");
    await user.click(screen.getByRole("button", { name: "Registrar" }));

    await waitFor(() => expect(store.metrics).toHaveLength(1));
    expect(store.metrics[0]!.notes).toBeNull();
  });

  it("não deixa registrar sem valor", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Registrar medição" }));

    expect(await screen.findByRole("button", { name: "Registrar" })).toBeDisabled();
    expect(store.metrics).toHaveLength(0);
  });

  it("falha ao gravar vira toast de erro e nada entra na lista", async () => {
    const user = userEvent.setup();
    store.failNextRecord = new Error("Failed to fetch");
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Registrar medição" }));
    await user.type(await screen.findByLabelText(/Valor/), "78");
    await user.click(screen.getByRole("button", { name: "Registrar" }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      )
    );
    expect(store.metrics).toHaveLength(0);
  });
});
