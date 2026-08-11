import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  MapsQuotaExceededError,
  WeatherNotConfiguredError,
  WeatherUnavailableError,
  fetchDailyForecast,
  fetchHourlyForecast,
  type WeatherDayForecast,
  type WeatherHourForecast,
} from "@/lib/googleWeather";
import { cityWeatherKey, hoursNeededForCityEnd } from "@/lib/tripWeather";

export type TripWeatherStop = {
  lat: number;
  lng: number;
  startDate: string;
  endDate: string;
  name?: string;
};

type CityBundle = {
  days: WeatherDayForecast[];
  hours: WeatherHourForecast[];
};

type TripWeatherContextValue = {
  loading: boolean;
  error: string | null;
  /** Previsão do dia numa cidade (lat/lng da parada). */
  dayAt: (
    lat: number | null | undefined,
    lng: number | null | undefined,
    date: string | null | undefined
  ) => WeatherDayForecast | null;
  /** Horas (fuso do destino) para aquela cidade. */
  hoursAt: (
    lat: number | null | undefined,
    lng: number | null | undefined
  ) => WeatherHourForecast[];
  /** Dias filtrados por parada, para a mala. */
  packingDays: (stops: TripWeatherStop[]) => WeatherDayForecast[];
};

const TripWeatherContext = createContext<TripWeatherContextValue | null>(null);

function weatherErrorMessage(err: unknown): string {
  if (err instanceof WeatherNotConfiguredError) {
    return "Previsão do tempo ainda não configurada.";
  }
  if (err instanceof MapsQuotaExceededError) return err.message;
  if (err instanceof WeatherUnavailableError) return err.message;
  return "Previsão do tempo indisponível.";
}

function filterDays(
  days: WeatherDayForecast[],
  start?: string | null,
  end?: string | null
): WeatherDayForecast[] {
  if (!start || !end) return days;
  return days.filter((d) => d.date && d.date >= start && d.date <= end);
}

export function TripWeatherProvider({
  stops,
  children,
}: {
  stops: TripWeatherStop[];
  children: ReactNode;
}) {
  const [byCity, setByCity] = useState<Map<string, CityBundle>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cities = useMemo(() => {
    const map = new Map<
      string,
      { lat: number; lng: number; endDates: string[] }
    >();
    for (const s of stops) {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
      const key = cityWeatherKey(s.lat, s.lng);
      const cur = map.get(key);
      if (cur) {
        if (s.endDate) cur.endDates.push(s.endDate);
      } else {
        map.set(key, {
          lat: s.lat,
          lng: s.lng,
          endDates: s.endDate ? [s.endDate] : [],
        });
      }
    }
    return [...map.entries()].map(([key, v]) => ({ key, ...v }));
  }, [stops]);

  const citiesKey = useMemo(
    () =>
      cities
        .map((c) => c.key)
        .sort()
        .join(","),
    [cities]
  );

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
            return [
              city.key,
              { days: daily.days, hours },
            ] as const;
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
    // citiesKey evita refetch por nova referência de array com mesmas cidades
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cities derivado de citiesKey
  }, [citiesKey]);

  const value = useMemo<TripWeatherContextValue>(() => {
    return {
      loading,
      error,
      dayAt(lat, lng, date) {
        if (
          lat == null ||
          lng == null ||
          !date ||
          !Number.isFinite(lat) ||
          !Number.isFinite(lng)
        ) {
          return null;
        }
        const bundle = byCity.get(cityWeatherKey(lat, lng));
        if (!bundle) return null;
        return bundle.days.find((d) => d.date === date) ?? null;
      },
      hoursAt(lat, lng) {
        if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          return [];
        }
        return byCity.get(cityWeatherKey(lat, lng))?.hours ?? [];
      },
      packingDays(packingStops) {
        const out: WeatherDayForecast[] = [];
        for (const stop of packingStops) {
          const bundle = byCity.get(cityWeatherKey(stop.lat, stop.lng));
          if (!bundle) continue;
          out.push(
            ...filterDays(bundle.days, stop.startDate, stop.endDate)
          );
        }
        return out;
      },
    };
  }, [byCity, loading, error]);

  return (
    <TripWeatherContext.Provider value={value}>
      {children}
    </TripWeatherContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook paired with provider
export function useTripWeather(): TripWeatherContextValue | null {
  return useContext(TripWeatherContext);
}
