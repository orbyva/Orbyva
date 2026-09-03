import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import HealthDashboard from "@/pages/admin/life/HealthDashboard";
import type { ReminderEntityType, ReminderPreference } from "@/types/health";

/**
 * Controle de notificações (feature 063) contra um backend falso em memória: o upsert do diálogo
 * escreve na mesma lista que o dashboard lê, então o estado que a tela mostra depois vem mesmo do
 * que foi salvo. Substitui a verificação manual no navegador (proibida pela skill `next`): abrir o
 * diálogo → ligar o lembrete de água → conferir que gravou uma linha por `entity_type` → mudar
 * frequência e horário → ver o "Próximo" recalculado → erro virando toast sem perder o estado.
 */

const { store } = vi.hoisted(() => ({
  store: {
    preferences: [] as ReminderPreference[],
    upserts: [] as { entityType: string; patch: Record<string, unknown> }[],
    failNextUpsert: null as Error | null,
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
    latestMetrics: [],
    reminderPreferences: store.preferences,
  })),
  fetchHealthHabitsToday: vi.fn(async () => []),
  recordHealthMetric: vi.fn(),
  markReminderNotified: vi.fn(async () => undefined),
  upsertReminderPreference: vi.fn(
    async (entityType: ReminderEntityType, patch: Record<string, unknown>) => {
      if (store.failNextUpsert) {
        const error = store.failNextUpsert;
        store.failNextUpsert = null;
        throw error;
      }
      store.upserts.push({ entityType, patch });
      const existing = store.preferences.find(
        (pref) => pref.entity_type === entityType
      );
      if (existing) {
        Object.assign(existing, patch);
        return existing;
      }
      const created = {
        id: `p${store.preferences.length + 1}`,
        entity_type: entityType,
        frequency: "daily",
        time_of_day: "09:00",
        enabled: true,
        last_notified_at: null,
        created_at: new Date(2026, 7, 17, 8, 0).toISOString(),
        ...patch,
      } as ReminderPreference;
      store.preferences = [...store.preferences, created];
      return created;
    }
  ),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/life/health"]}>
      <HealthDashboard />
    </MemoryRouter>
  );
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Lembretes" }));
  await screen.findByRole("dialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // 17/08/2026 é uma segunda-feira, 08:00 — antes do horário padrão dos lembretes (09:00).
  vi.setSystemTime(new Date(2026, 7, 17, 8, 0, 0));
  store.preferences = [];
  store.upserts = [];
  store.failNextUpsert = null;
});

describe("Health Dashboard — controle de notificações", () => {
  it("lista um switch por tipo de lembrete, todos desligados sem preferência salva", async () => {
    const user = userEvent.setup();
    renderPage();
    await openDialog(user);

    for (const label of [
      "Água",
      "Alimentação",
      "Medicação",
      "Consultas",
      "Medidas do corpo",
    ]) {
      expect(screen.getByRole("switch", { name: label })).toHaveAttribute(
        "aria-checked",
        "false"
      );
    }
  });

  it("deixa claro que o lembrete só chega com o app aberto", async () => {
    const user = userEvent.setup();
    renderPage();
    await openDialog(user);

    expect(
      screen.getByText(/enquanto o Orbyva estiver aberto/i)
    ).toBeInTheDocument();
  });

  it("ligar a água grava a preferência e mostra o próximo horário", async () => {
    const user = userEvent.setup();
    renderPage();
    await openDialog(user);

    await user.click(screen.getByRole("switch", { name: "Água" }));

    await waitFor(() => expect(store.upserts).toHaveLength(1));
    expect(store.upserts[0]).toEqual({
      entityType: "water",
      patch: { frequency: "daily", time_of_day: "09:00", enabled: true },
    });
    // Só a água virou linha — a preferência é por entity_type, não um registro global.
    expect(store.preferences).toHaveLength(1);

    expect(
      await screen.findByRole("switch", { name: "Água" })
    ).toHaveAttribute("aria-checked", "true");
    // São 8h, o lembrete é às 9h de hoje.
    expect(screen.getByText("Próximo: 17/08/2026 09:00")).toBeInTheDocument();
  });

  it("desligar volta a gravar a mesma linha com enabled false", async () => {
    store.preferences = [
      {
        id: "p1",
        entity_type: "water",
        frequency: "daily",
        time_of_day: "09:00",
        enabled: true,
        last_notified_at: null,
        created_at: new Date(2026, 7, 10, 9, 0).toISOString(),
      },
    ];
    const user = userEvent.setup();
    renderPage();
    await openDialog(user);

    await user.click(screen.getByRole("switch", { name: "Água" }));

    await waitFor(() => expect(store.upserts).toHaveLength(1));
    expect(store.upserts[0]!.patch.enabled).toBe(false);
    expect(store.preferences).toHaveLength(1);
  });

  it("mudar a frequência para semanal recalcula o próximo lembrete", async () => {
    store.preferences = [
      {
        id: "p1",
        entity_type: "water",
        frequency: "daily",
        time_of_day: "09:00",
        enabled: true,
        last_notified_at: null,
        // Criada numa segunda-feira: a cadência semanal cai nas segundas.
        created_at: new Date(2026, 7, 10, 9, 0).toISOString(),
      },
    ];
    const user = userEvent.setup();
    renderPage();
    await openDialog(user);

    await user.click(
      screen.getByRole("combobox", { name: "Frequência de Água" })
    );
    await user.click(await screen.findByRole("option", { name: "Toda semana" }));

    await waitFor(() => expect(store.upserts).toHaveLength(1));
    expect(store.upserts[0]!.patch.frequency).toBe("weekly");
    // Hoje é segunda 17/08 às 8h — o slot semanal é hoje às 9h.
    expect(
      await screen.findByText("Próximo: 17/08/2026 09:00")
    ).toBeInTheDocument();
  });

  it("mudar o horário salva ao sair do campo e o próximo horário acompanha", async () => {
    store.preferences = [
      {
        id: "p1",
        entity_type: "water",
        frequency: "daily",
        time_of_day: "09:00",
        enabled: true,
        last_notified_at: null,
        created_at: new Date(2026, 7, 10, 9, 0).toISOString(),
      },
    ];
    const user = userEvent.setup();
    renderPage();
    await openDialog(user);

    const time = screen.getByLabelText("Horário de Água");
    await user.clear(time);
    await user.type(time, "20:30");
    await user.tab();

    await waitFor(() => expect(store.upserts).toHaveLength(1));
    expect(store.upserts[0]!.patch.time_of_day).toBe("20:30");
    expect(
      await screen.findByText("Próximo: 17/08/2026 20:30")
    ).toBeInTheDocument();
  });

  it("falha ao salvar vira toast e o switch volta ao estado anterior", async () => {
    store.failNextUpsert = new Error("Failed to fetch");
    const user = userEvent.setup();
    renderPage();
    await openDialog(user);

    await user.click(screen.getByRole("switch", { name: "Água" }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      )
    );
    expect(screen.getByRole("switch", { name: "Água" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
    expect(store.preferences).toHaveLength(0);
  });
});
