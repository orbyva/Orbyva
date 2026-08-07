import { describe, expect, it } from "vitest";
import { normalizeTripActivityCategory } from "@/domain/travel";

describe("normalizeTripActivityCategory", () => {
  it("default attraction", () => {
    expect(normalizeTripActivityCategory(null)).toBe("attraction");
    expect(normalizeTripActivityCategory(undefined)).toBe("attraction");
    expect(normalizeTripActivityCategory("")).toBe("attraction");
  });

  it("mapeia legado flight/activity; transport permanece", () => {
    expect(normalizeTripActivityCategory("flight")).toBe("transport");
    expect(normalizeTripActivityCategory("transport")).toBe("transport");
    expect(normalizeTripActivityCategory("activity")).toBe("attraction");
  });

  it("mantém tipos de lugar", () => {
    expect(normalizeTripActivityCategory("restaurant")).toBe("restaurant");
    expect(normalizeTripActivityCategory("museum")).toBe("museum");
    expect(normalizeTripActivityCategory("hotel")).toBe("hotel");
    expect(normalizeTripActivityCategory("other")).toBe("other");
  });

  it("valor desconhecido vira attraction", () => {
    expect(normalizeTripActivityCategory("voo")).toBe("attraction");
  });
});
