import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invoke(...args),
    },
  },
}));

describe("searchPlaces (invoke)", () => {
  beforeEach(() => {
    invoke.mockReset();
    vi.resetModules();
  });

  it("retorna hits da edge", async () => {
    const { searchPlaces } = await import("@/lib/googlePlaces");
    invoke.mockResolvedValue({
      data: {
        places: [
          {
            placeId: "ChIJ1",
            name: "Mané",
            address: "BSB",
            lat: null,
            lng: null,
            category: "stadium",
            distanceMeters: 100,
          },
        ],
      },
      error: null,
    });

    const hits = await searchPlaces({ query: "mane" });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.name).toBe("Mané");
    expect(invoke).toHaveBeenCalledWith(
      "places-catalog",
      expect.objectContaining({
        body: expect.objectContaining({ action: "search", query: "mane" }),
      })
    );
  });

  it("lança MapsQuotaExceededError", async () => {
    const { searchPlaces, MapsQuotaExceededError, clearPlaceSearchCache } =
      await import("@/lib/googlePlaces");
    clearPlaceSearchCache();
    invoke.mockResolvedValue({
      data: { code: "MAPS_QUOTA_EXCEEDED", error: "limite" },
      error: null,
    });
    await expect(
      searchPlaces({ query: "quota-test-xyz" })
    ).rejects.toBeInstanceOf(MapsQuotaExceededError);
  });
});
