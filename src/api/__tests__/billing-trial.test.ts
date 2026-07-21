import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { resolveFallbackTrialStart } from "@/api/billing";

describe("resolveFallbackTrialStart", () => {
  const userId = "user-test-1";
  const key = `fintrack_trial_start_v1:${userId}`;
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persiste o início e não muda em chamadas seguintes", () => {
    const first = resolveFallbackTrialStart(userId, "2026-01-01T00:00:00.000Z");
    const second = resolveFallbackTrialStart(userId, "2026-07-01T00:00:00.000Z");
    expect(first).toBe("2026-01-01T00:00:00.000Z");
    expect(second).toBe(first);
    expect(store.get(key)).toBe(first);
  });

  it("usa auth created_at na primeira vez", () => {
    const start = resolveFallbackTrialStart(userId, "2026-03-15T12:00:00.000Z");
    expect(start).toBe("2026-03-15T12:00:00.000Z");
    expect(store.get(key)).toBe(start);
  });
});
