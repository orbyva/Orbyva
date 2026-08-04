/**
 * Cotas freemium (fail-closed quando MAPS_QUOTA_ENFORCE≠false).
 *
 * Env:
 *   GEOAPIFY_DAILY_CREDIT_LIMIT=2800
 *   GOOGLE_ROUTES_ESSENTIALS_MONTHLY_LIMIT=9000
 *   GOOGLE_ROUTES_PRO_MONTHLY_LIMIT=4500
 *   MAPS_QUOTA_ENFORCE=true
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  isMapsQuotaEnforcedFromEnv,
  limitForProvider,
  looksLikeBillingOrQuotaError,
  periodEndUtc,
  periodKeyFor,
  quotaDeniedPayload,
  quotaProviderForTravelMode,
  resolveGeoapifyDailyLimit,
  resolveGoogleEssentialsMonthlyLimit,
  resolveGoogleProMonthlyLimit,
  type MapsProvider,
  type QuotaConsumeFail,
} from "./mapsQuotaRules.ts";

export type { MapsProvider };
export type QuotaConsumeResult =
  | { ok: true; used: number; limit: number; remaining: number }
  | QuotaConsumeFail;

export {
  looksLikeBillingOrQuotaError,
  periodEndUtc,
  periodKeyFor,
  quotaDeniedPayload,
  quotaProviderForTravelMode,
};

type AdminClient = ReturnType<typeof createClient>;

function envSnapshot(): Record<string, string | undefined> {
  return {
    GEOAPIFY_DAILY_CREDIT_LIMIT: Deno.env.get("GEOAPIFY_DAILY_CREDIT_LIMIT"),
    GEOAPIFY_DAILY_FREE_LIMIT: Deno.env.get("GEOAPIFY_DAILY_FREE_LIMIT"),
    GOOGLE_ROUTES_ESSENTIALS_MONTHLY_LIMIT: Deno.env.get(
      "GOOGLE_ROUTES_ESSENTIALS_MONTHLY_LIMIT"
    ),
    GOOGLE_ROUTES_MONTHLY_FREE_LIMIT: Deno.env.get(
      "GOOGLE_ROUTES_MONTHLY_FREE_LIMIT"
    ),
    GOOGLE_ROUTES_PRO_MONTHLY_LIMIT: Deno.env.get(
      "GOOGLE_ROUTES_PRO_MONTHLY_LIMIT"
    ),
  };
}

export function isMapsQuotaEnforced(): boolean {
  return isMapsQuotaEnforcedFromEnv(Deno.env.get("MAPS_QUOTA_ENFORCE"));
}

export function geoapifyDailyCreditLimit(): number {
  return resolveGeoapifyDailyLimit(envSnapshot());
}

export function googleRoutesEssentialsMonthlyLimit(): number {
  return resolveGoogleEssentialsMonthlyLimit(envSnapshot());
}

export function googleRoutesProMonthlyLimit(): number {
  return resolveGoogleProMonthlyLimit(envSnapshot());
}

export function limitFor(provider: MapsProvider): number {
  return limitForProvider(provider, envSnapshot());
}

export function createMapsAdminClient(): AdminClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function tryConsumeQuota(
  admin: AdminClient,
  provider: MapsProvider,
  amount: number
): Promise<QuotaConsumeResult> {
  if (!isMapsQuotaEnforced()) {
    return {
      ok: true,
      used: 0,
      limit: Number.MAX_SAFE_INTEGER,
      remaining: Number.MAX_SAFE_INTEGER,
    };
  }

  const limit = limitFor(provider);
  const period_key = periodKeyFor(provider);

  const { data, error } = await admin.rpc("maps_api_try_consume", {
    p_provider: provider,
    p_period_key: period_key,
    p_amount: amount,
    p_limit: limit,
  });

  if (error) {
    return {
      ok: false,
      reason: "error",
      message: error.message,
      limit,
    };
  }

  const row = data as {
    ok?: boolean;
    reason?: string;
    used?: number;
    limit?: number;
    remaining?: number;
    blocked_until?: string;
  } | null;

  if (!row || row.ok !== true) {
    const reason = (row?.reason ?? "limit") as QuotaConsumeFail["reason"];
    return {
      ok: false,
      reason,
      used: typeof row?.used === "number" ? row.used : undefined,
      limit: typeof row?.limit === "number" ? row.limit : limit,
      blocked_until:
        typeof row?.blocked_until === "string" ? row.blocked_until : undefined,
    };
  }

  return {
    ok: true,
    used: Number(row.used ?? 0),
    limit: Number(row.limit ?? limit),
    remaining: Number(row.remaining ?? 0),
  };
}

export async function blockProviderUntilPeriodEnd(
  admin: AdminClient,
  provider: MapsProvider
): Promise<void> {
  if (!isMapsQuotaEnforced()) return;
  const until = periodEndUtc(provider).toISOString();
  await admin.rpc("maps_api_block_until", {
    p_provider: provider,
    p_period_key: periodKeyFor(provider),
    p_until: until,
  });
}
