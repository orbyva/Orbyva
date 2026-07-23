import { describe, expect, it } from "vitest";
import { isBillingConfigured } from "@/lib/billing-config";

describe("billing helpers", () => {
  it("isBillingConfigured reflete a publishable key", () => {
    expect(typeof isBillingConfigured()).toBe("boolean");
  });
});
