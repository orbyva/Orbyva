import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyEmailPrefsPatch, updateEmailPrefs } from "@/api/billing";

/**
 * Feature 191 — `profiles` não tem policy de UPDATE para `authenticated`; o update direto casava
 * zero linhas com `error: null`. A escrita passa pela RPC `update_email_prefs`, e o cliente confere
 * o estado devolvido contra o pedido: se não bateu, é erro, não sucesso silencioso.
 */

const { store } = vi.hoisted(() => ({
  store: {
    rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
    fromCalls: [] as string[],
    response: { data: null as unknown, error: null as { message: string } | null },
  },
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      store.rpcCalls.push({ fn, args });
      return store.response;
    }),
    from: vi.fn((table: string) => {
      store.fromCalls.push(table);
      throw new Error("update direto em tabela não deveria acontecer");
    }),
  },
}));

const saved = (over: Record<string, unknown> = {}) => [
  {
    email_digest_enabled: true,
    email_alerts_enabled: false,
    email_habit_reminder_enabled: false,
    email_unsubscribed_at: null,
    ...over,
  },
];

describe("updateEmailPrefs", () => {
  beforeEach(() => {
    store.rpcCalls = [];
    store.fromCalls = [];
    store.response = { data: saved(), error: null };
  });

  it("grava pela RPC só com os campos pedidos, sem tocar a tabela direto", async () => {
    store.response = { data: saved({ email_digest_enabled: false }), error: null };
    await updateEmailPrefs({ email_digest_enabled: false });
    expect(store.fromCalls).toEqual([]);
    expect(store.rpcCalls).toEqual([
      {
        fn: "update_email_prefs",
        args: {
          p_digest: false,
          p_alerts: null,
          p_habit_reminder: null,
          p_unsubscribed: null,
        },
      },
    ]);
  });

  it("devolve o estado gravado", async () => {
    store.response = {
      data: saved({ email_unsubscribed_at: "2026-10-02T13:00:00Z" }),
      error: null,
    };
    const result = await updateEmailPrefs({ unsubscribed: true });
    expect(store.rpcCalls[0].args.p_unsubscribed).toBe(true);
    expect(result.email_unsubscribed_at).toBe("2026-10-02T13:00:00Z");
  });

  it("lança quando o banco devolve estado diferente do pedido", async () => {
    store.response = { data: saved({ email_alerts_enabled: false }), error: null };
    await expect(updateEmailPrefs({ email_alerts_enabled: true })).rejects.toThrow(
      /não foi gravada/
    );
  });

  it("lança quando a RPC não devolve linha", async () => {
    store.response = { data: [], error: null };
    await expect(updateEmailPrefs({ email_digest_enabled: true })).rejects.toThrow(
      /não foi gravada/
    );
  });

  it("propaga erro da RPC", async () => {
    store.response = { data: null, error: { message: "boom" } };
    await expect(updateEmailPrefs({ email_digest_enabled: true })).rejects.toThrow("boom");
  });
});

describe("applyEmailPrefsPatch", () => {
  const base = {
    id: "user-1",
    email_digest_enabled: true,
    email_alerts_enabled: false,
    email_habit_reminder_enabled: false,
    email_unsubscribed_at: null as string | null,
  };

  it("muda só os campos do patch", () => {
    expect(applyEmailPrefsPatch(base, { email_alerts_enabled: true })).toEqual({
      ...base,
      email_alerts_enabled: true,
    });
  });

  it("pausar preserva a data de pausa existente; retomar zera", () => {
    const paused = { ...base, email_unsubscribed_at: "2026-01-01T00:00:00Z" };
    expect(applyEmailPrefsPatch(paused, { unsubscribed: true }).email_unsubscribed_at).toBe(
      "2026-01-01T00:00:00Z"
    );
    expect(applyEmailPrefsPatch(paused, { unsubscribed: false }).email_unsubscribed_at).toBeNull();
    expect(applyEmailPrefsPatch(base, { unsubscribed: true }).email_unsubscribed_at).toEqual(
      expect.any(String)
    );
  });
});
