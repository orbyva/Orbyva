import { describe, expect, it } from "vitest";
import {
  appleDirFlag,
  buildAppleMapsDirectionsUrl,
  buildExternalMapsLinks,
  buildGoogleMapsDirectionsUrl,
  buildWazeDirectionsUrl,
  googleTravelMode,
} from "@/domain/itinerary/externalMaps";

const origin = { lat: -15.78, lng: -47.93 };
const destination = { lat: -15.783, lng: -47.899 };

describe("externalMaps", () => {
  it("mapeia modalidades Google / Apple", () => {
    expect(googleTravelMode("DRIVE")).toBe("driving");
    expect(googleTravelMode("WALK")).toBe("walking");
    expect(googleTravelMode("BICYCLE")).toBe("bicycling");
    expect(googleTravelMode("TRANSIT")).toBe("transit");
    expect(appleDirFlag("WALK")).toBe("w");
    expect(appleDirFlag("TRANSIT")).toBe("r");
    expect(appleDirFlag("DRIVE")).toBe("d");
  });

  it("monta Google Maps com origem e destino", () => {
    const href = buildGoogleMapsDirectionsUrl({
      origin,
      destination,
      mode: "DRIVE",
    });
    expect(href).toContain("google.com/maps/dir/");
    expect(href).toContain("api=1");
    expect(href).toContain("origin=-15.78%2C-47.93");
    expect(href).toContain("destination=-15.783%2C-47.899");
    expect(href).toContain("travelmode=driving");
  });

  it("Google Maps sem origem", () => {
    const href = buildGoogleMapsDirectionsUrl({ destination, mode: "WALK" });
    expect(href).not.toContain("origin=");
    expect(href).toContain("travelmode=walking");
  });

  it("monta Apple Maps", () => {
    const href = buildAppleMapsDirectionsUrl({
      origin,
      destination,
      mode: "TRANSIT",
    });
    expect(href).toContain("maps.apple.com");
    expect(href).toContain("saddr=-15.78%2C-47.93");
    expect(href).toContain("daddr=-15.783%2C-47.899");
    expect(href).toContain("dirflg=r");
  });

  it("monta Waze", () => {
    const href = buildWazeDirectionsUrl({ origin, destination });
    expect(href).toContain("waze.com/ul");
    expect(href).toContain("ll=-15.783%2C-47.899");
    expect(href).toContain("navigate=yes");
    expect(href).toContain("from=-15.78%2C-47.93");
  });

  it("buildExternalMapsLinks retorna os 3 apps", () => {
    const links = buildExternalMapsLinks({
      origin,
      destination,
      mode: "DRIVE",
    });
    expect(links.map((l) => l.app)).toEqual(["google", "waze", "apple"]);
    expect(links.every((l) => l.href.startsWith("https://"))).toBe(true);
  });

  it("sem destino válido → lista vazia", () => {
    expect(buildExternalMapsLinks({ destination: null })).toEqual([]);
    expect(
      buildExternalMapsLinks({ destination: { lat: NaN, lng: 0 } })
    ).toEqual([]);
  });
});
