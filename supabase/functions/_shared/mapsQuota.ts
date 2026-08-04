/**
 * Cotas freemium (fail-closed quando MAPS_QUOTA_ENFORCE≠false).
 *
 * Env:
 *   GEOAPIFY_DAILY_CREDIT_LIMIT=2800          (diário UTC)
 *   GOOGLE_ROUTES_ESSENTIALS_MONTHLY_LIMIT=9000  (WALK/BICYCLE/TRANSIT)
 *   GOOGLE_ROUTES_PRO_MONTHLY_LIMIT=4500         (DRIVE + TRAFFIC_AWARE*)
 *   MAPS_QUOTA_ENFORCE=true
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type MapsProvider =
  | "geoapify"
  | "google_routes_essentials"
  | "google_routes_pro";

export type QuotaConsumeResult =
  | { ok: true; used: number; limit: number; remaining: number }
  | {
      ok: false;
      reason:
        | "limit"
        | "blocked"
        | "error"
        | "invalid_provider"
        | "invalid_amount"
        | "invalid_limit";
      used?: number;
      limit?: number;
      blocked_until?: string;
      message?: string;
    };

type AdminClient = ReturnType<typeof createClient>;

function envInt(name: string, fallback: number): number {
  const raw = (Deno.env.get(name) ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** false | 0 | off desliga. Default: ligado. */
export function isMapsQuotaEnforced(): boolean {
  const raw = (Deno.env.get("MAPS_QUOTA_ENFORCE") ?? "true").trim().toLowerCase();
  return !(raw === "false" || raw === "0" || raw === "off");
}

export function geoapifyDailyCreditLimit(): number {
  return envInt(
    "GEOAPIFY_DAILY_CREDIT_LIMIT",
    envInt("GEOAPIFY_DAILY_FREE_LIMIT", 2800) // legado
  );
}

export function googleRoutesEssentialsMonthlyLimit(): number {
  return envInt(
    "GOOGLE_ROUTES_ESSENTIALS_MONTHLY_LIMIT",
    envInt("GOOGLE_ROUTES_MONTHLY_FREE_LIMIT", 9000) // legado
  );
}

export function googleRoutesProMonthlyLimit(): number {
  return envInt("GOOGLE_ROUTES_PRO_MONTHLY_LIMIT", 4500);
}

export function limitFor(provider: MapsProvider): number {
  if (provider === "geoapify") return geoapifyDailyCreditLimit();
  if (provider === "google_routes_pro") return googleRoutesProMonthlyLimit();
  return googleRoutesEssentialsMonthlyLimit();
}

/** Geoapify = dia UTC; Google = mês UTC. */
export function periodKeyFor(provider: MapsProvider, now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  if (provider === "geoapify") return `${y}-${m}-${d}`;
  return `${y}-${m}`;
}

export function periodEndUtc(provider: MapsProvider, now = new Date()): Date {
  if (provider === "geoapify") {
    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0,
        0,
        0,
        0
      )
    );
  }
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)
  );
}

/**
 * DRIVE + tráfego → Pro.
 * WALK / BICYCLE / TRANSIT → Essentials.
 * TWO_WHEELER não é suportado.
 */
export function quotaProviderForTravelMode(
  mode: string
): MapsProvider | null {
  const m = mode.toUpperCase();
  if (m === "DRIVE") return "google_routes_pro";
  if (m === "WALK" || m === "BICYCLE" || m === "TRANSIT") {
    return "google_routes_essentials";
  }
  return null;
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
    const reason = (row?.reason ?? "limit") as Extract<
      QuotaConsumeResult,
      { ok: false }
    >["reason"];
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

export function looksLikeBillingOrQuotaError(
  status: number,
  bodyText: string
): boolean {
  if (status === 429) return true;
  if (status === 403) {
    return /billing|quota|limit|payment|exceed|RESOURCE_EXHAUSTED|daily.?limit/i.test(
      bodyText
    );
  }
  return /RESOURCE_EXHAUSTED|quota.?exceed|billing|OVER_QUERY_LIMIT|daily.?limit|credit.?limit/i.test(
    bodyText
  );
}

export function quotaDeniedPayload(
  result: Extract<QuotaConsumeResult, { ok: false }>,
  provider?: MapsProvider
) {
  const bucket =
    provider === "google_routes_pro"
      ? "rotas com trânsito (Pro)"
      : provider === "google_routes_essentials"
        ? "rotas Essentials"
        : provider === "geoapify"
          ? "busca de lugares"
          : "mapas";

  const period =
    result.reason === "blocked"
      ? "bloqueado até o fim do período gratuito"
      : "limite gratuito atingido";

  return {
    error:
      result.reason === "error"
        ? "Controle de cota indisponível — requisições bloqueadas por segurança."
        : `Limite gratuito de ${bucket} atingido (${period}). Novas chamadas liberam no próximo período.`,
    code: "MAPS_QUOTA_EXCEEDED" as const,
    reason: result.reason,
    provider: provider ?? null,
    used: result.used ?? null,
    limit: result.limit ?? null,
    blocked_until: result.blocked_until ?? null,
  };
}
