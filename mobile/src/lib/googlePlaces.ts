/**
 * Cliente Google Places Autocomplete (New) via Edge Function `places-catalog`.
 */
import { supabase } from "@/lib/supabase";
import type { PlaceType } from "@/types/places";

export type PlaceSearchHit = {
  placeId: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  category: string | null;
  distanceMeters: number | null;
};

type InvokeErr = { error?: string; code?: string; detail?: string };

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const searchCache = new Map<string, { at: number; hits: PlaceSearchHit[] }>();

export class PlacesNotConfiguredError extends Error {
  readonly code = "PLACES_NOT_CONFIGURED";
  constructor(message = "Busca de lugares temporariamente indisponível.") {
    super(message);
    this.name = "PlacesNotConfiguredError";
  }
}

export class MapsQuotaExceededError extends Error {
  readonly code = "MAPS_QUOTA_EXCEEDED";
  constructor(
    message = "Limite gratuito de mapas atingido. Novas buscas liberam no próximo período."
  ) {
    super(message);
    this.name = "MapsQuotaExceededError";
  }
}

export class DestinationNotFoundError extends Error {
  readonly code = "DESTINATION_NOT_FOUND";
  constructor(message = "Destino não encontrado.") {
    super(message);
    this.name = "DestinationNotFoundError";
  }
}

export class LocationDeniedError extends Error {
  readonly code = "LOCATION_DENIED";
  constructor(
    message = "Localização negada. Autorize o GPS para buscar lugares próximos."
  ) {
    super(message);
    this.name = "LocationDeniedError";
  }
}

function publicError(raw: string | undefined, fallback: string): string {
  if (!raw?.trim()) return fallback;
  if (/google|maps|places|routes|api.?key/i.test(raw)) return fallback;
  return raw;
}

function throwFromPayload(payload: InvokeErr | null, fallback: string): never {
  if (payload?.code === "PLACES_NOT_CONFIGURED") {
    throw new PlacesNotConfiguredError();
  }
  if (payload?.code === "MAPS_QUOTA_EXCEEDED") {
    throw new MapsQuotaExceededError(
      payload.error ||
        "Limite gratuito de busca de lugares atingido. Novas buscas liberam no próximo mês."
    );
  }
  if (payload?.code === "DESTINATION_NOT_FOUND") {
    throw new DestinationNotFoundError(payload.error);
  }
  throw new Error(publicError(payload?.error, fallback));
}

async function payloadFromInvokeError(
  error: { message?: string; context?: unknown } | null
): Promise<InvokeErr | null> {
  const ctx = error?.context;
  if (!ctx || typeof ctx !== "object") return null;
  if (typeof (ctx as Response).json === "function") {
    try {
      return (await (ctx as Response).clone().json()) as InvokeErr;
    } catch {
      return null;
    }
  }
  return null;
}

async function invokePlaces(
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const { data, error } = await supabase.functions.invoke("places-catalog", {
    body,
    signal,
  });

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  if (error) {
    const fromBody = await payloadFromInvokeError(error);
    if (fromBody?.code || fromBody?.error) {
      throwFromPayload(fromBody, "Não foi possível buscar lugares.");
    }
    throw new Error(
      publicError(error.message, "Não foi possível buscar lugares.")
    );
  }

  const payload = data as (Record<string, unknown> & InvokeErr) | null;
  if (!payload) {
    throw new Error("Não foi possível buscar lugares.");
  }
  if (payload.code === "DESTINATION_NOT_FOUND" && Array.isArray(payload.places)) {
    return payload;
  }
  if (payload.code || payload.error) {
    throwFromPayload(payload, "Não foi possível buscar lugares.");
  }
  return payload;
}

export function mapPlaceCategoryToPlaceType(
  category: string | null | undefined
): PlaceType {
  const c = (category ?? "").toLowerCase();
  if (c.includes("restaurant")) return "restaurant";
  if (c.includes("cafe") || c.includes("coffee")) return "cafe";
  if (c.includes("bar") || c.includes("night_club")) return "bar";
  if (c.includes("hotel") || c.includes("lodging")) return "hotel";
  if (c.includes("park")) return "park";
  if (c.includes("museum")) return "museum";
  if (c.includes("shop") || c.includes("store") || c.includes("shopping")) {
    return "shop";
  }
  if (
    c.includes("attraction") ||
    c.includes("tourist") ||
    c.includes("stadium") ||
    c.includes("amusement")
  ) {
    return "attraction";
  }
  return "other";
}

export function formatDistanceMeters(
  meters: number | null | undefined
): string | null {
  if (meters == null || !Number.isFinite(meters) || meters < 0) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

export function clearPlaceSearchCache(): void {
  searchCache.clear();
}

export type PlaceSearchScope = "all" | "regions";

/** Tipos Places Autocomplete para destino de viagem (país / estado / cidade). */
export const REGION_PRIMARY_TYPES = [
  "country",
  "administrative_area_level_1",
  "locality",
] as const;

export async function searchPlaces(params: {
  query: string;
  lat?: number | null;
  lng?: number | null;
  /** `regions` = só país / estado / cidade (destino de viagem). */
  scope?: PlaceSearchScope;
  signal?: AbortSignal;
}): Promise<PlaceSearchHit[]> {
  const query = params.query.trim();
  if (query.length < 2) return [];
  if (params.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const scope = params.scope ?? "all";
  const cacheKey = [
    query.toLowerCase(),
    params.lat?.toFixed(3) ?? "",
    params.lng?.toFixed(3) ?? "",
    scope,
  ].join("|");

  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) {
    return cached.hits;
  }

  const payload = await invokePlaces(
    {
      action: "search",
      query,
      lat: params.lat ?? undefined,
      lng: params.lng ?? undefined,
      includedPrimaryTypes:
        scope === "regions" ? [...REGION_PRIMARY_TYPES] : undefined,
    },
    params.signal
  );

  const hits = ((payload.places as PlaceSearchHit[]) ?? []).slice(0, 10);
  searchCache.set(cacheKey, { at: Date.now(), hits });
  return hits;
}

/** Resolve lat/lng do placeId via Routes endLocation (WALK / Essentials). */
export async function resolvePlaceLocation(params: {
  placeId: string;
  signal?: AbortSignal;
}): Promise<{ lat: number; lng: number; placeId: string }> {
  const payload = await invokePlaces(
    {
      action: "resolve",
      placeId: params.placeId,
    },
    params.signal
  );
  const lat = payload.lat as number | undefined;
  const lng = payload.lng as number | undefined;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    throw new DestinationNotFoundError();
  }
  return {
    placeId: String(payload.placeId ?? params.placeId),
    lat,
    lng,
  };
}
