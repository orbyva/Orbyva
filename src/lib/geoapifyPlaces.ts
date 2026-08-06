/**
 * Cliente Geoapify (busca) via Edge Function `places-catalog`.
 */
import { supabase } from "@/lib/supabase";
import type { PlaceType } from "@/types/places";

export type PlaceSearchHit = {
  placeId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  category: string | null;
  distanceMeters: number | null;
};

type InvokeErr = { error?: string; code?: string; detail?: string };

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const searchCache = new Map<string, { at: number; hits: PlaceSearchHit[] }>();

export class GeoapifyNotConfiguredError extends Error {
  readonly code = "GEOAPIFY_NOT_CONFIGURED";
  constructor(message = "Busca de lugares temporariamente indisponível.") {
    super(message);
    this.name = "GeoapifyNotConfiguredError";
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

function publicError(raw: string | undefined, fallback: string): string {
  if (!raw?.trim()) return fallback;
  if (/geoapify|google|maps|routes|api.?key/i.test(raw)) return fallback;
  return raw;
}

function throwFromPayload(payload: InvokeErr | null, fallback: string): never {
  if (payload?.code === "GEOAPIFY_NOT_CONFIGURED") {
    throw new GeoapifyNotConfiguredError();
  }
  if (payload?.code === "MAPS_QUOTA_EXCEEDED") {
    throw new MapsQuotaExceededError(
      payload.error ||
        "Limite gratuito de mapas atingido. Novas buscas liberam no próximo período."
    );
  }
  throw new Error(publicError(payload?.error, fallback));
}

/** Lê o JSON do corpo quando a edge responde 4xx/5xx (supabase-js deixa em error.context). */
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

async function invokeSearch(
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<{ places: PlaceSearchHit[] }> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const { data, error } = await supabase.functions.invoke("places-catalog", {
    body: { action: "search", ...body },
    signal,
  });

  // supabase-js não propaga AbortError — devolve FunctionsFetchError.
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

  const payload = data as ({ places?: PlaceSearchHit[] } & InvokeErr) | null;
  if (!payload) {
    throw new Error("Não foi possível buscar lugares.");
  }
  if (payload.code || payload.error) {
    throwFromPayload(payload, "Não foi possível buscar lugares.");
  }
  return { places: payload.places ?? [] };
}

export function mapGeoapifyCategoryToPlaceType(
  category: string | null | undefined
): PlaceType {
  const c = (category ?? "").toLowerCase();
  if (c.includes("restaurant") || c.includes("catering.restaurant")) {
    return "restaurant";
  }
  if (c.includes("cafe") || c.includes("coffee")) return "cafe";
  if (c.includes("bar") || c.includes("pub")) return "bar";
  if (c.includes("hotel") || c.includes("accommodation")) return "hotel";
  if (c.includes("park")) return "park";
  if (c.includes("museum")) return "museum";
  if (c.includes("shop") || c.includes("commercial")) return "shop";
  if (
    c.includes("attraction") ||
    c.includes("tourism") ||
    c.includes("stadium") ||
    c.includes("cinema")
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

export async function searchPlaces(params: {
  query: string;
  category?: string | null;
  lat?: number | null;
  lng?: number | null;
  signal?: AbortSignal;
}): Promise<PlaceSearchHit[]> {
  const query = params.query.trim();
  const category = (params.category ?? "").trim();
  if (query.length < 2 && !category) return [];
  if (params.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const cacheKey = [
    query.toLowerCase(),
    category,
    params.lat?.toFixed(3) ?? "",
    params.lng?.toFixed(3) ?? "",
  ].join("|");

  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) {
    return cached.hits;
  }

  const { places } = await invokeSearch(
    {
      query,
      category: category || undefined,
      lat: params.lat ?? undefined,
      lng: params.lng ?? undefined,
    },
    params.signal
  );

  if (params.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const hits = places.slice(0, 10);
  searchCache.set(cacheKey, { at: Date.now(), hits });
  return hits;
}
