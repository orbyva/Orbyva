import { describe, expect, it } from "vitest";
import {
  buildGoalInstallmentDraft,
  clampGoalApplyAmount,
  evaluateGoalAgainstSurplus,
  getFinancialGoalInsight,
  goalApplyPresets,
  goalAporteDescription,
  goalMetaClassName,
  initialGoalInstallmentFields,
  installmentsToCoverRemaining,
  matchesGoalAporte,
  matchesGoalMetaClass,
  maxGoalApplyAmount,
  monthlyAmountForInstallments,
  monthsUntilDeadline,
  pickPrimarySurplusGoal,
  resolveSyncedGoalProgress,
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

describe("goal aporte ledger (legado)", () => {
  it("monta descrição estável", () => {
    expect(goalAporteDescription(" Reserva ")).toBe("Aporte meta: Reserva");
  });

  it("monta descrição Meta - título", () => {
    expect(goalMetaClassName(" Reserva de emergência ")).toBe(
      "Meta - Reserva de emergência"
    );
  });

  it("soma aportes da meta", () => {
    expect(
      sumAporteProgress(
        [
          { description: "Aporte meta: Reserva", value: 500 },
          { description: "Aporte meta: Reserva 2/7", value: 500 },
          {
            description: "livre",
            value: 300,
            class: { name: "Meta - Reserva" },
          },
          {
            description: "Meta - Reserva",
            value: 100,
            class: { name: "Reserva" },
          },
          { description: "Outro", value: 999 },
        ],
        "Reserva"
      )
    ).toBe(1400);
  });

  it("reconhece prefixo e classe Meta (nova e legado)", () => {
    expect(matchesGoalAporte("Aporte meta: Reserva", "Reserva")).toBe(true);
    expect(matchesGoalAporte("Meta - Reserva", "Reserva")).toBe(true);
    expect(matchesGoalAporte("Mercado", "Reserva")).toBe(false);
    expect(matchesGoalMetaClass("Meta - Reserva", "Reserva")).toBe(true);
    expect(matchesGoalMetaClass("Reserva", "Reserva")).toBe(true);
    expect(matchesGoalMetaClass("Outra", "Reserva")).toBe(false);
  });

  it("aceita class como array (embed supabase)", () => {
    expect(
      sumAporteProgress(
        [{ description: "x", value: 40, class: [{ name: "Meta - Reserva" }] }],
        "Reserva"
      )
    ).toBe(40);
  });
});

describe("resolveSyncedGoalProgress", () => {
  it("não zera a meta quando o ledger não tem aportes", () => {
    const r = resolveSyncedGoalProgress(1500, 0, 10000);
    expect(r.foundLedger).toBe(false);
    expect(r.changed).toBe(false);
    expect(r.next).toBe(1500);
  });

  it("aplica a soma do ledger quando encontra aportes", () => {
    const r = resolveSyncedGoalProgress(100, 800, 10000);
    expect(r.foundLedger).toBe(true);
    expect(r.changed).toBe(true);
    expect(r.next).toBe(800);
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
    expect(insight!.monthlyLabel).toMatch(/mês/);
  });

  it("pede prazo quando não há deadline", () => {
    const insight = getFinancialGoalInsight(goal({ deadline: null }));
    expect(insight!.monthlyTarget).toBeNull();
    expect(insight!.monthlyLabel).toMatch(/prazo/i);
  });

  it("ignora metas não financeiras", () => {
    expect(getFinancialGoalInsight(goal({ category: "health" }))).toBeNull();
  });
});

describe("evaluateGoalAgainstSurplus", () => {
  const from = new Date("2026-07-25T12:00:00");
  const g = goal({
    target_value: 7000,
    current_value: 0,
    deadline: "2027-01-25",
  });

  it("comfortable quando o saldo cobre o aporte", () => {
    const fit = evaluateGoalAgainstSurplus(g, 2000, from);
    expect(fit!.status).toBe("comfortable");
    expect(fit!.applyAmount).toBeCloseTo(1000, 5); // 7000/7
    expect(fit!.summary).toMatch(/cabe/);
  });

  it("short quando o saldo é menor que o aporte", () => {
    const fit = evaluateGoalAgainstSurplus(g, 400, from);
    expect(fit!.status).toBe("short");
    expect(fit!.applyAmount).toBe(400);
  });

  it("no_surplus sem saldo positivo", () => {
    const fit = evaluateGoalAgainstSurplus(g, -50, from);
    expect(fit!.status).toBe("no_surplus");
    expect(fit!.applyAmount).toBe(0);
  });

  it("pickPrimarySurplusGoal escolhe a de maior aporte", () => {
    const a = goal({
      id: "a",
      title: "Pequena",
      target_value: 700,
      deadline: "2027-01-25",
    });
    const b = goal({
      id: "b",
      title: "Grande",
      target_value: 7000,
      deadline: "2027-01-25",
    });
    const pick = pickPrimarySurplusGoal([a, b], 5000, from);
    expect(pick?.goal.id).toBe("b");
  });
});

describe("clampGoalApplyAmount / presets", () => {
  it("limita ao saldo e à falta", () => {
    expect(maxGoalApplyAmount(5000, 1200)).toBe(1200);
    expect(maxGoalApplyAmount(800, 1200)).toBe(800);
    expect(clampGoalApplyAmount(9999, 5000, 1200)).toBe(1200);
    expect(clampGoalApplyAmount(50, 5000, 1200)).toBe(50);
    expect(clampGoalApplyAmount(-1, 5000, 1200)).toBe(0);
  });

  it("monta atalhos sem duplicar valores", () => {
    const from = new Date("2026-07-25T12:00:00");
    const fit = evaluateGoalAgainstSurplus(
      goal({
        target_value: 7000,
        current_value: 0,
        deadline: "2027-01-25",
      }),
      2500,
      from
    )!;
    const presets = goalApplyPresets(fit);
    expect(presets.some((p) => p.id === "suggested")).toBe(true);
    expect(presets.some((p) => p.id === "half_surplus")).toBe(true);
    const amounts = presets.map((p) => p.amount);
    expect(new Set(amounts).size).toBe(amounts.length);
  });
});

describe("plano de parcelas sem/com prazo", () => {
  it("calcula parcelas para cobrir a falta", () => {
    expect(installmentsToCoverRemaining(1200, 100)).toBe(12);
    expect(installmentsToCoverRemaining(1000, 300)).toBe(4);
    expect(monthlyAmountForInstallments(1200, 12)).toBe(100);
  });

  it("sugere 12 meses sem prazo", () => {
    const fields = initialGoalInstallmentFields(
      goal({ deadline: null, target_value: 6000, current_value: 0 })
    );
    expect(fields.installments).toBe(12);
    expect(fields.monthlyAmount).toBe(500);
  });

  it("resume se o plano cobre a meta", () => {
    const short = buildGoalInstallmentDraft(1000, 200, 4);
    expect(short.total).toBe(800);
    expect(short.coversGoal).toBe(false);

    const full = buildGoalInstallmentDraft(1000, 250, 4);
    expect(full.total).toBe(1000);
    expect(full.coversGoal).toBe(true);
  });
});
