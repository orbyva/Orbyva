import type {
  PlaceType,
  PlaceFilter,
  PlaceOpinionSummary,
  PlaceStatus,
  PlaceVisit,
} from "@/types/places";
import type { TripExpenseCategory } from "@/types/travel";

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

export function getAverageRating(
  places: { rating?: number | null; status?: PlaceStatus | null; visited_date?: string | null }[]
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

/** Agrega opiniões de vários membros sobre um lugar. */
export function summarizePlaceOpinions(
  opinions: {
    rating?: number | null;
    would_recommend?: boolean;
  }[]
): PlaceOpinionSummary {
  const rated = opinions.filter((o) => o.rating != null && o.rating > 0);
  const avgRating =
    rated.length > 0
      ? Math.round(
          (rated.reduce((s, o) => s + (o.rating ?? 0), 0) / rated.length) * 10
        ) / 10
      : null;
  const recommendYes = opinions.filter((o) => o.would_recommend !== false).length;
  const recommendNo = opinions.filter((o) => o.would_recommend === false).length;
  return {
    avgRating,
    ratedCount: rated.length,
    recommendYes,
    recommendNo,
    totalOpinions: opinions.length,
  };
}

export function formatRating(rating: number): string {
  return Number.isInteger(rating)
    ? String(rating)
    : rating.toFixed(1).replace(".", ",");
}

/** Mapeia tipo do lugar → categoria de gasto da viagem. */
export function placeTypeToExpenseCategory(
  type: PlaceType
): TripExpenseCategory {
  switch (type) {
    case "restaurant":
    case "cafe":
    case "bar":
      return "food";
    case "hotel":
      return "lodging";
    case "attraction":
    case "park":
    case "museum":
      return "activity";
    case "shop":
      return "shopping";
    default:
      return "other";
  }
}

/** Descrição padrão da despesa no extrato. */
export function placeLedgerDescription(
  place: { name: string; type?: PlaceType },
  tripTitle?: string | null
): string {
  const typeLabel = place.type ? PLACE_TYPE_LABELS[place.type] : "Lugar";
  const base = `${typeLabel}: ${place.name.trim()}`;
  return tripTitle?.trim() ? `${base} · ${tripTitle.trim()}` : base;
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

export function withNormalizedPlaceStatus(place: PlaceVisit): PlaceVisit {
  return {
    ...place,
    status: normalizePlaceStatus(place.status, place.visited_date),
  };
}
