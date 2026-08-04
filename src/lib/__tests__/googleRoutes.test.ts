import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invoke(...args),
    },
  },
}));

describe("fetchTravelRoutes", () => {
  beforeEach(() => {
    invoke.mockReset();
    vi.resetModules();
  });

  it("retorna [] sem modos", async () => {
    const { fetchTravelRoutes, clearRouteCache } = await import(
      "@/lib/googleRoutes"
    );
    clearRouteCache();
    await expect(
      fetchTravelRoutes({
        origin: { lat: 1, lng: 2 },
        destination: { lat: 3, lng: 4 },
        modes: [],
      })
    ).resolves.toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("busca na edge e reutiliza cache", async () => {
    const { fetchTravelRoutes, clearRouteCache } = await import(
      "@/lib/googleRoutes"
    );
    clearRouteCache();
    invoke.mockResolvedValue({
      data: {
        routes: [
          {
            mode: "WALK",
            durationSeconds: 600,
            distanceMeters: 800,
            available: true,
          },
        ],
      },
      error: null,
    });

    const origin = { lat: -15.78, lng: -47.93 };
    const destination = { lat: -15.79, lng: -47.94 };
    const first = await fetchTravelRoutes({
      origin,
      destination,
      modes: ["WALK"],
    });
    expect(first[0]?.durationSeconds).toBe(600);
    expect(invoke).toHaveBeenCalledTimes(1);

    const second = await fetchTravelRoutes({
      origin,
      destination,
      modes: ["WALK"],
    });
    expect(second[0]?.durationSeconds).toBe(600);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("propaga MAPS_QUOTA_EXCEEDED", async () => {
    const { fetchTravelRoutes, clearRouteCache, MapsQuotaExceededError } =
      await import("@/lib/googleRoutes");
    clearRouteCache();
    invoke.mockResolvedValue({
      data: { error: "limite", code: "MAPS_QUOTA_EXCEEDED" },
      error: null,
    });

    await expect(
      fetchTravelRoutes({
        origin: { lat: 1, lng: 1 },
        destination: { lat: 2, lng: 2 },
        modes: ["DRIVE"],
      })
    ).rejects.toBeInstanceOf(MapsQuotaExceededError);
  });
});
