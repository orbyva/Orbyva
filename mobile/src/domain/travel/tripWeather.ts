import type {
  WeatherDayForecast,
  WeatherHourForecast,
} from "@/lib/googleWeather";
import { cityWeatherKey } from "@/lib/tripWeather";

export type TripWeatherStop = {
  lat: number;
  lng: number;
  startDate: string;
  endDate: string;
  name?: string;
};

export type TripWeatherCity = {
  key: string;
  lat: number;
  lng: number;
  endDates: string[];
};

export type CityWeatherBundle = {
  days: WeatherDayForecast[];
  hours: WeatherHourForecast[];
};

type Coord = number | null | undefined;

function isCoord(value: Coord): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Paradas com coordenada; sem nenhuma, cai no destino da viagem. */
export function tripWeatherStops(
  trip: {
    destination?: string | null;
    destination_lat?: number | null;
    destination_lng?: number | null;
    start_date?: string | null;
    end_date?: string | null;
  } | null,
  stops: {
    name: string;
    lat?: number | null;
    lng?: number | null;
    start_date: string;
    end_date: string;
  }[]
): TripWeatherStop[] {
  if (!trip) return [];
  const fromStops = stops
    .filter((s) => isCoord(s.lat) && isCoord(s.lng))
    .map((s) => ({
      name: s.name,
      lat: s.lat as number,
      lng: s.lng as number,
      startDate: s.start_date,
      endDate: s.end_date,
    }));
  if (fromStops.length > 0) return fromStops;
  if (
    isCoord(trip.destination_lat) &&
    isCoord(trip.destination_lng) &&
    trip.start_date &&
    trip.end_date
  ) {
    return [
      {
        name: trip.destination ?? undefined,
        lat: trip.destination_lat,
        lng: trip.destination_lng,
        startDate: trip.start_date,
        endDate: trip.end_date,
      },
    ];
  }
  return [];
}

/** Uma entrada por cidade distinta (várias paradas na mesma cidade = 1 fetch). */
export function groupWeatherCities(stops: TripWeatherStop[]): TripWeatherCity[] {
  const map = new Map<string, TripWeatherCity>();
  for (const s of stops) {
    if (!isCoord(s.lat) || !isCoord(s.lng)) continue;
    const key = cityWeatherKey(s.lat, s.lng);
    const cur = map.get(key);
    if (cur) {
      if (s.endDate) cur.endDates.push(s.endDate);
    } else {
      map.set(key, {
        key,
        lat: s.lat,
        lng: s.lng,
        endDates: s.endDate ? [s.endDate] : [],
      });
    }
  }
  return [...map.values()];
}

export function weatherDayAt(
  byCity: Map<string, CityWeatherBundle>,
  lat: Coord,
  lng: Coord,
  date: string | null | undefined
): WeatherDayForecast | null {
  if (!isCoord(lat) || !isCoord(lng) || !date) return null;
  const bundle = byCity.get(cityWeatherKey(lat, lng));
  return bundle?.days.find((d) => d.date === date) ?? null;
}

export function weatherHoursAt(
  byCity: Map<string, CityWeatherBundle>,
  lat: Coord,
  lng: Coord
): WeatherHourForecast[] {
  if (!isCoord(lat) || !isCoord(lng)) return [];
  return byCity.get(cityWeatherKey(lat, lng))?.hours ?? [];
}

/** Dias da previsão que caem dentro do período de cada parada, em ordem. */
export function packingDaysForStops(
  byCity: Map<string, CityWeatherBundle>,
  stops: TripWeatherStop[]
): WeatherDayForecast[] {
  const out: WeatherDayForecast[] = [];
  for (const stop of stops) {
    const bundle = byCity.get(cityWeatherKey(stop.lat, stop.lng));
    if (!bundle) continue;
    out.push(
      ...(stop.startDate && stop.endDate
        ? bundle.days.filter(
            (d) => d.date && d.date >= stop.startDate && d.date <= stop.endDate
          )
        : bundle.days)
    );
  }
  return out;
}
