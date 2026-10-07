import { formatRating, getAverageRating, normalizePlaceStatus } from "@/domain/places";
import type { PlaceStatus, PlaceType, PlaceVisit } from "@/types/places";

type PlaceLike = Pick<
  PlaceVisit,
  "type" | "status" | "visited_date" | "rating" | "would_recommend"
>;

export interface PlacesOverview {
  visited: number;
  toVisit: number;
  /** "4,3" — nulo enquanto nenhum visitado tiver nota. */
  avgRating: string | null;
  /** 0–100 — nulo enquanto não houver visitado. */
  recommendPct: number | null;
}

/** Números do cartão de resumo do topo. */
export function placesOverview(places: PlaceLike[]): PlacesOverview {
  const visited = places.filter(
    (p) => normalizePlaceStatus(p.status, p.visited_date) === "visited"
  );
  const avg = getAverageRating(places);
  const recommend = visited.filter((p) => p.would_recommend !== false).length;
  return {
    visited: visited.length,
    toVisit: places.length - visited.length,
    avgRating: avg == null ? null : formatRating(avg),
    recommendPct: visited.length > 0 ? Math.round((recommend / visited.length) * 100) : null,
  };
}

/** Tipos presentes na aba, do mais frequente ao menos (empate: ordem de `PlaceType`). */
export function placeTypeCounts(
  places: PlaceLike[],
  status: PlaceStatus
): { type: PlaceType; count: number }[] {
  const counts = new Map<PlaceType, number>();
  for (const p of places) {
    if (normalizePlaceStatus(p.status, p.visited_date) !== status) continue;
    counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

const PAIS = /^(brasil|brazil)$/i;
const CEP = /^\d{5}-?\d{3}$/;

/**
 * "Bairro, Cidade" a partir do endereço formatado do Google
 * ("R. Augusta, 1500 - Consolação, São Paulo - SP, 01304-001, Brasil" → "Consolação, São Paulo").
 * Endereço que não segue o formato volta inteiro.
 */
export function placeShortAddress(address?: string | null): string | null {
  const raw = address?.trim();
  if (!raw) return null;
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && !PAIS.test(p) && !CEP.test(p));
  if (parts.length < 2) return raw;
  const city = parts[parts.length - 1].replace(/\s+-\s+[A-Z]{2}$/, "");
  const before = parts[parts.length - 2];
  const bairro = before.includes(" - ") ? before.split(" - ").pop()?.trim() : null;
  return bairro && bairro !== city ? `${bairro}, ${city}` : city;
}

export type PlaceCardBadge =
  | { kind: "rating"; label: string }
  | { kind: "recommend"; label: string; positive: boolean }
  | { kind: "trip"; label: string }
  | { kind: "date"; label: string };

/** Selos do cartão: nota (do grupo quando há mais de uma opinião), recomendação, viagem e data. */
export function placeCardBadges(
  place: PlaceLike & Pick<PlaceVisit, "opinionSummary" | "trip">,
  formatDate: (iso: string) => string
): PlaceCardBadge[] {
  const badges: PlaceCardBadge[] = [];
  const visited = normalizePlaceStatus(place.status, place.visited_date) === "visited";
  const grupo = place.opinionSummary;
  if (grupo && grupo.totalOpinions > 1 && grupo.avgRating != null) {
    badges.push({
      kind: "rating",
      label: `${formatRating(grupo.avgRating)} · ${grupo.totalOpinions} opiniões`,
    });
  } else if (place.rating && place.rating > 0) {
    badges.push({ kind: "rating", label: formatRating(place.rating) });
  }
  if (visited) {
    badges.push(
      place.would_recommend === false
        ? { kind: "recommend", label: "Não recomendo", positive: false }
        : { kind: "recommend", label: "Recomendo", positive: true }
    );
  }
  if (place.trip?.title) badges.push({ kind: "trip", label: place.trip.title });
  if (visited && place.visited_date) {
    badges.push({ kind: "date", label: formatDate(place.visited_date) });
  }
  return badges;
}
