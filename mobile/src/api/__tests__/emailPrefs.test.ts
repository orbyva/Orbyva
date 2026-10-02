import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({
  store: {
    rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
    rpcResponse: { data: null as unknown, error: null as { message: string } | null },
    selectRow: null as Record<string, unknown> | null,
  },
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      store.rpcCalls.push({ fn, args });
      return store.rpcResponse;
    }),
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: store.selectRow, error: null }),
        }),
      }),
      update: () => {
        throw new Error("update direto em profiles não deveria acontecer");
      },
    })),
  },
}));

import { applyEmailPrefsPatch, fetchEmailPrefs, updateEmailPrefs } from "@/api/emailPrefs";

const saved = (over: Record<string, unknown> = {}) => [
  {
    email_digest_enabled: true,
    email_alerts_enabled: false,
    email_habit_reminder_enabled: false,
    email_unsubscribed_at: null,
    ...over,
  },
];

describe("updateEmailPrefs (mobile)", () => {
  beforeEach(() => {
    store.rpcCalls = [];
    store.rpcResponse = { data: saved(), error: null };
  });

  it("chama a RPC só com o campo pedido", async () => {
    store.rpcResponse = { data: saved({ email_habit_reminder_enabled: true }), error: null };
    const out = await updateEmailPrefs({ email_habit_reminder_enabled: true });
    expect(store.rpcCalls).toEqual([
      {
        fn: "update_email_prefs",
        args: { p_digest: null, p_alerts: null, p_habit_reminder: true, p_unsubscribed: null },
      },
    ]);
    expect(out.email_habit_reminder_enabled).toBe(true);
  });

  it("estado divergente vira erro, não sucesso silencioso", async () => {
    await expect(updateEmailPrefs({ email_alerts_enabled: true })).rejects.toThrow(
      /não foi gravada/
    );
  });

  it("propaga erro da RPC", async () => {
    store.rpcResponse = { data: null, error: { message: "boom" } };
    await expect(updateEmailPrefs({ unsubscribed: true })).rejects.toThrow("boom");
  });
});

describe("fetchEmailPrefs (mobile)", () => {
  it("aplica os defaults das colunas (digest ligado, demais desligados)", async () => {
    store.selectRow = {};
    expect(await fetchEmailPrefs()).toEqual({
      email_digest_enabled: true,
      email_alerts_enabled: false,
      email_habit_reminder_enabled: false,
      email_unsubscribed_at: null,
    });
  });
});

describe("applyEmailPrefsPatch (mobile)", () => {
  it("pausar e retomar", () => {
    const base = saved()[0];
    const paused = applyEmailPrefsPatch(base, { unsubscribed: true });
    expect(paused.email_unsubscribed_at).toEqual(expect.any(String));
    expect(applyEmailPrefsPatch(paused, { unsubscribed: false }).email_unsubscribed_at).toBeNull();
  });
});
