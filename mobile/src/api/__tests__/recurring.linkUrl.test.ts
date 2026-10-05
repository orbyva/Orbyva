import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { table: string; op: string; payload?: unknown; columns?: string };

const { calls } = vi.hoisted(() => ({ calls: [] as Call[] }));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@/lib/supabase", () => {
  function chain(result: unknown) {
    const builder: Record<string, unknown> = {
      eq: () => builder,
      order: () => builder,
      select: (columns: string) => {
        calls.at(-1)!.columns = columns;
        return builder;
      },
      single: async () => result,
      maybeSingle: async () => result,
      then: (resolve: (value: unknown) => void) => resolve(result),
    };
    return builder;
  }
  const row = {
    id: "rec-1",
    value: 50,
    description: "Internet",
    due_day: 10,
    installment_count: 3,
    payment_start_date: "2026-10-01",
    validity: "2026-12-31",
    frequency: "Mensal",
    paid_parcels: [],
    link_url: "https://provedor.com.br",
  };
  return {
    supabase: {
      from: (table: string) => ({
        select: (columns: string) => {
          calls.push({ table, op: "select", columns });
          return chain({ data: [row], error: null });
        },
        insert: (payload: unknown) => {
          calls.push({ table, op: "insert", payload });
          return chain({ data: row, error: null });
        },
        update: (payload: unknown) => {
          calls.push({ table, op: "update", payload });
          return chain({ error: null });
        },
      }),
    },
  };
});

import {
  createRecurringApi,
  fetchRecurringTransactions,
  updateRecurringApi,
} from "@/api/finance/recurring";
import type { RecurringCreateRequest } from "@/types/recurring";

const base: RecurringCreateRequest = {
  class_id: 7,
  value: 50,
  description: "Internet",
  frequency: "Mensal",
  validity: "2026-12-31",
  due_day: 10,
  installment_count: 3,
  payment_start_date: "2026-10-01",
  status: true,
  link_url: "https://provedor.com.br",
};

beforeEach(() => {
  calls.length = 0;
});

describe("link_url nas recorrências (mobile)", () => {
  it("a listagem pede a coluna e devolve o link", async () => {
    const rows = await fetchRecurringTransactions();
    expect(calls[0]!.columns).toContain("link_url");
    expect(rows[0]!.link_url).toBe("https://provedor.com.br");
  });

  it("criar manda o link no insert", async () => {
    await createRecurringApi(base);
    const insert = calls.find((c) => c.op === "insert")!;
    expect(insert.payload).toEqual([expect.objectContaining({ link_url: "https://provedor.com.br" })]);
    expect(insert.columns).toContain("link_url");
  });

  it("editar manda o link novo", async () => {
    await updateRecurringApi("rec-1", { ...base, link_url: "https://outro.com" });
    const update = calls.find((c) => c.op === "update")!;
    expect(update.payload).toMatchObject({ link_url: "https://outro.com" });
  });

  it("apagar o link manda null explícito, não omite o campo", async () => {
    await updateRecurringApi("rec-1", { ...base, link_url: null });
    const update = calls.find((c) => c.op === "update")!;
    expect(update.payload).toHaveProperty("link_url", null);
  });
});
