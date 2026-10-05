import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRecurringApi, updateRecurringApi } from "@/api/recurring";
import type { RecurringCreateRequest } from "@/types/recurring";

/**
 * `link_url` atravessando a camada de I/O (feature 206), contra um Supabase falso que guarda o que
 * chegou em `insert`/`update`. Sem navegador e sem banco, é esta a prova de que:
 *
 * - `updateRecurringApi` tem `link_url` na lista branca do payload (sem isso, link gravado nunca
 *   mudaria depois);
 * - e manda `link_url: null` quando o usuário apagou — chave presente com `null`, não chave
 *   omitida, que deixaria o link antigo no banco para sempre;
 * - `createRecurringApi` leva o campo na linha do `insert`;
 * - e a string de `.select(...)` realmente enviada ao PostgREST (`RECURRING_SELECT`) pede a
 *   coluna, ou seja a leitura traz o link para a lista.
 */

const { store } = vi.hoisted(() => ({
  store: {
    inserted: [] as Record<string, unknown>[],
    updated: [] as Record<string, unknown>[],
    /** Strings passadas para `.select(...)` — o artefato da última assertiva. */
    selects: [] as string[],
  },
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@/lib/supabase", () => {
  function from(table: string) {
    if (table !== "recurring_transaction") {
      throw new Error(`tabela inesperada: ${table}`);
    }
    const builder = {
      insert: (rows: Record<string, unknown>[]) => {
        store.inserted.push(...rows);
        return builder;
      },
      update: (payload: Record<string, unknown>) => {
        store.updated.push(payload);
        return builder;
      },
      select: (columns: string) => {
        store.selects.push(columns);
        return builder;
      },
      single: () =>
        Promise.resolve({
          data: { id: "rec-1", ...store.inserted.at(-1) },
          error: null,
        }),
      // `update(...).eq(...).eq(...)` é awaitado direto: o segundo `eq` resolve.
      eq: (() => {
        let calls = 0;
        return () => {
          calls += 1;
          if (calls % 2 === 0) return Promise.resolve({ error: null });
          return builder;
        };
      })(),
    };
    return builder;
  }
  return { supabase: { from } };
});

function request(
  overrides: Partial<RecurringCreateRequest> = {}
): RecurringCreateRequest {
  return {
    class_id: 7,
    value: 189.9,
    description: "Luz",
    frequency: "Mensal",
    validity: null,
    due_day: 10,
    installment_count: 12,
    payment_start_date: "2026-10-05",
    status: true,
    link_url: null,
    ...overrides,
  };
}

beforeEach(() => {
  store.inserted = [];
  store.updated = [];
  store.selects = [];
});

describe("updateRecurringApi — link_url na lista branca", () => {
  it("manda o link no payload do update", async () => {
    await updateRecurringApi(
      "rec-1",
      request({ link_url: "https://www.enel.com.br/pagar" })
    );

    expect(store.updated).toHaveLength(1);
    expect(store.updated[0]).toMatchObject({
      description: "Luz",
      link_url: "https://www.enel.com.br/pagar",
    });
  });

  it("manda link_url: null quando o campo foi apagado (chave presente, não omitida)", async () => {
    await updateRecurringApi("rec-1", request({ link_url: null }));

    expect(store.updated).toHaveLength(1);
    expect("link_url" in store.updated[0]).toBe(true);
    expect(store.updated[0].link_url).toBeNull();
  });
});

describe("createRecurringApi — link_url no insert", () => {
  it("leva o link na linha inserida", async () => {
    await createRecurringApi(
      request({ link_url: "https://nubank.com.br/pagar" })
    );

    expect(store.inserted).toHaveLength(1);
    expect(store.inserted[0]).toMatchObject({
      user_id: "user-1",
      link_url: "https://nubank.com.br/pagar",
    });
  });
});

describe("RECURRING_SELECT", () => {
  it("pede link_url na string realmente enviada, então a leitura traz a coluna", async () => {
    await createRecurringApi(request());

    // `insert(...).select(RECURRING_SELECT)` — a assertiva é sobre a string que saiu da chamada,
    // não sobre uma constante reexportada só para o teste.
    expect(store.selects).toHaveLength(1);
    expect(store.selects[0]).toContain("link_url");
    expect(store.selects[0]).toContain("paid_parcels");
  });
});
