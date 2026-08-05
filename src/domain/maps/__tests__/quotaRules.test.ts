import { describe, expect, it } from "vitest";
import {
  isMapsQuotaEnforcedFromEnv,
  limitForProvider,
  looksLikeBillingOrQuotaError,
  parseEnvInt,
  periodEndUtc,
  periodKeyFor,
  quotaDeniedPayload,
  quotaProviderForTravelMode,
  resolveGeoapifyDailyLimit,
  resolveGoogleEssentialsMonthlyLimit,
  resolveGoogleProMonthlyLimit,
} from "@/domain/maps/quotaRules";

describe("parseEnvInt / enforce", () => {
  it("parseEnvInt", () => {
    expect(parseEnvInt(undefined, 10)).toBe(10);
    expect(parseEnvInt("", 10)).toBe(10);
    expect(parseEnvInt("2800", 10)).toBe(2800);
    expect(parseEnvInt("-1", 10)).toBe(10);
    expect(parseEnvInt("abc", 10)).toBe(10);
    expect(parseEnvInt("12.9", 10)).toBe(12);
  });

  it("isMapsQuotaEnforcedFromEnv default on", () => {
    expect(isMapsQuotaEnforcedFromEnv(undefined)).toBe(true);
    expect(isMapsQuotaEnforcedFromEnv("true")).toBe(true);
    expect(isMapsQuotaEnforcedFromEnv("false")).toBe(false);
    expect(isMapsQuotaEnforcedFromEnv("0")).toBe(false);
    expect(isMapsQuotaEnforcedFromEnv("off")).toBe(false);
  });
});

describe("limites", () => {
  it("usa defaults", () => {
    expect(resolveGeoapifyDailyLimit({})).toBe(2800);
    expect(resolveGoogleEssentialsMonthlyLimit({})).toBe(9000);
    expect(resolveGoogleProMonthlyLimit({})).toBe(4500);
  });

  it("respeita env e legado", () => {
    expect(
      resolveGeoapifyDailyLimit({ GEOAPIFY_DAILY_CREDIT_LIMIT: "100" })
    ).toBe(100);
    expect(
      resolveGeoapifyDailyLimit({ GEOAPIFY_DAILY_FREE_LIMIT: "50" })
    ).toBe(50);
    expect(
      limitForProvider("google_routes_pro", {
        GOOGLE_ROUTES_PRO_MONTHLY_LIMIT: "1",
      })
    ).toBe(1);
    expect(limitForProvider("geoapify", {})).toBe(2800);
    expect(limitForProvider("google_routes_essentials", {})).toBe(9000);
  });
});

describe("período UTC", () => {
  const now = new Date(Date.UTC(2026, 7, 4, 15, 30, 0)); // 4 ago 2026

  it("geoapify = dia; google = mês", () => {
    expect(periodKeyFor("geoapify", now)).toBe("2026-08-04");
    expect(periodKeyFor("google_routes_essentials", now)).toBe("2026-08");
    expect(periodKeyFor("google_routes_pro", now)).toBe("2026-08");
  });

  it("periodEndUtc", () => {
    expect(periodEndUtc("geoapify", now).toISOString()).toBe(
      "2026-08-05T00:00:00.000Z"
    );
    expect(periodEndUtc("google_routes_pro", now).toISOString()).toBe(
      "2026-09-01T00:00:00.000Z"
    );
  });
});

describe("quotaProviderForTravelMode", () => {
  it("mapeia modos", () => {
    expect(quotaProviderForTravelMode("DRIVE")).toBe("google_routes_pro");
    expect(quotaProviderForTravelMode("walk")).toBe(
      "google_routes_essentials"
    );
    expect(quotaProviderForTravelMode("BICYCLE")).toBe(
      "google_routes_essentials"
    );
    expect(quotaProviderForTravelMode("TRANSIT")).toBe(
      "google_routes_essentials"
    );
    expect(quotaProviderForTravelMode("TWO_WHEELER")).toBeNull();
    expect(quotaProviderForTravelMode("")).toBeNull();
  });
});

describe("looksLikeBillingOrQuotaError", () => {
  it("detecta 429 e textos de cota", () => {
    expect(looksLikeBillingOrQuotaError(429, "")).toBe(true);
    expect(looksLikeBillingOrQuotaError(403, "quota exceeded")).toBe(true);
    expect(looksLikeBillingOrQuotaError(403, "forbidden")).toBe(false);
    expect(looksLikeBillingOrQuotaError(500, "RESOURCE_EXHAUSTED")).toBe(true);
    expect(looksLikeBillingOrQuotaError(200, "ok")).toBe(false);
  });
});

describe("quotaDeniedPayload", () => {
  it("mensagem fail-closed em error", () => {
    const p = quotaDeniedPayload({ ok: false, reason: "error" }, "geoapify");
    expect(p.code).toBe("MAPS_QUOTA_EXCEEDED");
    expect(p.error).toMatch(/segurança/i);
  });

  it("mensagem de limite por bucket", () => {
    const p = quotaDeniedPayload(
      { ok: false, reason: "limit", used: 2800, limit: 2800 },
      "geoapify"
    );
    expect(p.error).toMatch(/busca de lugares/);
    expect(p.used).toBe(2800);
  });

  it("blocked usa copy de bloqueio", () => {
    const p = quotaDeniedPayload(
      { ok: false, reason: "blocked", blocked_until: "2026-09-01" },
      "google_routes_pro"
    );
    expect(p.error).toMatch(/bloqueado/);
    expect(p.blocked_until).toBe("2026-09-01");
  });
});
