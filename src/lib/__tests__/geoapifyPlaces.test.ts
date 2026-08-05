import { describe, expect, it } from "vitest";
import {
  formatDistanceMeters,
  mapGeoapifyCategoryToPlaceType,
  searchPlaces,
} from "@/lib/geoapifyPlaces";

describe("mapGeoapifyCategoryToPlaceType", () => {
  it("mapeia categorias conhecidas", () => {
    expect(mapGeoapifyCategoryToPlaceType("catering.restaurant")).toBe(
      "restaurant"
    );
    expect(mapGeoapifyCategoryToPlaceType("cafe.coffee")).toBe("cafe");
    expect(mapGeoapifyCategoryToPlaceType("catering.bar")).toBe("bar");
    expect(mapGeoapifyCategoryToPlaceType("accommodation.hotel")).toBe("hotel");
    expect(mapGeoapifyCategoryToPlaceType("leisure.park")).toBe("park");
    expect(mapGeoapifyCategoryToPlaceType("entertainment.museum")).toBe(
      "museum"
    );
    expect(mapGeoapifyCategoryToPlaceType("commercial.shopping_mall")).toBe(
      "shop"
    );
    expect(mapGeoapifyCategoryToPlaceType("tourism.attraction")).toBe(
      "attraction"
    );
    expect(mapGeoapifyCategoryToPlaceType("sport.stadium")).toBe("attraction");
  });

  it("fallback other", () => {
    expect(mapGeoapifyCategoryToPlaceType(null)).toBe("other");
    expect(mapGeoapifyCategoryToPlaceType("xyz")).toBe("other");
  });
});

describe("formatDistanceMeters", () => {
  it("formata m e km", () => {
    expect(formatDistanceMeters(null)).toBeNull();
    expect(formatDistanceMeters(-1)).toBeNull();
    expect(formatDistanceMeters(250)).toBe("250 m");
    expect(formatDistanceMeters(1500)).toBe("1.5 km");
    expect(formatDistanceMeters(12_500)).toBe("13 km");
  });
});

describe("searchPlaces", () => {
  it("não chama API com query curta sem categoria", async () => {
    await expect(searchPlaces({ query: "a" })).resolves.toEqual([]);
    await expect(searchPlaces({ query: "  " })).resolves.toEqual([]);
  });
});
