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
    const { searchPlaces } = await import("@/lib/geoapifyPlaces");
    invoke.mockResolvedValue({
      data: {
        places: [
          {
            placeId: "1",
            name: "Mané",
            address: "BSB",
            lat: 1,
            lng: 2,
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
    const { searchPlaces, MapsQuotaExceededError } = await import(
      "@/lib/geoapifyPlaces"
    );
    invoke.mockResolvedValue({
      data: { code: "MAPS_QUOTA_EXCEEDED", error: "limite" },
      error: null,
    });
    // query diferente para evitar cache do teste anterior no mesmo worker
    await expect(searchPlaces({ query: "quota-test-xyz" })).rejects.toBeInstanceOf(
      MapsQuotaExceededError
    );
  });
});
