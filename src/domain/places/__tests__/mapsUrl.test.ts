import { describe, expect, it } from "vitest";
import { isGoogleMapsUrl } from "@/domain/places/mapsUrl";

describe("isGoogleMapsUrl", () => {
  it("aceita maps.app.goo.gl e maps.google", () => {
    expect(isGoogleMapsUrl("https://maps.app.goo.gl/abc")).toBe(true);
    expect(isGoogleMapsUrl("https://www.google.com/maps/place/x")).toBe(true);
    expect(isGoogleMapsUrl("https://maps.google.com/?q=-23,-46")).toBe(true);
  });

  it("rejeita links genéricos", () => {
    expect(isGoogleMapsUrl("https://example.com")).toBe(false);
    expect(isGoogleMapsUrl("https://www.google.com/search?q=cafe")).toBe(false);
    expect(isGoogleMapsUrl("")).toBe(false);
    expect(isGoogleMapsUrl(null)).toBe(false);
  });
});
