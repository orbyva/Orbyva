import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HealthDashboard from "@/pages/admin/life/HealthDashboard";
import type { ReminderEntityType, ReminderPreference } from "@/types/health";

/**
 * Disparo local do lembrete (feature 063) na carga do Health Dashboard. Substitui a verificação
 * manual no navegador (proibida pela skill `next`): lembrete com horário já passado dispara toast +
 * notificação do navegador **uma vez só** — a segunda carga não repete, porque `last_notified_at`
 * foi gravado; lembrete desligado ou ainda sem horário não dispara nada.
 */

const { store } = vi.hoisted(() => ({
  store: {
    preferences: [] as ReminderPreference[],
    notified: [] as { entityType: string; when: string }[],
  },
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
  upsertReminderPreference: vi.fn(),
  markReminderNotified: vi.fn(async (entityType: ReminderEntityType, when: Date) => {
    store.notified.push({ entityType, when: when.toISOString() });
    const pref = store.preferences.find((item) => item.entity_type === entityType)!;
    pref.last_notified_at = when.toISOString();
    return pref;
  }),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn(() => true) }));
vi.mock("@/lib/browserNotify", () => ({
  sendBrowserNotification: notifyMock,
  requestBrowserNotifyPermission: vi.fn(async () => "granted"),
}));

function pref(over: Partial<ReminderPreference> = {}): ReminderPreference {
  return {
    id: "p1",
    entity_type: "water",
    frequency: "daily",
    time_of_day: "09:00",
    enabled: true,
    last_notified_at: null,
    created_at: new Date(2026, 7, 10, 9, 0).toISOString(),
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/life/health"]}>
      <HealthDashboard />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // 17/08/2026 às 14h — o lembrete das 9h já passou.
  vi.setSystemTime(new Date(2026, 7, 17, 14, 0, 0));
  store.preferences = [];
  store.notified = [];
});

describe("Health Dashboard — disparo local do lembrete", () => {
  it("lembrete vencido dispara toast e notificação do navegador, e grava last_notified_at", async () => {
    store.preferences = [pref()];

    renderPage();

    await waitFor(() => expect(store.notified).toHaveLength(1));
    expect(store.notified[0]!.entityType).toBe("water");

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Água", description: "Lembrar de beber água" })
    );
    expect(notifyMock).toHaveBeenCalledWith("Água", {
      body: "Lembrar de beber água",
      tag: "orbyva-reminder-water",
    });
  });

  it("não repete na segunda carga: last_notified_at cobre o período", async () => {
    store.preferences = [pref()];

    const first = renderPage();
    await waitFor(() => expect(store.notified).toHaveLength(1));
    first.unmount();

    // Recarregar a página lê a preferência já com last_notified_at gravado.
    renderPage();
    await screen.findByRole("heading", { name: "Progresso", level: 2 });

    await waitFor(() => expect(store.notified).toHaveLength(1));
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it("lembrete desligado não dispara nada", async () => {
    store.preferences = [pref({ enabled: false })];

    renderPage();
    await screen.findByRole("heading", { name: "Progresso", level: 2 });

    expect(store.notified).toHaveLength(0);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("horário ainda não chegou: nada dispara", async () => {
    vi.setSystemTime(new Date(2026, 7, 17, 7, 0, 0));
    store.preferences = [pref()];

    renderPage();
    await screen.findByRole("heading", { name: "Progresso", level: 2 });

    expect(store.notified).toHaveLength(0);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("dois lembretes vencidos disparam um aviso cada, com o tipo certo", async () => {
    store.preferences = [
      pref(),
      pref({ id: "p2", entity_type: "nutrition", time_of_day: "12:00" }),
    ];

    renderPage();

    await waitFor(() => expect(store.notified).toHaveLength(2));
    expect(store.notified.map((item) => item.entityType)).toEqual([
      "water",
      "nutrition",
    ]);
    expect(notifyMock).toHaveBeenCalledWith(
      "Alimentação",
      expect.objectContaining({ tag: "orbyva-reminder-nutrition" })
    );
  });

  it("permissão negada não impede o aviso in-app", async () => {
    notifyMock.mockReturnValueOnce(false);
    store.preferences = [pref()];

    renderPage();

    await waitFor(() => expect(store.notified).toHaveLength(1));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Água" })
    );
  });
});
