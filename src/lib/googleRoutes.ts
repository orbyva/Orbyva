/**
 * Cliente Google Routes via Edge Function `places-catalog`.
 */
import { supabase } from "@/lib/supabase";
import {
  ROUTE_CACHE_TTL_MS,
  type TravelModeKey,
} from "@/domain/itinerary/travelModes";

export type LatLng = { lat: number; lng: number };

export type RouteLegResult = {
  mode: TravelModeKey | string;
  durationSeconds: number | null;
  distanceMeters: number | null;
  available: boolean;
  error?: string;
  cached?: boolean;
  quotaSkipped?: boolean;
};

type InvokeErr = { error?: string; code?: string; detail?: string };

const routeCache = new Map<string, { at: number; result: RouteLegResult }>();
const inflight = new Map<string, Promise<RouteLegResult[]>>();

export class RoutesNotConfiguredError extends Error {
  readonly code = "ROUTES_NOT_CONFIGURED";
  constructor(message = "Cálculo de rotas temporariamente indisponível.") {
    super(message);
    this.name = "RoutesNotConfiguredError";
  }
}

export class MapsQuotaExceededError extends Error {
  readonly code = "MAPS_QUOTA_EXCEEDED";
  constructor(
    message = "Limite gratuito de rotas atingido. Novos trajetos liberam no próximo mês."
  ) {
    super(message);
    this.name = "MapsQuotaExceededError";
  }
}

function publicError(raw: string | undefined, fallback: string): string {
  if (!raw?.trim()) return fallback;
  if (/google|maps|routes|api.?key/i.test(raw)) return fallback;
  return raw;
}

function monthPeriodKey(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function cacheKey(
  origin: LatLng,
  destination: LatLng,
  mode: string
): string {
  return [
    origin.lat.toFixed(5),
    origin.lng.toFixed(5),
    destination.lat.toFixed(5),
    destination.lng.toFixed(5),
    mode,
    monthPeriodKey(),
  ].join("|");
}

function readCache(
  origin: LatLng,
  destination: LatLng,
  mode: string
): RouteLegResult | null {
  const key = cacheKey(origin, destination, mode);
  const hit = routeCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ROUTE_CACHE_TTL_MS) {
    routeCache.delete(key);
    return null;
  }
  return hit.result;
}

function writeCache(
  origin: LatLng,
  destination: LatLng,
  result: RouteLegResult
): void {
  routeCache.set(cacheKey(origin, destination, result.mode), {
    at: Date.now(),
    result,
  });
}

export function clearRouteCache(): void {
  routeCache.clear();
  inflight.clear();
}

export async function fetchTravelRoutes(params: {
  origin: LatLng;
  destination: LatLng;
  modes: TravelModeKey[];
  /** Incrementar para cancelar lógica no caller (AbortSignal). */
  signal?: AbortSignal;
}): Promise<RouteLegResult[]> {
  const allowed: TravelModeKey[] = ["DRIVE", "TRANSIT", "BICYCLE", "WALK"];
  const modes = [...new Set(params.modes)].filter((m): m is TravelModeKey =>
    allowed.includes(m)
  );
  if (modes.length === 0) return [];

  const cached: RouteLegResult[] = [];
  const missing: TravelModeKey[] = [];
  for (const mode of modes) {
    if (params.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const hit = readCache(params.origin, params.destination, mode);
    if (hit) cached.push(hit);
    else missing.push(mode);
  }

  if (missing.length === 0) {
    return modes.map(
      (m) =>
        cached.find((c) => c.mode === m) ?? {
          mode: m,
          durationSeconds: null,
          distanceMeters: null,
          available: false,
        }
    );
  }

  const batchKey = [
    params.origin.lat.toFixed(5),
    params.origin.lng.toFixed(5),
    params.destination.lat.toFixed(5),
    params.destination.lng.toFixed(5),
    missing.slice().sort().join(","),
    monthPeriodKey(),
  ].join("|");

  let pending = inflight.get(batchKey);
  if (!pending) {
    pending = (async () => {
      const { data, error } = await supabase.functions.invoke("places-catalog", {
        body: {
          action: "routes",
          origin: params.origin,
          destination: params.destination,
          modes: missing,
        },
      });

      if (error) {
        throw new Error(
          publicError(error.message, "Não foi possível calcular o trajeto.")
        );
      }

      const payload = data as
        | ({ routes?: RouteLegResult[] } & InvokeErr)
        | null;

      if (!payload) {
        throw new Error("Não foi possível calcular o trajeto.");
      }
      if (payload.code === "ROUTES_NOT_CONFIGURED") {
        throw new RoutesNotConfiguredError();
      }
      if (payload.code === "MAPS_QUOTA_EXCEEDED") {
        throw new MapsQuotaExceededError(
          payload.error ||
            "Limite gratuito de rotas atingido. Novos trajetos liberam no próximo mês."
        );
      }
      if (payload.error) {
        throw new Error(
          publicError(payload.error, "Não foi possível calcular o trajeto.")
        );
      }

      const results = payload.routes ?? [];
      for (const r of results) {
        writeCache(params.origin, params.destination, r);
      }
      return results;
    })().finally(() => {
      inflight.delete(batchKey);
    });

    inflight.set(batchKey, pending);
  }

  const fetched = await pending;
  if (params.signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const byMode = new Map<string, RouteLegResult>();
  for (const r of cached) byMode.set(r.mode, r);
  for (const r of fetched) byMode.set(r.mode, r);

  return modes.map(
    (m) =>
      byMode.get(m) ?? {
        mode: m,
        durationSeconds: null,
        distanceMeters: null,
        available: false,
      }
  );
}
