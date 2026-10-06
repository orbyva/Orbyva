import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_ORB_DAILY_LIMIT,
  DEFAULT_ORB_MINUTE_LIMIT,
  ORB_ACCESS_CHECK_FAILED_MESSAGE,
  ORB_NO_ACCESS_MESSAGE,
  ORB_QUOTA_CHECK_FAILED_MESSAGE,
  checkOrbAccess,
  consumeOrbQuota,
  orbLimitsFromEnv,
  type RpcClient,
} from "../../../../supabase/functions/_shared/orbQuotaRules.ts";

function client(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async () => result);
  return { db: { rpc } as unknown as RpcClient, rpc };
}

describe("orbLimitsFromEnv", () => {
  it("usa 100/dia e 10/min sem env", () => {
    expect(orbLimitsFromEnv({})).toEqual({ daily: 100, minute: 10 });
    expect(DEFAULT_ORB_DAILY_LIMIT).toBe(100);
    expect(DEFAULT_ORB_MINUTE_LIMIT).toBe(10);
  });

  it("aceita override numérico e ignora lixo", () => {
    expect(orbLimitsFromEnv({ ORB_DAILY_LIMIT: "250", ORB_MINUTE_LIMIT: " 3 " })).toEqual({
      daily: 250,
      minute: 3,
    });
    expect(orbLimitsFromEnv({ ORB_DAILY_LIMIT: "abc", ORB_MINUTE_LIMIT: "-5" })).toEqual({
      daily: 100,
      minute: 10,
    });
  });
});

describe("checkOrbAccess", () => {
  it("libera quem tem acesso", async () => {
    const { db, rpc } = client({ data: true, error: null });
    expect(await checkOrbAccess(db)).toBeNull();
    expect(rpc).toHaveBeenCalledWith("has_app_access");
  });

  it("402 para trial vencido / sem assinatura", async () => {
    const { db } = client({ data: false, error: null });
    expect(await checkOrbAccess(db)).toEqual({
      status: 402,
      body: { error: ORB_NO_ACCESS_MESSAGE },
      headers: {},
    });
  });

  it("erro na checagem recusa com 503 (fail-closed)", async () => {
    const { db } = client({ data: null, error: { message: "boom" } });
    expect(await checkOrbAccess(db)).toMatchObject({
      status: 503,
      body: { error: ORB_ACCESS_CHECK_FAILED_MESSAGE },
    });
  });
});

describe("consumeOrbQuota", () => {
  const limits = { daily: 100, minute: 10 };

  it("passa os limites e o usuário para a RPC e libera quando ok", async () => {
    const { db, rpc } = client({ data: { ok: true, used: 1, remaining: 99 }, error: null });
    expect(await consumeOrbQuota(db, "u1", limits)).toBeNull();
    expect(rpc).toHaveBeenCalledWith("orb_try_consume", {
      p_user_id: "u1",
      p_daily_limit: 100,
      p_minute_limit: 10,
    });
  });

  it("cota diária estourada → 429 com Retry-After até a meia-noite", async () => {
    const { db } = client({
      data: { ok: false, reason: "day", used: 100, limit: 100, retry_after_seconds: 3600 },
      error: null,
    });
    expect(await consumeOrbQuota(db, "u1", limits)).toEqual({
      status: 429,
      body: {
        error: "Você chegou ao limite de 100 pedidos à Orb por hoje. A cota volta à meia-noite.",
        limit: 100,
        remaining: 0,
      },
      headers: { "Retry-After": "3600" },
    });
  });

  it("rajada → 429 dizendo quantos segundos esperar", async () => {
    const { db } = client({
      data: { ok: false, reason: "minute", used: 10, limit: 10, retry_after_seconds: 17.2 },
      error: null,
    });
    const denial = await consumeOrbQuota(db, "u1", limits);
    expect(denial?.status).toBe(429);
    expect(denial?.body.error).toBe("Muitos pedidos seguidos. Espere 18 s e tente de novo.");
    expect(denial?.headers).toEqual({ "Retry-After": "18" });
  });

  it("erro, resposta vazia ou motivo desconhecido → 503 sem liberar", async () => {
    for (const result of [
      { data: null, error: { message: "function does not exist" } },
      { data: null, error: null },
      { data: { ok: false, reason: "invalid_limit" }, error: null },
    ]) {
      const { db } = client(result);
      expect(await consumeOrbQuota(db, "u1", limits)).toMatchObject({
        status: 503,
        body: { error: ORB_QUOTA_CHECK_FAILED_MESSAGE },
      });
    }
  });
});
