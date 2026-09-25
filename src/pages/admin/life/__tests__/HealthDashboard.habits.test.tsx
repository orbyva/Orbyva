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


// O guia do módulo depende do `AuthProvider` e não tem nada a ver com o que este teste afirma.
vi.mock("@/components/ModuleGuide", () => ({
  ModuleGuide: () => null,
  ModuleGuideButton: () => null,
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
  // O atalho "Novo hábito de saúde" grava por `createHabit` — o falso escreve na mesma lista que a
  // seção lê, então o que aparece na tela depois vem mesmo do que foi salvo.
  createHabit: vi.fn(async (draft: Habit) => {
    const created = { ...draft, id: `h${store.habits.length + 1}` };
    store.habits.push(created);
    return created;
  }),
  updateHabit: vi.fn(async (data: { id: string; name?: string; frequency?: Habit["frequency"]; target_per_week?: number }) => {
    const row = store.habits.find((habit) => habit.id === data.id);
    if (row) Object.assign(row, data);
  }),
  deleteHabit: vi.fn(async (id: string) => {
    store.habits = store.habits.filter((habit) => habit.id !== id);
    store.todayLogs.delete(id);
  }),
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

  it("o atalho cria o hábito com is_health e ele já aparece na seção Hoje", async () => {
    const user = userEvent.setup();
    renderPage();

    // Sem hábito nenhum, o CTA está no estado vazio da seção.
    await user.click(
      await screen.findByRole("button", { name: "Novo hábito de saúde" })
    );

    await user.type(await screen.findByLabelText(/Nome do hábito/), "Beber água");
    await user.click(screen.getByRole("button", { name: "Criar hábito" }));

    await waitFor(() => expect(store.habits).toHaveLength(1));
    expect(store.habits[0]!.is_health).toBe(true);
    expect(store.habits[0]!.name).toBe("Beber água");
    expect(store.habits[0]!.frequency).toBe("daily");
    expect(store.habits[0]!.target_per_week).toBe(7);

    // E a tela recarregou sozinha mostrando o hábito recém-criado, pronto pro check-in.
    expect(await screen.findByText("0 de 1 concluídos")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Marcar Beber água como feito hoje" })
    ).toBeInTheDocument();
  });

  it("a sugestão pré-preenche nome e frequência, sem criar nada sozinha", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Novo hábito de saúde" })
    );

    await user.click(await screen.findByRole("button", { name: "Comer frutas" }));

    // Nada foi criado só por clicar na sugestão (decisão: sem seed automático).
    expect(store.habits).toHaveLength(0);
    expect(await screen.findByLabelText(/Nome do hábito/)).toHaveValue("Comer frutas");
    expect(screen.getByLabelText(/Vezes por semana/)).toHaveValue(3);

    await user.click(screen.getByRole("button", { name: "Criar hábito" }));

    await waitFor(() => expect(store.habits).toHaveLength(1));
    expect(store.habits[0]!.name).toBe("Comer frutas");
    expect(store.habits[0]!.frequency).toBe("weekly");
    expect(store.habits[0]!.target_per_week).toBe(3);
    expect(store.habits[0]!.is_health).toBe(true);
  });

  it("com hábitos de saúde, o atalho fica no cabeçalho da seção Hoje", async () => {
    store.habits = [healthHabit({ id: "agua", name: "Beber água" })];
    renderPage();

    await screen.findByText("Beber água");
    expect(screen.queryByText("Nenhum hábito de saúde")).toBeNull();
    expect(
      within(todaySection()).getByRole("button", { name: "Novo hábito de saúde" })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Novo hábito de saúde" })
    ).toHaveLength(1);
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

  it("editar o hábito pelo ícone atualiza o nome na seção Hoje", async () => {
    const user = userEvent.setup();
    store.habits = [healthHabit({ id: "agua", name: "Beber água" })];
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Editar Beber água" }));
    const nameInput = await screen.findByLabelText(/Nome do hábito/);
    await user.clear(nameInput);
    await user.type(nameInput, "Beber 2L de água");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Beber 2L de água")).toBeInTheDocument();
    expect(store.habits[0]!.name).toBe("Beber 2L de água");
  });

  it("excluir o hábito pede confirmação e tira a linha da seção", async () => {
    const user = userEvent.setup();
    store.habits = [healthHabit({ id: "agua", name: "Beber água" })];
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Excluir Beber água" }));
    await user.click(screen.getByRole("button", { name: "Excluir" }));

    expect(await screen.findByText("Nenhum hábito de saúde")).toBeInTheDocument();
    expect(store.habits).toHaveLength(0);
  });
});
