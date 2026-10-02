import { useEffect, useMemo, useState } from "react";

import {
  groupWeatherCities,
  packingDaysForStops,
  weatherDayAt,
  weatherHoursAt,
  type CityWeatherBundle,
  type TripWeatherStop,
} from "@/domain/travel/tripWeather";
import {
  MapsQuotaExceededError,
  WeatherNotConfiguredError,
  WeatherUnavailableError,
  fetchDailyForecast,
  fetchHourlyForecast,
  type WeatherDayForecast,
  type WeatherHourForecast,
} from "@/lib/googleWeather";
import { hoursNeededForCityEnd } from "@/lib/tripWeather";

export type TripWeather = {
  loading: boolean;
  error: string | null;
  dayAt: (
    lat: number | null | undefined,
    lng: number | null | undefined,
    date: string | null | undefined
  ) => WeatherDayForecast | null;
  hoursAt: (
    lat: number | null | undefined,
    lng: number | null | undefined
  ) => WeatherHourForecast[];
  /** Dias da previsão dentro do período de cada parada (para a mala). */
  packingDays: WeatherDayForecast[];
};

function weatherErrorMessage(err: unknown): string {
  if (err instanceof WeatherNotConfiguredError) {
    return "Previsão do tempo ainda não configurada.";
  }
  if (err instanceof MapsQuotaExceededError) return err.message;
  if (err instanceof WeatherUnavailableError) return err.message;
  return "Previsão do tempo indisponível.";
}

/** Previsão diária + horária buscada uma vez por cidade distinta da viagem. */
export function useTripWeather(stops: TripWeatherStop[]): TripWeather {
  const [byCity, setByCity] = useState<Map<string, CityWeatherBundle>>(
    () => new Map()
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cities = useMemo(() => groupWeatherCities(stops), [stops]);
  const citiesKey = cities
    .map((c) => `${c.key}@${[...c.endDates].sort().join("+")}`)
    .sort()
    .join(",");

  useEffect(() => {
    if (cities.length === 0) {
      setByCity(new Map());
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const entries = await Promise.all(
          cities.map(async (city) => {
            const daily = await fetchDailyForecast({
              lat: city.lat,
              lng: city.lng,
              days: 10,
              signal: controller.signal,
            });
            const hourSpan = hoursNeededForCityEnd(city.endDates);
            let hours: WeatherHourForecast[] = [];
            if (hourSpan != null) {
              try {
                const hourly = await fetchHourlyForecast({
                  lat: city.lat,
                  lng: city.lng,
                  hours: hourSpan,
                  signal: controller.signal,
                });
                hours = hourly.hours;
              } catch {
                hours = [];
              }
            }
            return [city.key, { days: daily.days, hours }] as const;
          })
        );
        if (controller.signal.aborted) return;
        setByCity(new Map(entries));
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === "AbortError") {
          return;
        }
        setError(weatherErrorMessage(err));
        setByCity(new Map());
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cities derivado de citiesKey
  }, [citiesKey]);

  return useMemo<TripWeather>(
    () => ({
      loading,
      error,
      dayAt: (lat, lng, date) => weatherDayAt(byCity, lat, lng, date),
      hoursAt: (lat, lng) => weatherHoursAt(byCity, lat, lng),
      packingDays: packingDaysForStops(byCity, stops),
    }),
    [byCity, loading, error, stops]
  );
}
