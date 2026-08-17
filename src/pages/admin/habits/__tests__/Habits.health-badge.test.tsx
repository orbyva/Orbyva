import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Habits from "@/pages/admin/habits/Habits";
import type { Habit, HabitLog } from "@/types/habits";

/**
 * Badge de saúde na página de Hábitos (feature 062): o hábito com `is_health` aparece nos dois
 * lugares (Hábitos e Vida > Saúde), e sem uma marca visual o usuário não entende por quê. O teste
 * prova que a marca sai só nos hábitos de saúde — nas duas visões da página — e que o hábito comum
 * continua sem nada.
 */

const { store } = vi.hoisted(() => ({
  store: { habits: [] as Habit[], logs: [] as HabitLog[] },
}));

vi.mock("@/api/habits", () => ({
  fetchHabitsWithLogs: vi.fn(async () => ({
    habits: store.habits,
    logs: store.logs,
  })),
  toggleHabitLog: vi.fn(async () => undefined),
  createHabit: vi.fn(async () => store.habits[0]!),
  updateHabit: vi.fn(async () => undefined),
  deleteHabit: vi.fn(async () => undefined),
}));

vi.mock("@/api/goals", () => ({ fetchGoals: vi.fn(async () => []) }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

function habit(over: Partial<Habit> & { id: string; name: string }): Habit {
  return {
    frequency: "daily",
    target_per_week: 7,
    kind: "build",
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/habits"]}>
      <Habits />
    </MemoryRouter>
  );
}

/** Cartão do hábito: o `article` que contém o título. */
function cardOf(name: string) {
  return screen.getByText(name).closest("article")!;
}

beforeEach(() => {
  vi.clearAllMocks();
  store.habits = [
    habit({ id: "agua", name: "Beber água", is_health: true }),
    habit({ id: "leitura", name: "Ler 20 páginas" }),
    habit({ id: "delivery", name: "Sem delivery", kind: "avoid", frequency: "weekly", target_per_week: 5 }),
  ];
  store.logs = [];
});

describe("Hábitos — badge de saúde", () => {
  it("marca só o hábito de saúde na visão Hoje", async () => {
    renderPage();

    await screen.findByText("Beber água");

    expect(within(cardOf("Beber água")).getByText("Saúde")).toBeInTheDocument();
    expect(within(cardOf("Ler 20 páginas")).queryByText("Saúde")).toBeNull();
    expect(screen.getAllByText("Saúde")).toHaveLength(1);
  });

  it("o badge explica, pelo title, por que o hábito aparece nos dois lugares", async () => {
    renderPage();

    await screen.findByText("Beber água");

    expect(within(cardOf("Beber água")).getByText("Saúde")).toHaveAttribute(
      "title",
      "Hábito de saúde — aparece também em Vida > Saúde"
    );
  });

  it("badge de saúde e de anti-hábito convivem sem se substituir", async () => {
    store.habits = [
      habit({
        id: "sem-refri",
        name: "Sem refrigerante",
        kind: "avoid",
        is_health: true,
      }),
    ];
    renderPage();

    await screen.findByText("Sem refrigerante");

    const card = within(cardOf("Sem refrigerante"));
    expect(card.getByText("Anti-hábito")).toBeInTheDocument();
    expect(card.getByText("Saúde")).toBeInTheDocument();
  });

  it("a marca continua na visão Mês", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Beber água");
    await user.click(screen.getByRole("tab", { name: "Mês" }));

    expect(within(cardOf("Beber água")).getByText("Saúde")).toBeInTheDocument();
    expect(within(cardOf("Ler 20 páginas")).queryByText("Saúde")).toBeNull();
  });
});
