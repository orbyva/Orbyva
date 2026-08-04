import { describe, expect, it } from "vitest";
import {
  getTrialEndsAt,
  hasAppAccess,
  isProPlan,
  isTrialActive,
  PLANS,
  TRIAL_DAYS,
  trialDaysRemaining,
} from "@/lib/plan";

describe("plan", () => {
  it("detecta Pro", () => {
    expect(isProPlan("pro")).toBe(true);
    expect(isProPlan("free")).toBe(false);
    expect(isProPlan(null)).toBe(false);
  });

  it("expõe teste e Pro sem prometer IA", () => {
    expect(PLANS.free.priceLabel).toContain("7");
    const copy = PLANS.pro.features.join(" ").toLowerCase();
    expect(copy).not.toMatch(/\bia\b/);
    expect(copy).not.toContain("inteligência artificial");
  });

  it("calcula fim do teste em 7 dias", () => {
    const start = new Date("2026-07-01T12:00:00.000Z");
    const ends = getTrialEndsAt(start);
    expect(ends.toISOString().slice(0, 10)).toBe("2026-07-08");
    expect(TRIAL_DAYS).toBe(7);
  });

  it("respeita trial_ends_at explícito", () => {
    const created = "2026-01-01T00:00:00.000Z";
    const extended = "2026-08-15T00:00:00.000Z";
    expect(getTrialEndsAt(created, extended).toISOString().slice(0, 10)).toBe(
      "2026-08-15"
    );
    expect(
      isTrialActive(created, new Date("2026-08-10T00:00:00.000Z"), extended)
    ).toBe(true);
    expect(
      isTrialActive(created, new Date("2026-08-20T00:00:00.000Z"), extended)
    ).toBe(false);
    expect(
      hasAppAccess({
        plan: "free",
        createdAt: created,
        trialEndsAt: extended,
      })
    ).toBe(
      new Date() < new Date(extended)
    );
  });

  it("libera acesso no teste e no Pro", () => {
    const created = new Date();
    created.setDate(created.getDate() - 2);
    expect(
      hasAppAccess({ plan: "free", createdAt: created.toISOString() })
    ).toBe(true);
    expect(hasAppAccess({ plan: "pro", createdAt: "2020-01-01" })).toBe(true);
    expect(
      hasAppAccess({
        plan: "free",
        createdAt: "2020-01-01",
        subscriptionStatus: "trialing",
      })
    ).toBe(true);

    const old = new Date();
    old.setDate(old.getDate() - 10);
    expect(hasAppAccess({ plan: "free", createdAt: old.toISOString() })).toBe(
      false
    );
    expect(isTrialActive(old.toISOString())).toBe(false);
    expect(trialDaysRemaining(old.toISOString())).toBe(0);
  });

  it("nega trial sem created_at (fail-closed)", () => {
    expect(isTrialActive(null)).toBe(false);
    expect(isTrialActive(undefined)).toBe(false);
    expect(hasAppAccess({ plan: "free", createdAt: null })).toBe(false);
    expect(trialDaysRemaining(null)).toBe(0);
  });

  it("trial_ends_at sozinho basta para acesso", () => {
    const future = new Date();
    future.setDate(future.getDate() + 3);
    expect(
      hasAppAccess({
        plan: "free",
        createdAt: "2020-01-01",
        trialEndsAt: future.toISOString(),
      })
    ).toBe(true);
    expect(
      trialDaysRemaining("2020-01-01", new Date(), future.toISOString())
    ).toBeGreaterThan(0);
  });
});
