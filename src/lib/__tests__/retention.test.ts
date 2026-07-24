import { beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.fn();

vi.mock("@/lib/analytics", () => ({
  track: (...args: unknown[]) => track(...args),
}));

import { maybeTrackRetentionD7 } from "@/lib/retention";

function mockBrowserStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    },
  });
  vi.stubGlobal("localStorage", window.localStorage);
}

describe("maybeTrackRetentionD7", () => {
  beforeEach(() => {
    track.mockClear();
    mockBrowserStorage();
  });

  it("não dispara antes de 7 dias", () => {
    const created = new Date("2026-07-20T12:00:00.000Z");
    const now = new Date("2026-07-24T12:00:00.000Z");
    expect(maybeTrackRetentionD7("u1", created.toISOString(), now)).toBe(false);
    expect(track).not.toHaveBeenCalled();
  });

  it("dispara uma vez no dia 7+", () => {
    const created = new Date("2026-07-10T12:00:00.000Z");
    const now = new Date("2026-07-24T12:00:00.000Z");
    expect(maybeTrackRetentionD7("u1", created.toISOString(), now)).toBe(true);
    expect(track).toHaveBeenCalledWith("retention_d7", {
      days_since_signup: 14,
    });
    expect(maybeTrackRetentionD7("u1", created.toISOString(), now)).toBe(false);
    expect(track).toHaveBeenCalledTimes(1);
  });
});
