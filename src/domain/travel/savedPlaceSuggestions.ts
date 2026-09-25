import { normalizePlaceStatus } from "@/domain/places";
import type { PlaceVisit } from "@/types/places";

/** Área metropolitana: Versailles entra em Paris; Lyon não. */
export const CITY_MATCH_RADIUS_KM = 40;

export type GeoAnchor = {
  name: string;
  lat: number;
  lng: number;
  place_id?: string | null;
};

export type SuggestionPlace = Pick<
  PlaceVisit,
  | "id"
  | "name"
  | "type"
  | "status"
  | "visited_date"
  | "trip_id"
  | "lat"
  | "lng"
>;

type StopLike = {
  name?: string | null;
  lat?: number | null;
  lng?: number | null;
  place_id?: string | null;
  start_date: string;
  end_date: string;
  sort_order?: number;
};

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function hasCoords<T extends { lat?: number | null; lng?: number | null }>(
  value: T
): value is T & { lat: number; lng: number } {
  return (
    typeof value.lat === "number" &&
    typeof value.lng === "number" &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng)
  );
}

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const earthKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function toGeoAnchor(
  value: {
    name?: string | null;
    lat?: number | null;
    lng?: number | null;
    place_id?: string | null;
  }
): GeoAnchor | null {
  if (!hasCoords(value)) return null;
  return {
    name: value.name?.trim() || "",
    lat: value.lat,
    lng: value.lng,
    place_id: value.place_id?.trim() || null,
  };
}

/**
 * Parada do dia com coordenadas. Sem paradas, cai no destino legado da viagem.
 */
export function suggestionAnchorForDay(params: {
  date: string | null | undefined;
  stops: StopLike[];
  fallback?: {
    name?: string | null;
    lat?: number | null;
    lng?: number | null;
    place_id?: string | null;
  } | null;
}): GeoAnchor | null {
  const date = params.date?.slice(0, 10) || null;
  if (date && params.stops.length > 0) {
    const matches = params.stops.filter(
      (stop) => stop.start_date <= date && date <= stop.end_date
    );
    let chosen: StopLike | null = null;
    if (matches.length === 1) {
      chosen = matches[0] ?? null;
    } else if (matches.length > 1) {
      const arriving = matches.filter((stop) => stop.start_date === date);
      const pool = arriving.length > 0 ? arriving : matches;
      chosen =
        [...pool].sort(
          (a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0)
        )[0] ?? null;
    }
    const fromStop = chosen ? toGeoAnchor(chosen) : null;
    if (fromStop) return fromStop;
    return null;
  }
  return params.fallback ? toGeoAnchor(params.fallback) : null;
}

export function collectItineraryPlaceIds(
  itinerary: { activities?: { place_visit_id?: string | null }[] }[]
): Set<string> {
  const ids = new Set<string>();
  for (const day of itinerary) {
    for (const act of day.activities ?? []) {
      if (act.place_visit_id) ids.add(act.place_visit_id);
    }
  }
  return ids;
}

export function isStopDismissed(
  stop: GeoAnchor,
  dismissed: GeoAnchor[],
  radiusKm = CITY_MATCH_RADIUS_KM
): boolean {
  const stopPlaceId = stop.place_id?.trim() || null;
  return dismissed.some((city) => {
    const cityPlaceId = city.place_id?.trim() || null;
    if (stopPlaceId && cityPlaceId && stopPlaceId === cityPlaceId) return true;
    return haversineKm(stop, city) <= radiusKm;
  });
}

export function isEligibleSuggestionPlace(
  place: SuggestionPlace,
  tripId: string,
  itineraryPlaceIds: ReadonlySet<string>
): boolean {
  if (itineraryPlaceIds.has(place.id)) return false;
  if (normalizePlaceStatus(place.status, place.visited_date) !== "to_visit") {
    return false;
  }
  const linkedTrip = place.trip_id ?? null;
  if (linkedTrip && linkedTrip !== tripId) return false;
  return hasCoords(place);
}

export function uniquePlacesById<T extends { id: string }>(places: T[]): T[] {
  const byId = new Map<string, T>();
  for (const place of places) {
    if (!byId.has(place.id)) byId.set(place.id, place);
  }
  return [...byId.values()];
}

export function suggestionsForAnchor<T extends SuggestionPlace>(params: {
  candidates: T[];
  anchor: GeoAnchor;
  tripId: string;
  itineraryPlaceIds: ReadonlySet<string>;
  dismissed: GeoAnchor[];
  radiusKm?: number;
}): T[] {
  const radiusKm = params.radiusKm ?? CITY_MATCH_RADIUS_KM;
  if (isStopDismissed(params.anchor, params.dismissed, radiusKm)) return [];

  return uniquePlacesById(params.candidates)
    .filter((place) =>
      isEligibleSuggestionPlace(place, params.tripId, params.itineraryPlaceIds)
    )
    .filter((place) => {
      if (!hasCoords(place)) return false;
      return haversineKm(params.anchor, place) <= radiusKm;
    })
    .sort((a, b) => {
      const aOnTrip = a.trip_id === params.tripId ? 0 : 1;
      const bOnTrip = b.trip_id === params.tripId ? 0 : 1;
      if (aOnTrip !== bOnTrip) return aOnTrip - bOnTrip;
      return a.name.localeCompare(b.name, "pt");
    });
}

export function suggestionHeading(count: number, cityName: string): string {
  const city = cityName.trim();
  const where = city ? `em ${city}` : "neste destino";
  if (count === 1) return `Você salvou 1 lugar ${where}`;
  return `Você tem ${count} lugares salvos ${where}`;
}
