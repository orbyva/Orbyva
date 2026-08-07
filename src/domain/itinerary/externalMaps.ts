/**
 * Deep links universais (https) para abrir trajeto em apps externos.
 * No celular, o SO costuma abrir o app instalado.
 */
import type { TravelModeKey } from "@/domain/itinerary/travelModes";
import type { LatLng } from "@/domain/itinerary/visits";

export type ExternalMapsApp = "google" | "apple" | "waze";

export type ExternalMapsLink = {
  app: ExternalMapsApp;
  label: string;
  href: string;
};

function fmt(point: LatLng): string {
  return `${point.lat},${point.lng}`;
}

/** Google Maps travelmode. */
export function googleTravelMode(
  mode: TravelModeKey | string | null | undefined
): "driving" | "walking" | "bicycling" | "transit" {
  switch (mode) {
    case "WALK":
      return "walking";
    case "BICYCLE":
      return "bicycling";
    case "TRANSIT":
      return "transit";
    case "DRIVE":
    default:
      return "driving";
  }
}

/** Apple Maps dirflg: d drive, w walk, r transit, (bike ≈ d). */
export function appleDirFlag(
  mode: TravelModeKey | string | null | undefined
): "d" | "w" | "r" {
  switch (mode) {
    case "WALK":
      return "w";
    case "TRANSIT":
      return "r";
    case "BICYCLE":
    case "DRIVE":
    default:
      return "d";
  }
}

export function buildGoogleMapsDirectionsUrl(params: {
  destination: LatLng;
  origin?: LatLng | null;
  mode?: TravelModeKey | string | null;
}): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", fmt(params.destination));
  if (params.origin) {
    url.searchParams.set("origin", fmt(params.origin));
  }
  url.searchParams.set("travelmode", googleTravelMode(params.mode));
  return url.toString();
}

export function buildAppleMapsDirectionsUrl(params: {
  destination: LatLng;
  origin?: LatLng | null;
  mode?: TravelModeKey | string | null;
}): string {
  const url = new URL("https://maps.apple.com/");
  url.searchParams.set("daddr", fmt(params.destination));
  if (params.origin) {
    url.searchParams.set("saddr", fmt(params.origin));
  }
  url.searchParams.set("dirflg", appleDirFlag(params.mode));
  return url.toString();
}

export function buildWazeDirectionsUrl(params: {
  destination: LatLng;
  origin?: LatLng | null;
}): string {
  const url = new URL("https://waze.com/ul");
  url.searchParams.set("ll", fmt(params.destination));
  url.searchParams.set("navigate", "yes");
  if (params.origin) {
    url.searchParams.set("from", fmt(params.origin));
  }
  return url.toString();
}

/** Links Google / Waze / Apple quando o destino tem coordenadas. */
export function buildExternalMapsLinks(params: {
  destination: LatLng | null | undefined;
  origin?: LatLng | null;
  mode?: TravelModeKey | string | null;
}): ExternalMapsLink[] {
  const dest = params.destination;
  if (
    !dest ||
    !Number.isFinite(dest.lat) ||
    !Number.isFinite(dest.lng)
  ) {
    return [];
  }

  const common = {
    destination: dest,
    origin: params.origin ?? null,
    mode: params.mode,
  };

  return [
    {
      app: "google",
      label: "Google Maps",
      href: buildGoogleMapsDirectionsUrl(common),
    },
    {
      app: "waze",
      label: "Waze",
      href: buildWazeDirectionsUrl(common),
    },
    {
      app: "apple",
      label: "Apple Maps",
      href: buildAppleMapsDirectionsUrl(common),
    },
  ];
}
