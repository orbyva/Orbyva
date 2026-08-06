import { describe, expect, it } from "vitest";
import {
  limitForProvider,
  periodKeyFor,
  periodEndUtc,
  quotaDeniedPayload,
  quotaProviderForTravelMode,
  resolveGooglePlacesMonthlyLimit,
  resolveGoogleWeatherMonthlyLimit,
} from "@/domain/maps/quotaRules";

describe("quotaRules google maps", () => {
  it("defaults abaixo do free cap", () => {
    expect(resolveGooglePlacesMonthlyLimit({})).toBe(9000);
    expect(resolveGoogleWeatherMonthlyLimit({})).toBe(9000);
    expect(limitForProvider("google_places", {})).toBe(9000);
    expect(limitForProvider("google_weather", {})).toBe(9000);
    expect(limitForProvider("google_routes_essentials", {})).toBe(9000);
    expect(limitForProvider("google_routes_pro", {})).toBe(4500);
  });

  it("período mensal UTC", () => {
    const now = new Date("2026-08-04T12:00:00Z");
    expect(periodKeyFor("google_places", now)).toBe("2026-08");
    expect(periodEndUtc("google_weather", now).toISOString()).toBe(
      "2026-09-01T00:00:00.000Z"
    );
  });

  it("quotaProviderForTravelMode", () => {
    expect(quotaProviderForTravelMode("DRIVE")).toBe("google_routes_pro");
    expect(quotaProviderForTravelMode("WALK")).toBe(
      "google_routes_essentials"
    );
  });

  it("quotaDeniedPayload mensagem por provider", () => {
    const p = quotaDeniedPayload(
      { ok: false, reason: "limit" },
      "google_weather"
    );
    expect(p.code).toBe("MAPS_QUOTA_EXCEEDED");
    expect(p.error).toMatch(/previsão do tempo/i);
  });
});
