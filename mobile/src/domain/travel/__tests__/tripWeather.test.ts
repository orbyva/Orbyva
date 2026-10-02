import { describe, expect, it } from "vitest";

import {
  groupWeatherCities,
  packingDaysForStops,
  tripWeatherStops,
  weatherDayAt,
  weatherHoursAt,
  type CityWeatherBundle,
} from "@/domain/travel/tripWeather";
import { suggestPackingList } from "@/domain/travel/clothing";
import type { WeatherDayForecast } from "@/lib/googleWeather";
import { cityWeatherKey, hoursNeededForCityEnd } from "@/lib/tripWeather";

function day(
  date: string,
  maxC: number,
  minC: number,
  rain = 0
): WeatherDayForecast {
  return {
    date,
    conditionType: rain > 50 ? "RAIN" : "CLEAR",
    conditionText: rain > 50 ? "Chuva" : "Céu limpo",
    iconBaseUri: null,
    maxTemperatureC: maxC,
    minTemperatureC: minC,
    humidityPercent: 50,
    rainProbabilityPercent: rain,
    precipitationMm: rain > 50 ? 8 : 0,
    windSpeedKph: 5,
    windGustKph: null,
    windCardinal: null,
    daytime: null,
    nighttime: null,
  };
}

const lisboa = { lat: 38.7223, lng: -9.1393 };
const porto = { lat: 41.1579, lng: -8.6291 };

const trip = {
  destination: "Portugal",
  destination_lat: 39.5,
  destination_lng: -8,
  start_date: "2026-10-05",
  end_date: "2026-10-10",
};

describe("tripWeatherStops", () => {
  it("usa as paradas com coordenada e ignora as sem coordenada", () => {
    const stops = tripWeatherStops(trip, [
      { name: "Lisboa", ...lisboa, start_date: "2026-10-05", end_date: "2026-10-07" },
      { name: "Sem mapa", lat: null, lng: null, start_date: "2026-10-07", end_date: "2026-10-08" },
      { name: "Porto", ...porto, start_date: "2026-10-08", end_date: "2026-10-10" },
    ]);
    expect(stops.map((s) => s.name)).toEqual(["Lisboa", "Porto"]);
    expect(stops[1]).toMatchObject({ startDate: "2026-10-08", endDate: "2026-10-10" });
  });

  it("cai no destino da viagem quando nenhuma parada tem coordenada", () => {
    const stops = tripWeatherStops(trip, []);
    expect(stops).toEqual([
      { name: "Portugal", lat: 39.5, lng: -8, startDate: "2026-10-05", endDate: "2026-10-10" },
    ]);
    expect(tripWeatherStops({ ...trip, destination_lat: null }, [])).toEqual([]);
  });
});

describe("groupWeatherCities", () => {
  it("junta paradas na mesma cidade numa única busca com todas as datas de fim", () => {
    const cities = groupWeatherCities([
      { ...lisboa, startDate: "2026-10-05", endDate: "2026-10-06" },
      { ...porto, startDate: "2026-10-06", endDate: "2026-10-08" },
      { lat: 38.72231, lng: -9.13932, startDate: "2026-10-08", endDate: "2026-10-10" },
    ]);
    expect(cities).toHaveLength(2);
    expect(cities[0]).toMatchObject({
      key: cityWeatherKey(lisboa.lat, lisboa.lng),
      endDates: ["2026-10-06", "2026-10-10"],
    });
  });
});

describe("dias da previsão por parada", () => {
  const byCity = new Map<string, CityWeatherBundle>([
    [
      cityWeatherKey(lisboa.lat, lisboa.lng),
      {
        days: [day("2026-10-04", 30, 20), day("2026-10-05", 28, 19), day("2026-10-06", 27, 18), day("2026-10-07", 26, 18)],
        hours: [],
      },
    ],
    [
      cityWeatherKey(porto.lat, porto.lng),
      {
        days: [day("2026-10-06", 14, 8, 90), day("2026-10-07", 13, 7, 85), day("2026-10-08", 12, 6, 80)],
        hours: [
          {
            time: null, localDate: "2026-10-07", localHour: 9, isDaytime: true,
            conditionType: null, conditionText: null, iconBaseUri: null,
            temperatureC: 10, feelsLikeC: 8, humidityPercent: null,
            rainProbabilityPercent: 80, precipitationMm: null,
            windSpeedKph: null, windGustKph: null, windCardinal: null,
          },
        ],
      },
    ],
  ]);
  const stops = [
    { ...lisboa, startDate: "2026-10-05", endDate: "2026-10-06" },
    { ...porto, startDate: "2026-10-07", endDate: "2026-10-08" },
  ];

  it("a mala considera só os dias de cada parada, na ordem das paradas", () => {
    const days = packingDaysForStops(byCity, stops);
    expect(days.map((d) => d.date)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
    ]);
    const packing = suggestPackingList(days);
    expect(packing.dayCount).toBe(4);
    expect(packing.items).toContain("guarda_chuva");
    expect(packing.items).toContain("casaco_quente");
  });

  it("busca o dia e as horas pela cidade da parada", () => {
    expect(weatherDayAt(byCity, porto.lat, porto.lng, "2026-10-07")?.maxTemperatureC).toBe(13);
    expect(weatherDayAt(byCity, porto.lat, porto.lng, "2026-10-20")).toBeNull();
    expect(weatherDayAt(byCity, null, porto.lng, "2026-10-07")).toBeNull();
    expect(weatherHoursAt(byCity, porto.lat, porto.lng)).toHaveLength(1);
    expect(weatherHoursAt(byCity, 0, 0)).toEqual([]);
  });
});

describe("hoursNeededForCityEnd", () => {
  const now = new Date("2026-10-02T12:00:00").getTime();
  it("pede ao menos 72h e no máximo 240h", () => {
    expect(hoursNeededForCityEnd(["2026-10-03"], now)).toBe(72);
    expect(hoursNeededForCityEnd(["2026-10-30"], now)).toBe(240);
    expect(hoursNeededForCityEnd(["2026-10-06", "2026-10-07"], now)).toBe(134);
  });
  it("não pede horas para parada já encerrada", () => {
    expect(hoursNeededForCityEnd(["2026-09-20"], now)).toBeNull();
    expect(hoursNeededForCityEnd([], now)).toBeNull();
  });
});
