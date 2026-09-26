import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ProgressList from "@/pages/admin/health/ProgressList";
import { deleteHealthMetric, fetchHealthMetrics } from "@/api/health";
import type { HealthMetric, MetricType } from "@/types/health";

/**
 * Histórico de medições (hub de Saúde). Substitui a verificação no navegador: vazia → registrar →
 * série por tipo com variação → excluir.
 */

vi.mock("@/components/ModuleGuide", () => ({
  ModuleGuide: () => null,
  ModuleGuideButton: () => null,
}));

vi.mock("@/api/health", () => ({
  fetchHealthMetrics: vi.fn(),
  deleteHealthMetric: vi.fn(),
  recordHealthMetric: vi.fn(),
  updateHealthMetric: vi.fn(),
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
    <MemoryRouter initialEntries={["/life/health/progress"]}>
      <ProgressList />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  vi.mocked(fetchHealthMetrics).mockResolvedValue([]);
  vi.mocked(deleteHealthMetric).mockResolvedValue(undefined);
});

describe("ProgressList", () => {
  it("sem medição, mostra o estado vazio com o CTA", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Progresso", level: 1 })
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhuma medição registrada")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Registrar medição" })
    ).toBeInTheDocument();
  });

  it("lista o histórico de cada tipo, da mais nova para a mais antiga, com a variação", async () => {
    vi.mocked(fetchHealthMetrics).mockResolvedValue([
      metric("weight", 88.5, "2026-08-16"),
      metric("weight", 90, "2026-08-01"),
      metric("height", 176, "2026-01-05"),
    ]);
    renderPage();

    expect(await screen.findByRole("heading", { name: "Peso" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Altura" })).toBeInTheDocument();
    expect(screen.getByText("IMC atual")).toBeInTheDocument();

    const peso = screen.getByRole("heading", { name: "Peso" }).parentElement!;
    expect(within(peso).getByText("88,5 kg")).toBeInTheDocument();
    expect(within(peso).getByText("90 kg")).toBeInTheDocument();
    expect(within(peso).getByText("−1,5 kg")).toBeInTheDocument();
  });

  it("excluir pede confirmação e some a medição", async () => {
    const user = userEvent.setup();
    const weight = metric("weight", 90, "2026-08-16");
    vi.mocked(fetchHealthMetrics)
      .mockResolvedValueOnce([weight])
      .mockResolvedValueOnce([]);
    renderPage();

    await user.click(
      within(
        await screen.findByRole("listitem", { name: /Peso em / })
      ).getByRole("button", { name: "Excluir" })
    );
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Excluir",
      })
    );

    await waitFor(() => expect(deleteHealthMetric).toHaveBeenCalledWith(weight.id));
    expect(await screen.findByText("Nenhuma medição registrada")).toBeInTheDocument();
  });
});
