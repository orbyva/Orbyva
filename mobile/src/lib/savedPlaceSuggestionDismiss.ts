import type { GeoAnchor } from "@/domain/travel/savedPlaceSuggestions";
import { isStopDismissed } from "@/domain/travel/savedPlaceSuggestions";
import { secureStoreAdapter } from "@/lib/secure-store";

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

function parseAnchors(raw: string | null): GeoAnchor[] {
  if (!raw) return [];
  try {
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

export async function readDismissedSuggestionCities(
  tripId: string
): Promise<GeoAnchor[]> {
  if (!tripId) return [];
  try {
    return parseAnchors(await secureStoreAdapter.getItem(storageKey(tripId)));
  } catch {
    return [];
  }
}

export async function persistDismissedSuggestionCity(
  tripId: string,
  city: GeoAnchor
): Promise<GeoAnchor[]> {
  const current = await readDismissedSuggestionCities(tripId);
  if (isStopDismissed(city, current)) return current;
  const next = [...current, city];
  try {
    await secureStoreAdapter.setItem(storageKey(tripId), JSON.stringify(next));
  } catch {
    /* quota / unavailable */
  }
  return next;
}
