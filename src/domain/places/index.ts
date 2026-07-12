import type { PlaceType } from "@/types/places";

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

export function getRatingLabel(rating: number): string {
  if (rating >= 5) return "Excelente";
  if (rating >= 4) return "Muito bom";
  if (rating >= 3) return "Bom";
  if (rating >= 2) return "Regular";
  return "Ruim";
}
