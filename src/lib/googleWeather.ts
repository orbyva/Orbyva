/**
 * Cliente Google Weather via Edge Function `places-catalog`.
 */
import { supabase } from "@/lib/supabase";

export type WeatherPeriodForecast = {
  conditionType: string | null;
  conditionText: string | null;
  iconBaseUri: string | null;
  humidityPercent: number | null;
  rainProbabilityPercent: number | null;
  precipitationMm: number | null;
  windSpeedKph: number | null;
  windGustKph: number | null;
  windCardinal: string | null;
  /** Quando a API expõe (hora a hora); diário costuma ser null. */
  feelsLikeC: number | null;
};

export type WeatherCurrent = {
  kind: "current";
  time: string | null;
  isDaytime: boolean | null;
  conditionType: string | null;
  conditionText: string | null;
  iconBaseUri: string | null;
  temperatureC: number | null;
  feelsLikeC: number | null;
  humidityPercent: number | null;
  rainProbabilityPercent: number | null;
  precipitationMm: number | null;
  windSpeedKph: number | null;
  windGustKph: number | null;
  windCardinal: string | null;
  maxTemperatureC: number | null;
  minTemperatureC: number | null;
  cached?: boolean;
};

export type WeatherDayForecast = {
  date: string | null;
  conditionType: string | null;
  conditionText: string | null;
  iconBaseUri: string | null;
  maxTemperatureC: number | null;
  minTemperatureC: number | null;
  humidityPercent: number | null;
  rainProbabilityPercent: number | null;
  precipitationMm: number | null;
  windSpeedKph: number | null;
  windGustKph: number | null;
  windCardinal: string | null;
  daytime: WeatherPeriodForecast | null;
  nighttime: WeatherPeriodForecast | null;
};

export type WeatherForecast = {
  kind: "forecast";
  timeZone: string | null;
  days: WeatherDayForecast[];
  cached?: boolean;
};

export type WeatherHourForecast = {
  time: string | null;
  localDate: string | null;
  localHour: number | null;
  isDaytime: boolean | null;
  conditionType: string | null;
  conditionText: string | null;
  iconBaseUri: string | null;
  temperatureC: number | null;
  feelsLikeC: number | null;
  humidityPercent: number | null;
  rainProbabilityPercent: number | null;
  precipitationMm: number | null;
  windSpeedKph: number | null;
  windGustKph: number | null;
  windCardinal: string | null;
};

export type WeatherHourlyForecast = {
  kind: "hourly";
  timeZone: string | null;
  hours: WeatherHourForecast[];
  cached?: boolean;
};

type InvokeErr = { error?: string; code?: string; detail?: string };

const CURRENT_CACHE_TTL_MS = 15 * 60 * 1000;
const DAILY_CACHE_TTL_MS = 60 * 60 * 1000;
const HOURLY_CACHE_TTL_MS = 30 * 60 * 1000;

const currentCache = new Map<string, { at: number; data: WeatherCurrent }>();
const dailyCache = new Map<string, { at: number; data: WeatherForecast }>();
const hourlyCache = new Map<
  string,
  { at: number; data: WeatherHourlyForecast }
>();

export class WeatherNotConfiguredError extends Error {
  readonly code = "WEATHER_NOT_CONFIGURED";
  constructor(message = "Previsão do tempo temporariamente indisponível.") {
    super(message);
    this.name = "WeatherNotConfiguredError";
  }
}

export class WeatherUnavailableError extends Error {
  readonly code = "WEATHER_UNAVAILABLE";
  constructor(message = "Previsão do tempo indisponível.") {
    super(message);
    this.name = "WeatherUnavailableError";
  }
}

export class MapsQuotaExceededError extends Error {
  readonly code = "MAPS_QUOTA_EXCEEDED";
  constructor(
    message = "Limite gratuito de previsão do tempo atingido. Novas consultas liberam no próximo mês."
  ) {
    super(message);
    this.name = "MapsQuotaExceededError";
  }
}

function publicError(raw: string | undefined, fallback: string): string {
  if (!raw?.trim()) return fallback;
  if (/google|maps|weather|api.?key/i.test(raw)) return fallback;
  return raw;
}

function throwFromPayload(payload: InvokeErr | null, fallback: string): never {
  if (payload?.code === "WEATHER_NOT_CONFIGURED") {
    throw new WeatherNotConfiguredError();
  }
  if (payload?.code === "WEATHER_UNAVAILABLE") {
    throw new WeatherUnavailableError(payload.error);
  }
  if (payload?.code === "MAPS_QUOTA_EXCEEDED") {
    throw new MapsQuotaExceededError(payload.error);
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

async function invokeWeather(
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
      throwFromPayload(fromBody, "Previsão do tempo indisponível.");
    }
    throw new Error(
      publicError(error.message, "Previsão do tempo indisponível.")
    );
  }

  const payload = data as (Record<string, unknown> & InvokeErr) | null;
  if (!payload) {
    throw new WeatherUnavailableError();
  }
  if (payload.code || (payload.error && !payload.kind)) {
    throwFromPayload(payload, "Previsão do tempo indisponível.");
  }
  return payload;
}

function cacheKey(lat: number, lng: number, extra = ""): string {
  return `${lat.toFixed(3)}|${lng.toFixed(3)}|${extra}`;
}

export function clearWeatherCache(): void {
  currentCache.clear();
  dailyCache.clear();
  hourlyCache.clear();
}

export async function fetchCurrentWeather(params: {
  lat: number;
  lng: number;
  signal?: AbortSignal;
}): Promise<WeatherCurrent> {
  const key = cacheKey(params.lat, params.lng, "current");
  const hit = currentCache.get(key);
  if (hit && Date.now() - hit.at < CURRENT_CACHE_TTL_MS) return hit.data;

  const payload = await invokeWeather(
    {
      action: "weather_current",
      lat: params.lat,
      lng: params.lng,
    },
    params.signal
  );

  const data = payload as unknown as WeatherCurrent;
  currentCache.set(key, { at: Date.now(), data });
  return data;
}

export async function fetchDailyForecast(params: {
  lat: number;
  lng: number;
  days?: number;
  signal?: AbortSignal;
}): Promise<WeatherForecast> {
  // Sempre busca a janela máxima (10) para mala e roteiro compartilharem cache.
  const days = 10;
  const key = cacheKey(params.lat, params.lng, "daily");
  const hit = dailyCache.get(key);
  if (hit && Date.now() - hit.at < DAILY_CACHE_TTL_MS) return hit.data;

  const payload = await invokeWeather(
    {
      action: "weather_forecast",
      lat: params.lat,
      lng: params.lng,
      days,
    },
    params.signal
  );

  const data = payload as unknown as WeatherForecast;
  dailyCache.set(key, { at: Date.now(), data });
  return data;
}

/** Previsão horária (até 240 h a partir da hora atual). */
export async function fetchHourlyForecast(params: {
  lat: number;
  lng: number;
  /** Total de horas (1–240). Default 72. Agrupa em buckets p/ cache compartilhado. */
  hours?: number;
  signal?: AbortSignal;
}): Promise<WeatherHourlyForecast> {
  const requested = Math.min(Math.max(params.hours ?? 72, 1), 240);
  // Buckets fixos: callers com hours diferentes reaproveitam o mesmo fetch.
  const hours =
    requested <= 72 ? 72 : requested <= 168 ? 168 : 240;
  const key = cacheKey(params.lat, params.lng, `hourly:${hours}`);
  const hit = hourlyCache.get(key);
  if (hit && Date.now() - hit.at < HOURLY_CACHE_TTL_MS) return hit.data;

  const payload = await invokeWeather(
    {
      action: "weather_hourly",
      lat: params.lat,
      lng: params.lng,
      hours,
    },
    params.signal
  );

  const data = payload as unknown as WeatherHourlyForecast;
  hourlyCache.set(key, { at: Date.now(), data });
  return data;
}
