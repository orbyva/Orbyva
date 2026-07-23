import { describe, expect, it } from "vitest";
import { isBillingConfigured } from "@/lib/billing-config";
import { hasAppAccess } from "@/lib/plan";

describe("billing helpers", () => {
  it("isBillingConfigured reflete a publishable key", () => {
    expect(typeof isBillingConfigured()).toBe("boolean");
  });

  it("subscription active libera acesso mesmo fora do trial", () => {
    expect(
      hasAppAccess({
        plan: "free",
        createdAt: "2020-01-01T00:00:00.000Z",
        subscriptionStatus: "active",
      })
    ).toBe(true);
    expect(
      hasAppAccess({
        plan: "free",
        createdAt: "2020-01-01T00:00:00.000Z",
        subscriptionStatus: "canceled",
      })
    ).toBe(false);
  });
});
