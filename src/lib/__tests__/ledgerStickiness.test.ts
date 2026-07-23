import { describe, expect, it } from "vitest";
import { daysSinceIsoDate } from "@/lib/ledgerStickiness";

describe("ledgerStickiness", () => {
  it("conta dias desde a última tx", () => {
    const now = new Date("2026-07-23T15:00:00.000Z");
    expect(daysSinceIsoDate("2026-07-23T10:00:00.000Z", now)).toBe(0);
    expect(daysSinceIsoDate("2026-07-20T10:00:00.000Z", now)).toBe(3);
    expect(daysSinceIsoDate(null, now)).toBeNull();
  });
});
