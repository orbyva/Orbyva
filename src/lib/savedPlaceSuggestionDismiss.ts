import type { GeoAnchor } from "@/domain/travel/savedPlaceSuggestions";
import { isStopDismissed } from "@/domain/travel/savedPlaceSuggestions";

const PREFIX = "orbyva:saved-place-suggestions-dismissed:";

function storageKey(tripId: string): string {
  return `${PREFIX}${tripId}`;
}

function isAnchor(value: unknown): value is GeoAnchor {
  if (!value || typeof value !== "object") return false;
  const row = value as GeoAnchor;
  return (
    typeof row.lat === "number" &&
    typeof row.lng === "number" &&
    Number.isFinite(row.lat) &&
    Number.isFinite(row.lng)
  );
}

export function readDismissedSuggestionCities(tripId: string): GeoAnchor[] {
  if (!tripId) return [];
  try {
    const raw = localStorage.getItem(storageKey(tripId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAnchor).map((row) => ({
      name: typeof row.name === "string" ? row.name : "",
      lat: row.lat,
      lng: row.lng,
      place_id: row.place_id ?? null,
    }));
  } catch {
    return [];
  }
}

export function persistDismissedSuggestionCity(
  tripId: string,
  city: GeoAnchor
): GeoAnchor[] {
  const current = readDismissedSuggestionCities(tripId);
  if (isStopDismissed(city, current)) return current;
  const next = [...current, city];
  try {
    localStorage.setItem(storageKey(tripId), JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
  return next;
}
