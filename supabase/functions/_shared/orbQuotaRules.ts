/**
 * Limite de uso da Orb (feature 249): cota diária + rajada por minuto, por usuário, e recusa de
 * quem está sem acesso ao app — tudo antes de qualquer chamada paga ao Gemini.
 *
 * Sem import de Deno nem de URL: os clients entram por parâmetro (só `rpc` é usado), o que deixa o
 * módulo testável no vitest do front (`src/domain/orb/__tests__/orbQuota.test.ts`).
 */
import { parseEnvInt } from "./billingGuardRules.ts";

export const DEFAULT_ORB_DAILY_LIMIT = 100;
export const DEFAULT_ORB_MINUTE_LIMIT = 10;

export interface OrbLimits {
  daily: number;
  minute: number;
}

export function orbLimitsFromEnv(env: {
  ORB_DAILY_LIMIT?: string | null;
  ORB_MINUTE_LIMIT?: string | null;
}): OrbLimits {
  return {
    daily: parseEnvInt(env.ORB_DAILY_LIMIT, DEFAULT_ORB_DAILY_LIMIT),
    minute: parseEnvInt(env.ORB_MINUTE_LIMIT, DEFAULT_ORB_MINUTE_LIMIT),
  };
}

/** Recorte de `SupabaseClient` que os portões usam. */
export interface RpcClient {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface OrbGateDenial {
  status: 402 | 429 | 503;
  body: { error: string; limit?: number; remaining?: number };
  headers: Record<string, string>;
}

export const ORB_NO_ACCESS_MESSAGE =
  "Seu acesso ao Orbyva expirou. Assine para continuar falando com a Orb.";
export const ORB_ACCESS_CHECK_FAILED_MESSAGE =
  "Não foi possível conferir seu acesso agora. Tente de novo em instantes.";
export const ORB_QUOTA_CHECK_FAILED_MESSAGE =
  "Não foi possível conferir seu limite de uso agora. Tente de novo em instantes.";

export function orbDailyLimitMessage(limit: number): string {
  return `Você chegou ao limite de ${limit} pedidos à Orb por hoje. A cota volta à meia-noite.`;
}

export function orbMinuteLimitMessage(retryAfterSeconds: number): string {
  return `Muitos pedidos seguidos. Espere ${retryAfterSeconds} s e tente de novo.`;
}

/** `has_app_access()` com o JWT do usuário. Erro na consulta também recusa (fail-closed). */
export async function checkOrbAccess(userDb: RpcClient): Promise<OrbGateDenial | null> {
  const { data, error } = await userDb.rpc("has_app_access");
  if (error) {
    return { status: 503, body: { error: ORB_ACCESS_CHECK_FAILED_MESSAGE }, headers: {} };
  }
  if (data !== true) {
    return { status: 402, body: { error: ORB_NO_ACCESS_MESSAGE }, headers: {} };
  }
  return null;
}

interface ConsumeRow {
  ok?: boolean;
  reason?: string;
  limit?: number;
  retry_after_seconds?: number;
}

/**
 * Consome um pedido da cota via `orb_try_consume` (client `service_role`). Conta o pedido aceito,
 * não a resposta: turno abortado também gasta. Qualquer resposta que não seja um `ok` claro recusa.
 */
export async function consumeOrbQuota(
  adminDb: RpcClient,
  userId: string,
  limits: OrbLimits
): Promise<OrbGateDenial | null> {
  const { data, error } = await adminDb.rpc("orb_try_consume", {
    p_user_id: userId,
    p_daily_limit: limits.daily,
    p_minute_limit: limits.minute,
  });
  const row = (data ?? null) as ConsumeRow | null;
  if (error || !row) {
    return { status: 503, body: { error: ORB_QUOTA_CHECK_FAILED_MESSAGE }, headers: {} };
  }
  if (row.ok === true) return null;

  if (row.reason === "day" || row.reason === "minute") {
    const retryAfter = Math.max(1, Math.ceil(Number(row.retry_after_seconds) || 60));
    const limit = typeof row.limit === "number" ? row.limit : row.reason === "day" ? limits.daily : limits.minute;
    return {
      status: 429,
      body: {
        error: row.reason === "day" ? orbDailyLimitMessage(limit) : orbMinuteLimitMessage(retryAfter),
        limit,
        remaining: 0,
      },
      headers: { "Retry-After": String(retryAfter) },
    };
  }
  return { status: 503, body: { error: ORB_QUOTA_CHECK_FAILED_MESSAGE }, headers: {} };
}
