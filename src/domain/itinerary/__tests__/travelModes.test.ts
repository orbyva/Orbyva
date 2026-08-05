import { describe, expect, it } from "vitest";
import {
  PREFERRED_TRAVEL_MODES,
  TRAVEL_MODES,
  travelModeMeta,
} from "@/domain/itinerary/travelModes";

describe("TRAVEL_MODES", () => {
  it("não inclui TWO_WHEELER", () => {
    expect(TRAVEL_MODES.map((m) => m.mode)).toEqual([
      "DRIVE",
      "TRANSIT",
      "BICYCLE",
      "WALK",
    ]);
  });

  it("DRIVE usa cota Pro; demais Essentials", () => {
    expect(travelModeMeta("DRIVE").quota).toBe("pro");
    expect(travelModeMeta("WALK").quota).toBe("essentials");
    expect(travelModeMeta("BICYCLE").quota).toBe("essentials");
    expect(travelModeMeta("TRANSIT").quota).toBe("essentials");
  });

  it("fallback para modo desconhecido", () => {
    const meta = travelModeMeta("SCOOTER");
    expect(meta.mode).toBe("SCOOTER");
    expect(meta.quota).toBe("essentials");
  });

  it("PREFERRED_TRAVEL_MODES prioriza custo", () => {
    expect(PREFERRED_TRAVEL_MODES).toEqual(["DRIVE", "TRANSIT", "WALK"]);
  });
});
