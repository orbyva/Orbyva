import { describe, expect, it } from "vitest";
import {
  getFinancialGoalInsight,
  goalAporteDescription,
  matchesGoalAporte,
  monthsUntilDeadline,
  sumAporteProgress,
} from "@/domain/goals/finance";
import type { PersonalGoal } from "@/types/goals";

function goal(partial: Partial<PersonalGoal>): PersonalGoal {
  return {
    id: "g1",
    title: "Reserva",
    description: "",
    category: "financial",
    target_value: 12000,
    current_value: 0,
    unit: "R$",
    deadline: "2027-01-25",
    status: "active",
    created_at: "",
    ...partial,
  };
}

describe("monthsUntilDeadline", () => {
  it("retorna null sem prazo", () => {
    expect(monthsUntilDeadline(null)).toBeNull();
  });

  it("conta meses restantes (ceil de 30 dias)", () => {
    const from = new Date("2026-07-25T12:00:00");
    expect(monthsUntilDeadline("2026-10-25", from)).toBe(4);
  });

  it("retorna 0 se o prazo já passou", () => {
    const from = new Date("2026-07-25T12:00:00");
    expect(monthsUntilDeadline("2026-07-01", from)).toBe(0);
  });
});

describe("goal aporte ledger", () => {
  it("monta descrição estável", () => {
    expect(goalAporteDescription(" Reserva ")).toBe("Aporte meta: Reserva");
  });

  it("soma aportes da meta", () => {
    expect(
      sumAporteProgress(
        [
          { description: "Aporte meta: Reserva", value: 500 },
          { description: "Aporte meta: Reserva 2/7", value: 500 },
          { description: "Outro", value: 999 },
        ],
        "Reserva"
      )
    ).toBe(1000);
  });

  it("reconhece prefixo", () => {
    expect(matchesGoalAporte("Aporte meta: Reserva", "Reserva")).toBe(true);
    expect(matchesGoalAporte("Mercado", "Reserva")).toBe(false);
  });
});

describe("getFinancialGoalInsight", () => {
  it("estipula quanto guardar por mês", () => {
    const from = new Date("2026-07-25T12:00:00");
    const insight = getFinancialGoalInsight(
      goal({ target_value: 12000, current_value: 0, deadline: "2027-01-25" }),
      from
    );
    expect(insight).not.toBeNull();
    expect(insight!.monthsRemaining).toBe(7);
    expect(insight!.monthlyTarget).toBeCloseTo(12000 / 7, 5);
    expect(insight!.monthlyLabel).toMatch(/Guarde/);
    expect(insight!.monthlyLabel).toMatch(/\/mês/);
  });

  it("pede prazo quando não há deadline", () => {
    const insight = getFinancialGoalInsight(goal({ deadline: null }));
    expect(insight!.monthlyTarget).toBeNull();
    expect(insight!.monthlyLabel).toMatch(/Defina um prazo/);
  });

  it("ignora metas não financeiras", () => {
    expect(getFinancialGoalInsight(goal({ category: "health" }))).toBeNull();
  });
});
