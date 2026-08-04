/**
 * Regras puras de cota Maps — espelho de src/domain/maps/quotaRules.ts
 * (Edge Deno não importa o front; manter sincronizado).
 */
export type MapsProvider =
  | "geoapify"
  | "google_routes_essentials"
  | "google_routes_pro";

export type QuotaConsumeFailReason =
  | "limit"
  | "blocked"
  | "error"
  | "invalid_provider"
  | "invalid_amount"
  | "invalid_limit";

export type QuotaConsumeFail = {
  ok: false;
  reason: QuotaConsumeFailReason;
  used?: number;
  limit?: number;
  blocked_until?: string;
  message?: string;
};

export function parseEnvInt(
  raw: string | undefined | null,
  fallback: number
): number {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return fallback;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export function isMapsQuotaEnforcedFromEnv(
  raw: string | undefined | null
): boolean {
  const v = (raw ?? "true").trim().toLowerCase();
  return !(v === "false" || v === "0" || v === "off");
}

export function resolveGeoapifyDailyLimit(env: {
  GEOAPIFY_DAILY_CREDIT_LIMIT?: string;
  GEOAPIFY_DAILY_FREE_LIMIT?: string;
}): number {
  const primary = parseEnvInt(env.GEOAPIFY_DAILY_CREDIT_LIMIT, NaN);
  if (Number.isFinite(primary)) return primary;
  return parseEnvInt(env.GEOAPIFY_DAILY_FREE_LIMIT, 2800);
}

export function resolveGoogleEssentialsMonthlyLimit(env: {
  GOOGLE_ROUTES_ESSENTIALS_MONTHLY_LIMIT?: string;
  GOOGLE_ROUTES_MONTHLY_FREE_LIMIT?: string;
}): number {
  const primary = parseEnvInt(env.GOOGLE_ROUTES_ESSENTIALS_MONTHLY_LIMIT, NaN);
  if (Number.isFinite(primary)) return primary;
  return parseEnvInt(env.GOOGLE_ROUTES_MONTHLY_FREE_LIMIT, 9000);
}

export function resolveGoogleProMonthlyLimit(env: {
  GOOGLE_ROUTES_PRO_MONTHLY_LIMIT?: string;
}): number {
  return parseEnvInt(env.GOOGLE_ROUTES_PRO_MONTHLY_LIMIT, 4500);
}

export function limitForProvider(
  provider: MapsProvider,
  env: Record<string, string | undefined> = {}
): number {
  if (provider === "geoapify") return resolveGeoapifyDailyLimit(env);
  if (provider === "google_routes_pro") return resolveGoogleProMonthlyLimit(env);
  return resolveGoogleEssentialsMonthlyLimit(env);
}

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
  result: QuotaConsumeFail,
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
