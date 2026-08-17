import { describe, expect, it } from "vitest";
import { getHabitInsights } from "@/domain/habits/insights";
import { getTodayIso } from "@/domain/habits";
import type { Habit, HabitLog } from "@/types/habits";

const habit = (id: string, name: string, over: Partial<Habit> = {}): Habit => ({
  id,
  name,
  description: "",
  frequency: "daily",
  target_per_week: 7,
  color: null,
  created_at: "",
  ...over,
});

/** ISO de `n` dias atrás, no fuso local (é assim que `calculateStreak` conta). */
function daysAgo(n: number): string {
  const d = new Date(`${getTodayIso()}T12:00:00`);
  d.setDate(d.getDate() - n);
  return getTodayIso(d);
}

describe("getHabitInsights", () => {
  it("retorna vazio sem hábitos", () => {
    expect(getHabitInsights([], [])).toEqual([]);
  });

  it("destaca streak e taxa da semana", () => {
    const today = getTodayIso();
    const habits = [habit("1", "Água")];
    const logs: HabitLog[] = [
      { id: "l1", habit_id: "1", date: today, completed: true },
    ];
    const insights = getHabitInsights(habits, logs);
    expect(insights.some((i) => i.id === "best-streak")).toBe(true);
    expect(insights.some((i) => i.id === "today")).toBe(true);
    expect(insights.some((i) => i.id === "week-rate")).toBe(true);
  });
});

/**
 * Feature 062: hábito de saúde é hábito comum com `is_health = true`. Os insights não conhecem a
 * flag — e é exatamente isso que precisa continuar valendo: água e alimentação entram no streak, no
 * "X/N concluídos" e na taxa dos 7 dias junto com o resto, sem tratamento especial nem exclusão.
 */
describe("getHabitInsights — hábitos de saúde no conjunto (feature 062)", () => {
  it("conta o hábito de saúde no streak, no contador do dia e na taxa dos 7 dias", () => {
    const habits = [
      habit("agua", "Beber água", { is_health: true }),
      habit("leitura", "Ler 20 páginas"),
    ];
    // Água: 3 dias seguidos (hoje inclusive). Leitura: nada.
    const logs: HabitLog[] = [0, 1, 2].map((n) => ({
      id: `l${n}`,
      habit_id: "agua",
      date: daysAgo(n),
      completed: true,
    }));

    const insights = getHabitInsights(habits, logs);
    const byId = Object.fromEntries(insights.map((i) => [i.id, i]));

    expect(byId["best-streak"]!.title).toBe("Melhor streak: Beber água");
    expect(byId["best-streak"]!.detail).toBe("3 dias seguidos.");
    expect(byId["today"]!.detail).toBe("1/2 hábitos concluídos.");
    // 3 check-ins de 14 possíveis (2 hábitos × 7 dias) = 21%.
    expect(byId["week-rate"]!.detail).toBe("21% das check-ins possíveis.");
  });

  it("o mesmo conjunto sem a flag produz insights idênticos — is_health não muda o cálculo", () => {
    const logs: HabitLog[] = [
      { id: "l1", habit_id: "agua", date: daysAgo(0), completed: true },
      { id: "l2", habit_id: "agua", date: daysAgo(1), completed: true },
    ];

    const comFlag = getHabitInsights(
      [habit("agua", "Beber água", { is_health: true }), habit("leitura", "Ler")],
      logs
    );
    const semFlag = getHabitInsights(
      [habit("agua", "Beber água"), habit("leitura", "Ler")],
      logs
    );

    expect(comFlag).toEqual(semFlag);
  });

  it("hábito de saúde sem check-in hoje zera o streak e some do 'X/N concluídos'", () => {
    const habits = [habit("agua", "Beber água", { is_health: true })];
    const logs: HabitLog[] = [
      { id: "l1", habit_id: "agua", date: daysAgo(1), completed: true },
      { id: "l2", habit_id: "agua", date: daysAgo(2), completed: true },
    ];

    const insights = getHabitInsights(habits, logs);

    expect(insights.find((i) => i.id === "today")?.detail).toBe(
      "0/1 hábitos concluídos."
    );
    // `calculateStreak` conta a partir de hoje: sem check-in hoje o streak é 0, então não sai
    // "melhor streak" (nem o aviso "em risco", que o código filtra por `streak > 0` — comportamento
    // pré-existente do módulo de Hábitos, registrado nas Notas da 062).
    expect(insights.find((i) => i.id === "best-streak")).toBeUndefined();
    expect(insights.find((i) => i.id === "at-risk")).toBeUndefined();
  });

  it("hábito de saúde semanal (comer frutas 3×) não é tratado diferente do diário", () => {
    const habits = [
      habit("frutas", "Comer frutas", {
        is_health: true,
        frequency: "weekly",
        target_per_week: 3,
      }),
    ];
    const logs: HabitLog[] = [
      { id: "l1", habit_id: "frutas", date: daysAgo(0), completed: true },
    ];

    const insights = getHabitInsights(habits, logs);

    expect(insights.find((i) => i.id === "today")?.detail).toBe(
      "1/1 hábitos concluídos."
    );
    expect(insights.find((i) => i.id === "best-streak")?.detail).toBe(
      "1 dia seguidos."
    );
  });
});
