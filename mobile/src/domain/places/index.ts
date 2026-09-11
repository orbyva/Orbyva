import type { PlaceFilter, PlaceStatus, PlaceType, PlaceVisit } from "@/types/places";

export { placeTypeMeta, PLACE_TYPE_META } from "@/domain/places/placeTypeMeta";
export type { PlaceTypeIconKey, PlaceTypeTone } from "@/domain/places/placeTypeMeta";

export const PLACE_TYPE_LABELS: Record<PlaceType, string> = {
  restaurant: "Restaurante",
  cafe: "Café",
  bar: "Bar",
  attraction: "Passeio",
  hotel: "Hotel",
  park: "Parque",
  museum: "Museu",
  shop: "Loja",
  other: "Outro",
};

export const PLACE_STATUS_LABELS: Record<PlaceStatus, string> = {
  to_visit: "Para visitar",
  visited: "Visitado",
};

export function normalizePlaceStatus(
  status?: string | null,
  visitedDate?: string | null
): PlaceStatus {
  if (status === "to_visit" || status === "visited") return status;
  return visitedDate ? "visited" : "to_visit";
}

export function withNormalizedPlaceStatus(place: PlaceVisit): PlaceVisit {
  return {
    ...place,
    status: normalizePlaceStatus(place.status, place.visited_date),
  };
}

export function mapsSearchUrl(place: {
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}): string | null {
  if (place.lat != null && place.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  }
  const q = place.address?.trim() || place.name.trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function getAverageRating(
  places: {
    rating?: number | null;
    status?: PlaceStatus | null;
    visited_date?: string | null;
  }[]
): number | null {
  const rated = places.filter(
    (p) =>
      normalizePlaceStatus(p.status, p.visited_date) !== "to_visit" &&
      p.rating != null &&
      p.rating > 0
  );
  if (rated.length === 0) return null;
  const sum = rated.reduce((acc, p) => acc + (p.rating ?? 0), 0);
  return Math.round((sum / rated.length) * 10) / 10;
}

export type PlaceRecommendFilter = "all" | "yes" | "no";
export type PlaceRatingFilter = "all" | "3" | "4" | "5";
export type PlaceTripFilter = "all" | "local" | string;

export function filterPlaces<
  T extends {
    name: string;
    type: PlaceType;
    status?: PlaceStatus | null;
    rating?: number | null;
    notes?: string | null;
    address?: string | null;
    trip_id?: string | null;
    visited_date?: string | null;
    would_recommend: boolean;
  },
>(
  places: T[],
  options: {
    category: PlaceFilter;
    search?: string;
    rating?: PlaceRatingFilter;
    recommend?: PlaceRecommendFilter;
    trip?: PlaceTripFilter;
    status?: PlaceStatus | "all";
  }
): T[] {
  const query = options.search?.trim().toLowerCase() ?? "";
  const statusFilter = options.status ?? "all";

  return places.filter((place) => {
    const status = normalizePlaceStatus(place.status, place.visited_date);
    if (statusFilter !== "all" && status !== statusFilter) return false;

    if (options.category !== "all") {
      if (options.category === "local" && place.trip_id) return false;
      if (options.category === "trip" && !place.trip_id) return false;
      if (
        options.category !== "local" &&
        options.category !== "trip" &&
        place.type !== options.category
      ) {
        return false;
      }
    }

    if (options.trip && options.trip !== "all") {
      if (options.trip === "local") {
        if (place.trip_id) return false;
      } else if (place.trip_id !== options.trip) {
        return false;
      }
    }

    if (options.rating && options.rating !== "all") {
      const min = Number(options.rating);
      if ((place.rating ?? 0) < min) return false;
    }

    if (options.recommend === "yes" && !place.would_recommend) return false;
    if (options.recommend === "no" && place.would_recommend) return false;

    if (query) {
      const haystack = [place.name, place.address, place.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });
}
