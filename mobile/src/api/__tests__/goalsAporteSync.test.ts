import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const { db } = vi.hoisted(() => ({
  db: {
    goals: [] as Row[],
    ledgerSum: 0,
    updates: [] as { id: unknown; current_value: unknown }[],
  },
}));

vi.mock("@/lib/auth-user", () => ({ getCurrentUserId: vi.fn(async () => "me") }));

vi.mock("@/lib/supabase", () => {
  function goalTable() {
    let pendingUpdate: Row | null = null;
    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => builder,
      update: (fields: Row) => ((pendingUpdate = fields), builder),
      eq: (k: string, v: unknown) => {
        if (pendingUpdate && k === "id") {
          db.updates.push({ id: v, current_value: pendingUpdate.current_value });
        }
        return builder;
      },
      then: (resolve: (v: unknown) => void) => resolve({ data: db.goals, error: null }),
    };
    return builder;
  }
  return {
    supabase: {
      from: () => goalTable(),
      rpc: async () => ({ data: db.ledgerSum, error: null }),
    },
  };
});

import { syncGoalsFromAporteDescription } from "@/api/goals/goals";

const goal = (over: Row): Row => ({
  id: "g",
  title: "Viagem",
  category: "financial",
  status: "active",
  current_value: 0,
  target_value: 1000,
  ...over,
});

describe("syncGoalsFromAporteDescription", () => {
  beforeEach(() => {
    db.goals = [];
    db.ledgerSum = 0;
    db.updates = [];
  });

  it("atualiza a meta financeira ativa citada na descrição pelo razão", async () => {
    db.goals = [goal({ id: "viagem" }), goal({ id: "carro", title: "Carro" })];
    db.ledgerSum = 350;
    await syncGoalsFromAporteDescription("Meta - Viagem");
    expect(db.updates).toEqual([{ id: "viagem", current_value: 350 }]);
  });

  it("aceita o prefixo legado e limita ao alvo", async () => {
    db.goals = [goal({ id: "viagem" })];
    db.ledgerSum = 5000;
    await syncGoalsFromAporteDescription("Aporte meta: Viagem (3/10)");
    expect(db.updates).toEqual([{ id: "viagem", current_value: 1000 }]);
  });

  it("ignora meta não financeira ou inativa", async () => {
    db.goals = [
      goal({ id: "pessoal", category: "personal" }),
      goal({ id: "pausada", status: "completed" }),
    ];
    db.ledgerSum = 200;
    await syncGoalsFromAporteDescription("Meta - Viagem");
    expect(db.updates).toEqual([]);
  });

  it("não grava quando o valor não muda", async () => {
    db.goals = [goal({ id: "viagem", current_value: 200 })];
    db.ledgerSum = 200;
    await syncGoalsFromAporteDescription("Meta - Viagem");
    expect(db.updates).toEqual([]);
  });
});
