import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import HealthDashboard from "@/pages/admin/life/HealthDashboard";
import type { Habit } from "@/types/habits";

/**
 * Seção "Hoje" do Health Dashboard (feature 062) contra um backend falso em memória: `habit` e
 * `habit_log` são listas, e o check-in do dashboard escreve na mesma lista que a leitura consulta —
 * então o que a tela mostra depois vem mesmo do que foi gravado. Substitui a verificação manual no
 * navegador (proibida pela skill `next`): lista vazia → hábitos de saúde com contador → marcar e
 * desmarcar o check-in → erro virando toast sem perder o estado.
 */

const { store } = vi.hoisted(() => ({
  store: {
    habits: [] as Habit[],
    /** `habit_log` de hoje: habit_id → completed. */
    todayLogs: new Map<string, boolean>(),
    /** Quando setado, o próximo `toggleHabitLog` estoura — simula falha de rede. */
    failNextToggle: null as Error | null,
    toggles: [] as { habitId: string; date: string; completed: boolean }[],
  },
}));

vi.mock("@/api/health", () => ({
  loadHealthSummary: vi.fn(async () => ({
    nextMedicationDose: null,
    nextConsultation: null,
  })),
  fetchHealthHabitsToday: vi.fn(async () =>
    store.habits
      .filter((habit) => habit.is_health)
      .map((habit) => ({
        habit,
        doneToday: store.todayLogs.get(habit.id) === true,
      }))
  ),
}));

vi.mock("@/api/habits", () => ({
  toggleHabitLog: vi.fn(async (habitId: string, date: string, completed: boolean) => {
    if (store.failNextToggle) {
      const error = store.failNextToggle;
      store.failNextToggle = null;
      throw error;
    }
    store.toggles.push({ habitId, date, completed });
    store.todayLogs.set(habitId, completed);
  }),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

function healthHabit(over: Partial<Habit> & { id: string; name: string }): Habit {
  return {
    frequency: "daily",
    target_per_week: 7,
    kind: "build",
    is_health: true,
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

function todaySection() {
  return screen.getByRole("heading", { name: "Hoje", level: 2 }).closest("section")!;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 16, 9, 0, 0));
  store.habits = [];
  store.todayLogs = new Map();
  store.failNextToggle = null;
  store.toggles = [];
});

describe("Health Dashboard — hábitos de água e alimentação", () => {
  it("sem hábito de saúde, a seção Hoje mostra o estado vazio e nenhum contador", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Hoje", level: 2 })
    ).toBeInTheDocument();
    expect(await screen.findByText("Nenhum hábito de saúde")).toBeInTheDocument();
    expect(screen.queryByText(/concluídos/)).toBeNull();
  });

  it("lista os hábitos de saúde com a frequência e o contador X de N", async () => {
    store.habits = [
      healthHabit({ id: "agua", name: "Beber água" }),
      healthHabit({
        id: "frutas",
        name: "Comer frutas",
        frequency: "weekly",
        target_per_week: 3,
      }),
    ];
    store.todayLogs.set("agua", true);

    renderPage();

    await screen.findByText("Beber água");
    const section = within(todaySection());
    expect(section.getByText("Beber água")).toBeInTheDocument();
    expect(section.getByText("Comer frutas")).toBeInTheDocument();
    expect(section.getByText("Todo dia")).toBeInTheDocument();
    expect(section.getByText("3× por semana")).toBeInTheDocument();
    expect(section.getByText("1 de 2 concluídos")).toBeInTheDocument();
  });

  it("marcar o check-in grava o habit_log de hoje e o contador sobe sem recarregar a página", async () => {
    const user = userEvent.setup();
    store.habits = [
      healthHabit({ id: "agua", name: "Beber água" }),
      healthHabit({ id: "frutas", name: "Comer frutas" }),
    ];

    renderPage();

    expect(await screen.findByText("0 de 2 concluídos")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Marcar Beber água como feito hoje" })
    );

    // Gravou no habit_log do dia local (não UTC), como um check-in da página de Hábitos.
    await waitFor(() => expect(store.toggles).toHaveLength(1));
    expect(store.toggles[0]).toEqual({
      habitId: "agua",
      date: "2026-08-16",
      completed: true,
    });

    // E a tela reagiu na hora, sem refetch.
    expect(await screen.findByText("1 de 2 concluídos")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Desmarcar Beber água de hoje" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("desmarcar o check-in volta o contador e grava completed = false", async () => {
    const user = userEvent.setup();
    store.habits = [healthHabit({ id: "agua", name: "Beber água" })];
    store.todayLogs.set("agua", true);

    renderPage();

    expect(await screen.findByText("1 de 1 concluídos")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Desmarcar Beber água de hoje" })
    );

    await waitFor(() => expect(store.toggles).toHaveLength(1));
    expect(store.toggles[0]!.completed).toBe(false);
    expect(await screen.findByText("0 de 1 concluídos")).toBeInTheDocument();
  });

  it("falha ao gravar o check-in vira toast e desfaz a marcação otimista", async () => {
    const user = userEvent.setup();
    store.habits = [healthHabit({ id: "agua", name: "Beber água" })];
    store.failNextToggle = new Error("Failed to fetch");

    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Marcar Beber água como feito hoje" })
    );

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Erro", variant: "destructive" })
      )
    );
    expect(await screen.findByText("0 de 1 concluídos")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Marcar Beber água como feito hoje" })
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("hábito comum (sem is_health) não aparece na seção Hoje", async () => {
    store.habits = [
      healthHabit({ id: "agua", name: "Beber água" }),
      healthHabit({ id: "leitura", name: "Ler 20 páginas", is_health: false }),
    ];

    renderPage();

    expect(await screen.findByText("Beber água")).toBeInTheDocument();
    expect(screen.queryByText("Ler 20 páginas")).toBeNull();
    expect(screen.getByText("0 de 1 concluídos")).toBeInTheDocument();
  });
});
