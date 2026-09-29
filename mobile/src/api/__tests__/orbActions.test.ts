import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/tasks/tasks", () => ({
  createTaskApi: vi.fn(async () => ({ id: "task-1" })),
}));

vi.mock("@/api/finance/budget", () => ({
  createMonthlyBudgetApi: vi.fn(async () => undefined),
  deleteMonthlyBudgetApi: vi.fn(async () => undefined),
  duplicateMonthlyBudgetApi: vi.fn(async () => undefined),
}));

import { createTaskApi } from "@/api/tasks/tasks";
import { createMonthlyBudgetApi } from "@/api/finance/budget";
import { executeOrbProposal } from "@/api/orbActions";

describe("executeOrbProposal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cria tarefa via API mobile", async () => {
    const out = await executeOrbProposal({
      kind: "task",
      label: "Nova tarefa",
      fields: [{ label: "Título", value: "Comprar pão" }],
      payload: { title: "Comprar pão", due_date: null },
    });
    expect(createTaskApi).toHaveBeenCalled();
    expect(out.message).toBe("Tarefa criada.");
  });

  it("cria orçamento via API mobile", async () => {
    const out = await executeOrbProposal({
      kind: "budget",
      label: "Orçamento",
      fields: [],
      payload: {
        type_id: 1,
        class_id: 2,
        budget_month: "2026-09-01",
        planned_value: 500,
      },
    });
    expect(createMonthlyBudgetApi).toHaveBeenCalled();
    expect(out.message).toBe("Orçamento definido.");
  });

  it("recusa payload incompleto de roteiro", async () => {
    await expect(
      executeOrbProposal({
        kind: "trip_day_plan",
        label: "Plano",
        fields: [],
        payload: {
          plan_date: "2026-01-01",
          activities_json: "[]",
        },
      })
    ).rejects.toThrow(/incompleto|inválido/i);
  });
});
