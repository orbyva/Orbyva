/**
 * Proxy autenticado Google Maps Platform:
 * - Places API (New) Autocomplete
 * - Routes API Compute Routes
 * - Weather API (current + daily + hourly forecast)
 *
 * Secrets (qualquer um resolve; preferência específica > genérica):
 *   GOOGLE_MAPS_API_KEY
 *   GOOGLE_PLACES_API_KEY / GOOGLE_ROUTES_API_KEY / GOOGLE_WEATHER_API_KEY
 *
 * Ações:
 *   { action: "search", query, lat?, lng? }
 *   { action: "resolve", placeId }  → lat/lng via Routes placeId↔placeId (WALK)
 *   { action: "route" | "routes", origin, destination|placeId, mode(s) }
 *   { action: "weather_current", lat, lng }
 *   { action: "weather_forecast", lat, lng, days? }
 *   { action: "weather_hourly", lat, lng, hours? }
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

const PLACES_AUTOCOMPLETE =
  "https://places.googleapis.com/v1/places:autocomplete";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const WEATHER_CURRENT =
  "https://weather.googleapis.com/v1/currentConditions:lookup";
const WEATHER_DAILY =
  "https://weather.googleapis.com/v1/forecast/days:lookup";
const WEATHER_HOURLY =
  "https://weather.googleapis.com/v1/forecast/hours:lookup";

const ROUTE_FIELD_MASK =
  "routes.duration,routes.distanceMeters,routes.legs.duration,routes.legs.distanceMeters,routes.legs.endLocation";

const ROUTE_CACHE_TTL_MS = 10 * 60 * 1000;
const WEATHER_CURRENT_CACHE_TTL_MS = 15 * 60 * 1000;
const WEATHER_DAILY_CACHE_TTL_MS = 60 * 60 * 1000;
const WEATHER_HOURLY_CACHE_TTL_MS = 30 * 60 * 1000;

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
  endLat?: number | null;
  endLng?: number | null;
};

type DestinationRef =
  | { kind: "placeId"; placeId: string }
  | { kind: "latLng"; lat: number; lng: number };

const routeCache = new Map<
  string,
  { at: number; result: RouteResult; expiresAt: number }
>();
const weatherCurrentCache = new Map<
  string,
  { at: number; payload: unknown; expiresAt: number }
>();
const weatherDailyCache = new Map<
  string,
  { at: number; payload: unknown; expiresAt: number }
>();
const weatherHourlyCache = new Map<
  string,
  { at: number; payload: unknown; expiresAt: number }
>();

function mapsApiKey(kind: "places" | "routes" | "weather"): string {
  const specific =
    kind === "places"
      ? Deno.env.get("GOOGLE_PLACES_API_KEY")
      : kind === "routes"
        ? Deno.env.get("GOOGLE_ROUTES_API_KEY")
        : Deno.env.get("GOOGLE_WEATHER_API_KEY");
  return (
    (specific ?? "").trim() ||
    (Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "").trim()
  );
}

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

function normalizePlaceId(raw: string): string {
  const t = raw.trim();
  return t.startsWith("places/") ? t.slice("places/".length) : t;
}

function parseDurationSeconds(duration?: string): number | null {
  if (!duration) return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(duration.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.round(n) : null;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms = 10_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw Object.assign(new Error("Upstream timeout"), {
        status: 504,
        detail: "timeout",
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function mapGoogleTypesToCategory(types: string[] | undefined): string | null {
  if (!types?.length) return null;
  const t = types.map((x) => x.toLowerCase());
  if (t.some((x) => x.includes("restaurant"))) return "restaurant";
  if (t.some((x) => x.includes("cafe") || x.includes("coffee"))) return "cafe";
  if (t.some((x) => x.includes("bar") || x.includes("night_club"))) return "bar";
  if (t.some((x) => x.includes("lodging") || x.includes("hotel"))) return "hotel";
  if (t.some((x) => x.includes("park"))) return "park";
  if (t.some((x) => x.includes("museum"))) return "museum";
  if (t.some((x) => x.includes("store") || x.includes("shopping"))) return "shop";
  if (
    t.some(
      (x) =>
        x.includes("tourist") ||
        x.includes("attraction") ||
        x.includes("stadium") ||
        x.includes("amusement")
    )
  ) {
    return "attraction";
  }
  return types[0] ?? null;
}

async function searchPlacesAutocomplete(params: {
  apiKey: string;
  query: string;
  lat?: number;
  lng?: number;
  includedPrimaryTypes?: string[];
}): Promise<unknown[]> {
  const body: Record<string, unknown> = {
    input: params.query.trim(),
    languageCode: "pt-BR",
  };
  if (
    params.includedPrimaryTypes &&
    params.includedPrimaryTypes.length > 0
  ) {
    body.includedPrimaryTypes = params.includedPrimaryTypes.slice(0, 5);
  }
  if (
    typeof params.lat === "number" &&
    typeof params.lng === "number" &&
    Number.isFinite(params.lat) &&
    Number.isFinite(params.lng)
  ) {
    body.locationBias = {
      circle: {
        center: { latitude: params.lat, longitude: params.lng },
        radius: 50_000.0,
      },
    };
  }

  const res = await fetchWithTimeout(PLACES_AUTOCOMPLETE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": params.apiKey,
      "X-Goog-FieldMask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.place,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types,suggestions.placePrediction.distanceMeters",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(`Places autocomplete: ${res.status}`), {
      status: res.status === 429 ? 429 : 502,
      detail: text,
    });
  }

  const data = (await res.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        place?: string;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
        types?: string[];
        distanceMeters?: number;
      };
    }>;
  };

  const places: unknown[] = [];
  for (const s of data.suggestions ?? []) {
    const p = s.placePrediction;
    if (!p) continue;
    const rawId = p.placeId || p.place || "";
    const placeId = normalizePlaceId(rawId);
    if (!placeId) continue;
    const name =
      p.structuredFormat?.mainText?.text?.trim() ||
      p.text?.text?.trim() ||
      null;
    if (!name) continue;
    const address =
      p.structuredFormat?.secondaryText?.text?.trim() ||
      p.text?.text?.trim() ||
      null;
    places.push({
      placeId,
      name,
      address,
      lat: null,
      lng: null,
      category: mapGoogleTypesToCategory(p.types),
      distanceMeters:
        typeof p.distanceMeters === "number" && Number.isFinite(p.distanceMeters)
          ? Math.round(p.distanceMeters)
          : null,
    });
  }
  return places.slice(0, 10);
}

function originCacheKey(origin: LatLng | DestinationRef): string {
  if ("kind" in origin) {
    return origin.kind === "placeId"
      ? `pid:${origin.placeId}`
      : `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}`;
  }
  return `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}`;
}

function routeCacheKey(
  origin: LatLng | DestinationRef,
  dest: DestinationRef,
  mode: TravelMode,
  periodKey: string
): string {
  const destKey =
    dest.kind === "placeId"
      ? `pid:${dest.placeId}`
      : `${dest.lat.toFixed(5)},${dest.lng.toFixed(5)}`;
  return [originCacheKey(origin), destKey, mode, periodKey].join("|");
}

function readRouteCache(
  origin: LatLng | DestinationRef,
  dest: DestinationRef,
  mode: TravelMode,
  periodKey: string
): RouteResult | null {
  const key = routeCacheKey(origin, dest, mode, periodKey);
  const hit = routeCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    routeCache.delete(key);
    return null;
  }
  return { ...hit.result, cached: true };
}

function writeRouteCache(
  origin: LatLng | DestinationRef,
  dest: DestinationRef,
  mode: TravelMode,
  periodKey: string,
  periodEndMs: number,
  result: RouteResult
): void {
  const key = routeCacheKey(origin, dest, mode, periodKey);
  const soft = Date.now() + ROUTE_CACHE_TTL_MS;
  routeCache.set(key, {
    at: Date.now(),
    result: { ...result, cached: undefined },
    expiresAt: Math.min(soft, periodEndMs),
  });
}

function weatherCacheKey(lat: number, lng: number, kind: string): string {
  return `${kind}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
}

async function computeRoute(params: {
  apiKey: string;
  origin: DestinationRef | LatLng;
  destination: DestinationRef;
  mode: TravelMode;
}): Promise<RouteResult> {
  const toWaypoint = (ref: DestinationRef | LatLng) => {
    if ("kind" in ref) {
      return ref.kind === "placeId"
        ? { placeId: ref.placeId }
        : {
            location: {
              latLng: { latitude: ref.lat, longitude: ref.lng },
            },
          };
    }
    return {
      location: {
        latLng: { latitude: ref.lat, longitude: ref.lng },
      },
    };
  };

  const body: Record<string, unknown> = {
    origin: toWaypoint(
      "kind" in params.origin
        ? params.origin
        : { kind: "latLng", lat: params.origin.lat, lng: params.origin.lng }
    ),
    destination: toWaypoint(params.destination),
    travelMode: params.mode,
    languageCode: "pt-BR",
  };

  const originIsPlace =
    "kind" in params.origin && params.origin.kind === "placeId";
  const destIsPlace = params.destination.kind === "placeId";
  // placeId↔placeId (resolve de coords) não restringe ao BR.
  if (!(originIsPlace && destIsPlace)) {
    body.regionCode = "BR";
  }

  if (params.mode === "DRIVE") {
    body.routingPreference = "TRAFFIC_AWARE";
  }

  const res = await fetchWithTimeout(ROUTES_URL, {
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
    routes?: Array<{
      duration?: string;
      distanceMeters?: number;
      legs?: Array<{
        duration?: string;
        distanceMeters?: number;
        endLocation?: { latLng?: { latitude?: number; longitude?: number } };
      }>;
    }>;
  };
  const route = data.routes?.[0];
  if (!route) {
    return {
      mode: params.mode,
      durationSeconds: null,
      distanceMeters: null,
      available: false,
      error: "no_route",
    };
  }

  const leg = route.legs?.[0];
  const end = leg?.endLocation?.latLng;
  const endLat =
    typeof end?.latitude === "number" && Number.isFinite(end.latitude)
      ? end.latitude
      : null;
  const endLng =
    typeof end?.longitude === "number" && Number.isFinite(end.longitude)
      ? end.longitude
      : null;

  return {
    mode: params.mode,
    durationSeconds: parseDurationSeconds(route.duration ?? leg?.duration),
    distanceMeters: route.distanceMeters ?? leg?.distanceMeters ?? null,
    available: true,
    endLat,
    endLng,
  };
}

async function computeRouteWithQuota(params: {
  admin: ReturnType<typeof createMapsAdminClient>;
  apiKey: string;
  origin: LatLng | DestinationRef;
  destination: DestinationRef;
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

function parseDestination(body: {
  destination?: LatLng;
  placeId?: string;
  destinationPlaceId?: string;
}): DestinationRef | null {
  const pid = (body.placeId ?? body.destinationPlaceId ?? "").trim();
  if (pid) return { kind: "placeId", placeId: normalizePlaceId(pid) };
  if (isFiniteLatLng(body.destination)) {
    return {
      kind: "latLng",
      lat: body.destination.lat,
      lng: body.destination.lng,
    };
  }
  return null;
}

function normalizeCurrentWeather(raw: Record<string, unknown>) {
  const cond = raw.weatherCondition as
    | { type?: string; description?: { text?: string }; iconBaseUri?: string }
    | undefined;
  const temp = raw.temperature as { degrees?: number } | undefined;
  const feels = raw.feelsLikeTemperature as { degrees?: number } | undefined;
  const precip = raw.precipitation as {
    probability?: { percent?: number; type?: string };
    qpf?: { quantity?: number; unit?: string };
  } | undefined;
  const wind = raw.wind as {
    speed?: { value?: number; unit?: string };
    gust?: { value?: number; unit?: string };
    direction?: { degrees?: number; cardinal?: string };
  } | undefined;
  const history = raw.currentConditionsHistory as {
    maxTemperature?: { degrees?: number };
    minTemperature?: { degrees?: number };
  } | undefined;

  return {
    kind: "current" as const,
    time: raw.currentTime ?? null,
    isDaytime: raw.isDaytime ?? null,
    conditionType: cond?.type ?? null,
    conditionText: cond?.description?.text ?? null,
    iconBaseUri: cond?.iconBaseUri ?? null,
    temperatureC: temp?.degrees ?? null,
    feelsLikeC: feels?.degrees ?? null,
    humidityPercent:
      typeof raw.relativeHumidity === "number" ? raw.relativeHumidity : null,
    rainProbabilityPercent: precip?.probability?.percent ?? null,
    precipitationMm: precip?.qpf?.quantity ?? null,
    windSpeedKph: wind?.speed?.value ?? null,
    windGustKph: wind?.gust?.value ?? null,
    windCardinal: wind?.direction?.cardinal ?? null,
    maxTemperatureC: history?.maxTemperature?.degrees ?? null,
    minTemperatureC: history?.minTemperature?.degrees ?? null,
  };
}

function normalizePeriodForecast(
  period: Record<string, unknown> | undefined
): {
  conditionType: string | null;
  conditionText: string | null;
  iconBaseUri: string | null;
  humidityPercent: number | null;
  rainProbabilityPercent: number | null;
  precipitationMm: number | null;
  windSpeedKph: number | null;
  windGustKph: number | null;
  windCardinal: string | null;
  feelsLikeC: number | null;
} | null {
  if (!period) return null;
  const cond = period.weatherCondition as
    | { type?: string; description?: { text?: string }; iconBaseUri?: string }
    | undefined;
  const precip = period.precipitation as {
    probability?: { percent?: number };
    qpf?: { quantity?: number };
  } | undefined;
  const wind = period.wind as {
    speed?: { value?: number };
    gust?: { value?: number };
    direction?: { cardinal?: string };
  } | undefined;
  const feels = period.feelsLikeTemperature as { degrees?: number } | undefined;
  return {
    conditionType: cond?.type ?? null,
    conditionText: cond?.description?.text ?? null,
    iconBaseUri: cond?.iconBaseUri ?? null,
    humidityPercent:
      typeof period.relativeHumidity === "number"
        ? period.relativeHumidity
        : null,
    rainProbabilityPercent: precip?.probability?.percent ?? null,
    precipitationMm: precip?.qpf?.quantity ?? null,
    windSpeedKph: wind?.speed?.value ?? null,
    windGustKph: wind?.gust?.value ?? null,
    windCardinal: wind?.direction?.cardinal ?? null,
    feelsLikeC: feels?.degrees ?? null,
  };
}

function normalizeDailyForecast(raw: Record<string, unknown>) {
  const days = (raw.forecastDays as Array<Record<string, unknown>> | undefined) ??
    [];
  return {
    kind: "forecast" as const,
    timeZone: (raw.timeZone as { id?: string } | undefined)?.id ?? null,
    days: days.map((d) => {
      const display = d.displayDate as
        | { year?: number; month?: number; day?: number }
        | undefined;
      const dayFc = d.daytimeForecast as Record<string, unknown> | undefined;
      const nightFc = d.nighttimeForecast as Record<string, unknown> | undefined;
      const daytime = normalizePeriodForecast(dayFc);
      const nighttime = normalizePeriodForecast(nightFc);
      const y = display?.year;
      const m = display?.month;
      const day = display?.day;
      const date =
        y != null && m != null && day != null
          ? `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`
          : null;

      return {
        date,
        conditionType: daytime?.conditionType ?? nighttime?.conditionType ?? null,
        conditionText: daytime?.conditionText ?? nighttime?.conditionText ?? null,
        iconBaseUri: daytime?.iconBaseUri ?? nighttime?.iconBaseUri ?? null,
        maxTemperatureC:
          (d.maxTemperature as { degrees?: number } | undefined)?.degrees ??
          null,
        minTemperatureC:
          (d.minTemperature as { degrees?: number } | undefined)?.degrees ??
          null,
        humidityPercent:
          daytime?.humidityPercent ?? nighttime?.humidityPercent ?? null,
        rainProbabilityPercent:
          daytime?.rainProbabilityPercent ??
          nighttime?.rainProbabilityPercent ??
          null,
        precipitationMm:
          daytime?.precipitationMm ?? nighttime?.precipitationMm ?? null,
        windSpeedKph: daytime?.windSpeedKph ?? nighttime?.windSpeedKph ?? null,
        windGustKph: daytime?.windGustKph ?? nighttime?.windGustKph ?? null,
        windCardinal: daytime?.windCardinal ?? nighttime?.windCardinal ?? null,
        daytime,
        nighttime,
      };
    }),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function normalizeHourlyForecast(raw: Record<string, unknown>) {
  const hours =
    (raw.forecastHours as Array<Record<string, unknown>> | undefined) ?? [];
  return {
    kind: "hourly" as const,
    timeZone: (raw.timeZone as { id?: string } | undefined)?.id ?? null,
    hours: hours.map((h) => {
      const interval = h.interval as { startTime?: string } | undefined;
      const display = h.displayDateTime as
        | {
            year?: number;
            month?: number;
            day?: number;
            hours?: number;
          }
        | undefined;
      const cond = h.weatherCondition as
        | {
            type?: string;
            description?: { text?: string };
            iconBaseUri?: string;
          }
        | undefined;
      const temp = h.temperature as { degrees?: number } | undefined;
      const feels = h.feelsLikeTemperature as { degrees?: number } | undefined;
      const precip = h.precipitation as {
        probability?: { percent?: number };
        qpf?: { quantity?: number };
      } | undefined;
      const wind = h.wind as {
        speed?: { value?: number };
        gust?: { value?: number };
        direction?: { cardinal?: string };
      } | undefined;

      const y = display?.year;
      const m = display?.month;
      const day = display?.day;
      const localDate =
        y != null && m != null && day != null
          ? `${y}-${pad2(m)}-${pad2(day)}`
          : null;
      const localHour =
        typeof display?.hours === "number" ? display.hours : null;

      return {
        time: interval?.startTime ?? null,
        localDate,
        localHour,
        isDaytime: typeof h.isDaytime === "boolean" ? h.isDaytime : null,
        conditionType: cond?.type ?? null,
        conditionText: cond?.description?.text ?? null,
        iconBaseUri: cond?.iconBaseUri ?? null,
        temperatureC: temp?.degrees ?? null,
        feelsLikeC: feels?.degrees ?? null,
        humidityPercent:
          typeof h.relativeHumidity === "number" ? h.relativeHumidity : null,
        rainProbabilityPercent: precip?.probability?.percent ?? null,
        precipitationMm: precip?.qpf?.quantity ?? null,
        windSpeedKph: wind?.speed?.value ?? null,
        windGustKph: wind?.gust?.value ?? null,
        windCardinal: wind?.direction?.cardinal ?? null,
      };
    }),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersForRequest(req) });
  }

  try {
    if (req.method !== "POST") {
      return json(req, { error: "Method not allowed" }, 405);
    }

    const placesKey = mapsApiKey("places");
    const routesKey = mapsApiKey("routes");
    const weatherKey = mapsApiKey("weather");
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
      lat?: number;
      lng?: number;
      origin?: LatLng;
      destination?: LatLng;
      placeId?: string;
      destinationPlaceId?: string;
      mode?: string;
      modes?: string[];
      days?: number;
      hours?: number;
      includedPrimaryTypes?: string[];
    };

    if (body.action === "search") {
      if (!placesKey) {
        return json(
          req,
          {
            error: "Busca de lugares não configurada",
            code: "PLACES_NOT_CONFIGURED",
          },
          503
        );
      }
      const query = (body.query ?? "").trim();
      if (query.length < 2) {
        return json(req, { places: [] });
      }

      const quota = await tryConsumeQuota(admin, "google_places", 1);
      if (!quota.ok) {
        return json(req, quotaDeniedPayload(quota, "google_places"), 429);
      }

      try {
        const places = await searchPlacesAutocomplete({
          apiKey: placesKey,
          query,
          lat: body.lat,
          lng: body.lng,
          includedPrimaryTypes: Array.isArray(body.includedPrimaryTypes)
            ? body.includedPrimaryTypes
                .map((t) => String(t).trim())
                .filter(Boolean)
                .slice(0, 5)
            : undefined,
        });
        if (places.length === 0) {
          return json(req, {
            places: [],
            code: "DESTINATION_NOT_FOUND",
            error: "Destino não encontrado",
          });
        }
        return json(req, { places });
      } catch (err) {
        const e = err as Error & { status?: number; detail?: string };
        if (
          e.status &&
          looksLikeBillingOrQuotaError(e.status, e.detail ?? e.message)
        ) {
          await blockProviderUntilPeriodEnd(admin, "google_places");
          return json(
            req,
            quotaDeniedPayload(
              {
                ok: false,
                reason: "blocked",
                limit: quota.limit,
                used: quota.used,
              },
              "google_places"
            ),
            429
          );
        }
        return json(
          req,
          { error: e.message, detail: e.detail, code: "SEARCH_FAILED" },
          e.status ?? 502
        );
      }
    }

    if (body.action === "resolve") {
      if (!routesKey) {
        return json(
          req,
          { error: "Rotas não configuradas", code: "ROUTES_NOT_CONFIGURED" },
          503
        );
      }
      const placeId = normalizePlaceId(
        (body.placeId ?? body.destinationPlaceId ?? "").trim()
      );
      if (!placeId) {
        return json(
          req,
          { error: "placeId obrigatório", code: "DESTINATION_NOT_FOUND" },
          400
        );
      }

      // placeId↔placeId (WALK): obtém endLocation sem depender de rota
      // a partir do GPS do usuário (ex.: Madrid a partir do Brasil).
      const placeRef: DestinationRef = { kind: "placeId", placeId };
      const result = await computeRouteWithQuota({
        admin,
        apiKey: routesKey,
        origin: placeRef,
        destination: placeRef,
        mode: "WALK",
      });

      if (result.quotaSkipped) {
        return json(
          req,
          quotaDeniedPayload(
            { ok: false, reason: "limit" },
            "google_routes_essentials"
          ),
          429
        );
      }
      if (
        !result.available ||
        result.endLat == null ||
        result.endLng == null
      ) {
        return json(
          req,
          {
            error: "Não foi possível obter coordenadas do destino",
            code: "DESTINATION_NOT_FOUND",
            detail: result.error ?? null,
          },
          404
        );
      }
      return json(req, {
        placeId,
        lat: result.endLat,
        lng: result.endLng,
        distanceMeters: result.distanceMeters,
        durationSeconds: result.durationSeconds,
      });
    }

    if (body.action === "route" || body.action === "routes") {
      if (!routesKey) {
        return json(
          req,
          { error: "Rotas não configuradas", code: "ROUTES_NOT_CONFIGURED" },
          503
        );
      }
      if (!isFiniteLatLng(body.origin)) {
        return json(
          req,
          { error: "Origem (lat/lng) obrigatória", code: "LOCATION_REQUIRED" },
          400
        );
      }
      const destination = parseDestination(body);
      if (!destination) {
        return json(
          req,
          {
            error: "destination (lat/lng) ou placeId obrigatório",
            code: "DESTINATION_NOT_FOUND",
          },
          400
        );
      }

      const rawModes =
        body.action === "route"
          ? [body.mode ?? "DRIVE"]
          : (body.modes ?? ALL_MODES);

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
        return json(
          req,
          { error: "Nenhuma modalidade válida", code: "MODE_UNAVAILABLE", modes: [] },
          400
        );
      }

      const results = await Promise.all(
        uniqueModes.map((mode) =>
          computeRouteWithQuota({
            admin,
            apiKey: routesKey,
            origin: body.origin!,
            destination,
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
          quotaDeniedPayload({ ok: false, reason: "limit" }, failedProvider),
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
        if (!one?.available) {
          return json(req, {
            ...one,
            code: one?.error?.startsWith("unavailable")
              ? "MODE_UNAVAILABLE"
              : "ROUTE_UNAVAILABLE",
          });
        }
        return json(req, one);
      }

      return json(req, {
        routes: results,
        quotaPartial: results.some((r) => r.quotaSkipped),
        destinationLat:
          results.find((r) => r.endLat != null)?.endLat ?? null,
        destinationLng:
          results.find((r) => r.endLng != null)?.endLng ?? null,
      });
    }

    if (
      body.action === "weather_current" ||
      body.action === "weather_forecast" ||
      body.action === "weather_hourly"
    ) {
      if (!weatherKey) {
        return json(
          req,
          {
            error: "Previsão do tempo não configurada",
            code: "WEATHER_NOT_CONFIGURED",
          },
          503
        );
      }
      if (
        typeof body.lat !== "number" ||
        typeof body.lng !== "number" ||
        !Number.isFinite(body.lat) ||
        !Number.isFinite(body.lng)
      ) {
        return json(
          req,
          { error: "lat/lng obrigatórios", code: "LOCATION_REQUIRED" },
          400
        );
      }

      const kind =
        body.action === "weather_current"
          ? "current"
          : body.action === "weather_hourly"
            ? "hourly"
            : "daily";
      const cacheMap =
        kind === "current"
          ? weatherCurrentCache
          : kind === "hourly"
            ? weatherHourlyCache
            : weatherDailyCache;
      const ttl =
        kind === "current"
          ? WEATHER_CURRENT_CACHE_TTL_MS
          : kind === "hourly"
            ? WEATHER_HOURLY_CACHE_TTL_MS
            : WEATHER_DAILY_CACHE_TTL_MS;
      const hours = Math.min(Math.max(Number(body.hours) || 48, 1), 240);
      const days = Math.min(Math.max(Number(body.days) || 10, 1), 10);
      const cacheKey = weatherCacheKey(
        body.lat,
        body.lng,
        kind === "current"
          ? "current"
          : kind === "hourly"
            ? `hourly:${hours}`
            : `daily:${days}`
      );
      const cached = cacheMap.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return json(req, { ...((cached.payload as object) ?? {}), cached: true });
      }

      const quota = await tryConsumeQuota(admin, "google_weather", 1);
      if (!quota.ok) {
        return json(req, quotaDeniedPayload(quota, "google_weather"), 429);
      }

      try {
        const url = new URL(
          kind === "current"
            ? WEATHER_CURRENT
            : kind === "hourly"
              ? WEATHER_HOURLY
              : WEATHER_DAILY
        );
        url.searchParams.set("key", weatherKey);
        url.searchParams.set("location.latitude", String(body.lat));
        url.searchParams.set("location.longitude", String(body.lng));
        url.searchParams.set("unitsSystem", "METRIC");
        url.searchParams.set("languageCode", "pt");
        if (kind === "daily") {
          url.searchParams.set("days", String(days));
          url.searchParams.set("pageSize", String(days));
        }
        if (kind === "hourly") {
          url.searchParams.set("hours", String(hours));
          url.searchParams.set("pageSize", String(Math.min(hours, 24)));
        }

        let raw: Record<string, unknown>;
        if (kind === "hourly" && hours > 24) {
          // Pagina até cobrir `hours` (pageSize máx. 24).
          const allHours: unknown[] = [];
          let pageToken: string | undefined;
          let timeZone: unknown = null;
          let fetched = 0;
          while (fetched < hours) {
            const pageUrl = new URL(url.toString());
            if (pageToken) pageUrl.searchParams.set("pageToken", pageToken);
            const res = await fetchWithTimeout(pageUrl.toString(), {
              method: "GET",
            });
            if (!res.ok) {
              const text = await res.text();
              if (looksLikeBillingOrQuotaError(res.status, text)) {
                await blockProviderUntilPeriodEnd(admin, "google_weather");
                return json(
                  req,
                  quotaDeniedPayload(
                    {
                      ok: false,
                      reason: "blocked",
                      limit: quota.limit,
                      used: quota.used,
                    },
                    "google_weather"
                  ),
                  429
                );
              }
              return json(
                req,
                {
                  error: "Previsão do tempo indisponível",
                  code: "WEATHER_UNAVAILABLE",
                  detail: text.slice(0, 200),
                },
                res.status === 404 ? 404 : 502
              );
            }
            const page = (await res.json()) as Record<string, unknown>;
            timeZone = page.timeZone ?? timeZone;
            const batch =
              (page.forecastHours as unknown[] | undefined) ?? [];
            allHours.push(...batch);
            fetched = allHours.length;
            pageToken =
              typeof page.nextPageToken === "string"
                ? page.nextPageToken
                : undefined;
            if (!pageToken || batch.length === 0) break;
          }
          raw = {
            forecastHours: allHours.slice(0, hours),
            timeZone,
          };
        } else {
          const res = await fetchWithTimeout(url.toString(), { method: "GET" });
          if (!res.ok) {
            const text = await res.text();
            if (looksLikeBillingOrQuotaError(res.status, text)) {
              await blockProviderUntilPeriodEnd(admin, "google_weather");
              return json(
                req,
                quotaDeniedPayload(
                  {
                    ok: false,
                    reason: "blocked",
                    limit: quota.limit,
                    used: quota.used,
                  },
                  "google_weather"
                ),
                429
              );
            }
            return json(
              req,
              {
                error: "Previsão do tempo indisponível",
                code: "WEATHER_UNAVAILABLE",
                detail: text.slice(0, 200),
              },
              res.status === 404 ? 404 : 502
            );
          }
          raw = (await res.json()) as Record<string, unknown>;
        }

        const payload =
          kind === "current"
            ? normalizeCurrentWeather(raw)
            : kind === "hourly"
              ? normalizeHourlyForecast(raw)
              : normalizeDailyForecast(raw);
        cacheMap.set(cacheKey, {
          at: Date.now(),
          payload,
          expiresAt: Date.now() + ttl,
        });
        return json(req, payload);
      } catch (err) {
        const e = err as Error;
        return json(
          req,
          {
            error: "Previsão do tempo indisponível",
            code: "WEATHER_UNAVAILABLE",
            detail: e.message,
          },
          502
        );
      }
    }

    return json(req, { error: "action inválida" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(req, { error: message }, 500);
  }
});
