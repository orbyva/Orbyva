import type { PlaceType, PlaceFilter } from "@/types/places";

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

export const PLACE_TYPE_EMOJI: Record<PlaceType, string> = {
  restaurant: "🍽️",
  cafe: "☕",
  bar: "🍺",
  attraction: "📍",
  hotel: "🏨",
  park: "🌳",
  museum: "🏛️",
  shop: "🛍️",
  other: "📌",
};

export function getAverageRating(
  places: { rating?: number | null }[]
): number | null {
  const rated = places.filter((p) => p.rating != null && p.rating > 0);
  if (rated.length === 0) return null;
  const sum = rated.reduce((acc, p) => acc + (p.rating ?? 0), 0);
  return Math.round((sum / rated.length) * 10) / 10;
}

export function formatRating(rating: number): string {
  return Number.isInteger(rating)
    ? String(rating)
    : rating.toFixed(1).replace(".", ",");
}

export function getRatingLabel(rating: number): string {
  if (rating >= 4.5) return "Excelente";
  if (rating >= 3.5) return "Muito bom";
  if (rating >= 2.5) return "Bom";
  if (rating >= 1.5) return "Regular";
  return "Ruim";
}

export type PlaceRecommendFilter = "all" | "yes" | "no";
export type PlaceRatingFilter = "all" | "3" | "4" | "5";

export function filterPlaces<
  T extends {
    name: string;
    type: PlaceType;
    rating?: number | null;
    notes?: string | null;
    address?: string | null;
    trip_id?: string | null;
    would_recommend: boolean;
  },
>(
  places: T[],
  options: {
    category: PlaceFilter;
    search?: string;
    rating?: PlaceRatingFilter;
    recommend?: PlaceRecommendFilter;
  }
): T[] {
  const query = options.search?.trim().toLowerCase() ?? "";

  return places.filter((place) => {
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
