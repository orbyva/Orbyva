/**
 * Proxy autenticado:
 * - Geoapify Places / Autocomplete (busca)
 * - Google Routes API (trajetos)
 *
 * Secrets: GEOAPIFY_API_KEY, GOOGLE_ROUTES_API_KEY
 *
 * Ações:
 *   { action: "search", query, category?, lat?, lng? }
 *   { action: "route", origin, destination, mode }
 *   { action: "routes", origin, destination, modes? }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeadersForRequest } from "../_shared/cors.ts";
import {
  blockProviderUntilPeriodEnd,
  createMapsAdminClient,
  looksLikeBillingOrQuotaError,
  periodEndUtc,
  periodKeyFor,
  quotaDeniedPayload,
  quotaProviderForTravelMode,
  tryConsumeQuota,
} from "../_shared/mapsQuota.ts";

const GEOAPIFY_AUTOCOMPLETE =
  "https://api.geoapify.com/v1/geocode/autocomplete";
const GEOAPIFY_PLACES = "https://api.geoapify.com/v2/places";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

const ROUTE_FIELD_MASK =
  "routes.duration,routes.distanceMeters,routes.legs.duration,routes.legs.distanceMeters";

type LatLng = { lat: number; lng: number };

type TravelMode = "DRIVE" | "TRANSIT" | "BICYCLE" | "WALK";

const ALL_MODES: TravelMode[] = ["DRIVE", "TRANSIT", "BICYCLE", "WALK"];

type RouteResult = {
  mode: TravelMode;
  durationSeconds: number | null;
  distanceMeters: number | null;
  available: boolean;
  error?: string;
  cached?: boolean;
  quotaSkipped?: boolean;
};

/** Cache em memória: origem|destino|modo|período → resultado. */
const routeCache = new Map<string, { at: number; result: RouteResult; expiresAt: number }>();
const ROUTE_CACHE_SOFT_TTL_MS = 7 * 60 * 1000;

function routeCacheKey(
  origin: LatLng,
  destination: LatLng,
  mode: TravelMode,
  periodKey: string
): string {
  return [
    origin.lat.toFixed(5),
    origin.lng.toFixed(5),
    destination.lat.toFixed(5),
    destination.lng.toFixed(5),
    mode,
    periodKey,
  ].join("|");
}

function readRouteCache(
  origin: LatLng,
  destination: LatLng,
  mode: TravelMode,
  periodKey: string
): RouteResult | null {
  const key = routeCacheKey(origin, destination, mode, periodKey);
  const hit = routeCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    routeCache.delete(key);
    return null;
  }
  return { ...hit.result, cached: true };
}

function writeRouteCache(
  origin: LatLng,
  destination: LatLng,
  mode: TravelMode,
  periodKey: string,
  periodEndMs: number,
  result: RouteResult
): void {
  const key = routeCacheKey(origin, destination, mode, periodKey);
  const soft = Date.now() + ROUTE_CACHE_SOFT_TTL_MS;
  routeCache.set(key, {
    at: Date.now(),
    result: { ...result, cached: undefined },
    expiresAt: Math.min(soft, periodEndMs),
  });
}

/** Orbyva PlaceType / UI category → Geoapify Places categories. */
const CATEGORY_MAP: Record<string, string> = {
  restaurant: "catering.restaurant",
  cafe: "catering.cafe",
  bar: "catering.bar",
  hotel: "accommodation.hotel",
  park: "leisure.park",
  museum: "entertainment.museum",
  cinema: "entertainment.cinema",
  stadium: "sport.stadium",
  attraction: "tourism.attraction",
  shop: "commercial",
  other: "",
};

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersForRequest(req),
      "Content-Type": "application/json",
    },
  });
}

function isFiniteLatLng(p: unknown): p is LatLng {
  if (!p || typeof p !== "object") return false;
  const { lat, lng } = p as LatLng;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

function parseDurationSeconds(duration?: string): number | null {
  if (!duration) return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(duration.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function haversineMeters(
  a: LatLng,
  b: LatLng
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

type GeoFeature = {
  properties?: {
    place_id?: string | number;
    name?: string;
    formatted?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    suburb?: string;
    lat?: number;
    lon?: number;
    category?: string;
    result_type?: string;
    distance?: number;
    datasource?: { raw?: { name?: string } };
  };
  geometry?: { coordinates?: [number, number] };
};

function serializeGeoFeature(
  f: GeoFeature,
  bias: LatLng | null
) {
  const p = f.properties ?? {};
  const lon = p.lon ?? f.geometry?.coordinates?.[0];
  const lat = p.lat ?? f.geometry?.coordinates?.[1];
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  const name =
    p.name?.trim() ||
    p.datasource?.raw?.name?.trim() ||
    p.address_line1?.trim() ||
    p.formatted?.trim();
  if (!name) return null;

  const address =
    p.formatted?.trim() ||
    [p.address_line1, p.address_line2, p.city].filter(Boolean).join(", ") ||
    null;

  let distanceMeters =
    typeof p.distance === "number" && Number.isFinite(p.distance)
      ? Math.round(p.distance)
      : null;
  if (distanceMeters == null && bias) {
    distanceMeters = Math.round(haversineMeters(bias, { lat, lng: lon }));
  }

  return {
    placeId: String(p.place_id ?? `${lat},${lon}`),
    name,
    address,
    lat,
    lng: lon,
    category: p.category ?? p.result_type ?? null,
    distanceMeters,
  };
}

async function fetchWithTimeout(
  url: string,
  ms = 8_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw Object.assign(new Error("Geoapify timeout"), {
        status: 504,
        detail: "upstream timeout",
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function searchGeoapify(params: {
  apiKey: string;
  query: string;
  category?: string;
  lat?: number;
  lng?: number;
}): Promise<unknown[]> {
  const limit = 10;
  const bias =
    typeof params.lat === "number" &&
    typeof params.lng === "number" &&
    Number.isFinite(params.lat) &&
    Number.isFinite(params.lng)
      ? { lat: params.lat, lng: params.lng }
      : null;

  const categoryKey = (params.category ?? "").trim().toLowerCase();
  const geoCategory = CATEGORY_MAP[categoryKey] ?? "";

  // Categoria com proximidade → Places API.
  if (geoCategory && bias) {
    const url = new URL(GEOAPIFY_PLACES);
    url.searchParams.set("categories", geoCategory);
    url.searchParams.set("filter", `circle:${bias.lng},${bias.lat},25000`);
    url.searchParams.set("bias", `proximity:${bias.lng},${bias.lat}`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("lang", "pt");
    url.searchParams.set("apiKey", params.apiKey);
    if (params.query.trim()) {
      url.searchParams.set("name", params.query.trim());
    }

    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) {
      const text = await res.text();
      throw Object.assign(new Error(`Geoapify places: ${res.status}`), {
        status: res.status === 429 ? 429 : 502,
        detail: text,
      });
    }
    const data = (await res.json()) as { features?: GeoFeature[] };
    return (data.features ?? [])
      .map((f) => serializeGeoFeature(f, bias))
      .filter(Boolean);
  }

  // Nome / texto → Autocomplete.
  const url = new URL(GEOAPIFY_AUTOCOMPLETE);
  url.searchParams.set("text", params.query.trim());
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("lang", "pt");
  url.searchParams.set("filter", "countrycode:br");
  url.searchParams.set("apiKey", params.apiKey);
  if (bias) {
    url.searchParams.set("bias", `proximity:${bias.lng},${bias.lat}`);
  }

  const res = await fetchWithTimeout(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(`Geoapify autocomplete: ${res.status}`), {
      status: res.status === 429 ? 429 : 502,
      detail: text,
    });
  }
  const data = (await res.json()) as { features?: GeoFeature[] };
  return (data.features ?? [])
    .map((f) => serializeGeoFeature(f, bias))
    .filter(Boolean)
    .slice(0, limit);
}

async function computeRoute(params: {
  apiKey: string;
  origin: LatLng;
  destination: LatLng;
  mode: TravelMode;
}): Promise<RouteResult> {
  const body: Record<string, unknown> = {
    origin: {
      location: {
        latLng: {
          latitude: params.origin.lat,
          longitude: params.origin.lng,
        },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: params.destination.lat,
          longitude: params.destination.lng,
        },
      },
    },
    travelMode: params.mode,
    languageCode: "pt-BR",
    regionCode: "BR",
  };

  // Carro com tráfego → SKU Pro (não Essentials).
  if (params.mode === "DRIVE") {
    body.routingPreference = "TRAFFIC_AWARE";
  }

  const res = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": params.apiKey,
      "X-Goog-FieldMask": ROUTE_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    if (looksLikeBillingOrQuotaError(res.status, text)) {
      return {
        mode: params.mode,
        durationSeconds: null,
        distanceMeters: null,
        available: false,
        error: `billing:${res.status}:${text.slice(0, 120)}`,
      };
    }
    if (res.status === 400 || res.status === 404) {
      return {
        mode: params.mode,
        durationSeconds: null,
        distanceMeters: null,
        available: false,
        error: `unavailable:${res.status}`,
      };
    }
    return {
      mode: params.mode,
      durationSeconds: null,
      distanceMeters: null,
      available: false,
      error: `Routes ${res.status}: ${text.slice(0, 200)}`,
    };
  }

  const data = (await res.json()) as {
    routes?: Array<{ duration?: string; distanceMeters?: number }>;
  };
  const route = data.routes?.[0];
  if (!route) {
    return {
      mode: params.mode,
      durationSeconds: null,
      distanceMeters: null,
      available: false,
    };
  }

  return {
    mode: params.mode,
    durationSeconds: parseDurationSeconds(route.duration),
    distanceMeters: route.distanceMeters ?? null,
    available: true,
  };
}

/**
 * Reserva 1 unidade da cota correta e calcula a rota (ou usa cache).
 * Cache hit não consome cota.
 */
async function computeRouteWithQuota(params: {
  admin: ReturnType<typeof createMapsAdminClient>;
  apiKey: string;
  origin: LatLng;
  destination: LatLng;
  mode: TravelMode;
}): Promise<RouteResult> {
  const provider = quotaProviderForTravelMode(params.mode);
  if (!provider) {
    return {
      mode: params.mode,
      durationSeconds: null,
      distanceMeters: null,
      available: false,
      error: "unsupported_mode",
      quotaSkipped: true,
    };
  }

  const periodKey = periodKeyFor(provider);
  const cached = readRouteCache(
    params.origin,
    params.destination,
    params.mode,
    periodKey
  );
  if (cached) return cached;

  const quota = await tryConsumeQuota(params.admin, provider, 1);
  if (!quota.ok) {
    return {
      mode: params.mode,
      durationSeconds: null,
      distanceMeters: null,
      available: false,
      quotaSkipped: true,
      error: `quota:${quota.reason}`,
    };
  }

  const result = await computeRoute({
    apiKey: params.apiKey,
    origin: params.origin,
    destination: params.destination,
    mode: params.mode,
  });

  if (result.error?.startsWith("billing:")) {
    await blockProviderUntilPeriodEnd(params.admin, provider);
  } else if (result.available) {
    writeRouteCache(
      params.origin,
      params.destination,
      params.mode,
      periodKey,
      periodEndUtc(provider).getTime(),
      result
    );
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersForRequest(req) });
  }

  try {
    if (req.method !== "POST") {
      return json(req, { error: "Method not allowed" }, 405);
    }

    const geoKey = (Deno.env.get("GEOAPIFY_API_KEY") ?? "").trim();
    const routesKey = (Deno.env.get("GOOGLE_ROUTES_API_KEY") ?? "").trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createMapsAdminClient();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(req, { error: "Não autenticado" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return json(req, { error: "Não autenticado" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      query?: string;
      category?: string;
      lat?: number;
      lng?: number;
      origin?: LatLng;
      destination?: LatLng;
      mode?: string;
      modes?: string[];
    };

    if (body.action === "search") {
      if (!geoKey) {
        return json(
          req,
          { error: "Busca de lugares não configurada", code: "GEOAPIFY_NOT_CONFIGURED" },
          503
        );
      }
      const query = (body.query ?? "").trim();
      const category = (body.category ?? "").trim();
      if (query.length < 2 && !category) {
        return json(req, { places: [] });
      }

      const quota = await tryConsumeQuota(admin, "geoapify", 1);
      if (!quota.ok) {
        return json(req, quotaDeniedPayload(quota, "geoapify"), 429);
      }

      try {
        const places = await searchGeoapify({
          apiKey: geoKey,
          query: query || category || "place",
          category: category || undefined,
          lat: body.lat,
          lng: body.lng,
        });
        return json(req, { places });
      } catch (err) {
        const e = err as Error & { status?: number; detail?: string };
        if (
          e.status &&
          looksLikeBillingOrQuotaError(e.status, e.detail ?? e.message)
        ) {
          await blockProviderUntilPeriodEnd(admin, "geoapify");
          return json(
            req,
            quotaDeniedPayload(
              {
                ok: false,
                reason: "blocked",
                limit: quota.limit,
                used: quota.used,
              },
              "geoapify"
            ),
            429
          );
        }
        return json(
          req,
          { error: e.message, detail: e.detail },
          e.status ?? 502
        );
      }
    }

    if (body.action === "route" || body.action === "routes") {
      if (!routesKey) {
        return json(
          req,
          {
            error: "Rotas não configuradas",
            code: "ROUTES_NOT_CONFIGURED",
          },
          503
        );
      }
      if (!isFiniteLatLng(body.origin) || !isFiniteLatLng(body.destination)) {
        return json(req, { error: "origin e destination obrigatórios" }, 400);
      }

      const rawModes =
        body.action === "route"
          ? [body.mode ?? "DRIVE"]
          : (body.modes ?? ALL_MODES);

      // Ignora TWO_WHEELER e qualquer modo fora da lista.
      const uniqueModes = [
        ...new Set(
          rawModes
            .map((m) => String(m).toUpperCase())
            .filter((m): m is TravelMode =>
              ALL_MODES.includes(m as TravelMode)
            )
        ),
      ];

      if (uniqueModes.length === 0) {
        return json(req, { error: "Nenhuma modalidade válida", modes: [] }, 400);
      }

      const results = await Promise.all(
        uniqueModes.map((mode) =>
          computeRouteWithQuota({
            admin,
            apiKey: routesKey,
            origin: body.origin!,
            destination: body.destination!,
            mode,
          })
        )
      );

      const allQuotaSkipped =
        results.length > 0 && results.every((r) => r.quotaSkipped);
      if (allQuotaSkipped) {
        const failedProvider =
          quotaProviderForTravelMode(uniqueModes[0]!) ??
          "google_routes_essentials";
        return json(
          req,
          quotaDeniedPayload(
            {
              ok: false,
              reason: "limit",
            },
            failedProvider
          ),
          429
        );
      }

      if (body.action === "route") {
        const one = results[0];
        if (one?.quotaSkipped) {
          const provider =
            quotaProviderForTravelMode(one.mode) ?? "google_routes_essentials";
          return json(
            req,
            quotaDeniedPayload({ ok: false, reason: "limit" }, provider),
            429
          );
        }
        return json(req, one ?? { available: false });
      }

      return json(req, {
        routes: results,
        quotaPartial: results.some((r) => r.quotaSkipped),
      });
    }

    return json(req, { error: "action inválida" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(req, { error: message }, 500);
  }
});
