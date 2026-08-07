import { describe, expect, it } from "vitest";
import {
  CLOTHING_LABELS,
  CLOTHING_META,
  clothingAttrLine,
  effectiveTempC,
  suggestClothingBands,
  suggestClothingForDay,
  suggestPackingList,
} from "@/domain/travel/clothing";
import type {
  WeatherDayForecast,
  WeatherHourForecast,
} from "@/lib/googleWeather";

function day(
  partial: Partial<WeatherDayForecast> & { date: string }
): WeatherDayForecast {
  return {
    conditionType: "CLEAR",
    conditionText: "Ensolarado",
    iconBaseUri: null,
    maxTemperatureC: 28,
    minTemperatureC: 18,
    humidityPercent: 50,
    rainProbabilityPercent: 10,
    precipitationMm: 0,
    windSpeedKph: 10,
    windGustKph: null,
    windCardinal: null,
    daytime: null,
    nighttime: null,
    ...partial,
  };
}

function hour(
  partial: Partial<WeatherHourForecast> & {
    localDate: string;
    localHour: number;
  }
): WeatherHourForecast {
  return {
    time: null,
    isDaytime: partial.localHour >= 6 && partial.localHour < 18,
    conditionType: "CLEAR",
    conditionText: "Limpo",
    iconBaseUri: null,
    temperatureC: 22,
    feelsLikeC: 21,
    humidityPercent: 55,
    rainProbabilityPercent: 5,
    precipitationMm: 0,
    windSpeedKph: 12,
    windGustKph: null,
    windCardinal: null,
    ...partial,
  };
}

describe("clothing V2", () => {
  it("sugere peças leves em dia quente", () => {
    const s = suggestClothingForDay(
      day({ date: "2026-08-10", maxTemperatureC: 32, minTemperatureC: 22 })
    );
    expect(s.items).toContain("regata");
    expect(s.items).toContain("shorts");
    expect(s.summary).toMatch(/°/);
    expect(s.dayPart.label).toBe("Dia");
    expect(s.nightPart.label).toBe("Madrugada");
    expect(s.bands.map((b) => b.key)).toEqual([
      "manha",
      "tarde",
      "noite",
      "madrugada",
    ]);
  });

  it("sugere capa quando chuva alta", () => {
    const s = suggestClothingForDay(
      day({
        date: "2026-08-11",
        maxTemperatureC: 20,
        minTemperatureC: 14,
        rainProbabilityPercent: 70,
      })
    );
    expect(s.items).toContain("capa_chuva");
    expect(CLOTHING_LABELS.capa_chuva).toBe("Capa de chuva");
  });

  it("diferencia dia quente e noite fria", () => {
    const s = suggestClothingForDay(
      day({
        date: "2026-08-12",
        maxTemperatureC: 30,
        minTemperatureC: 8,
        daytime: {
          conditionType: "CLEAR",
          conditionText: "Sol",
          iconBaseUri: null,
          humidityPercent: 40,
          rainProbabilityPercent: 0,
          precipitationMm: 0,
          windSpeedKph: 8,
          windGustKph: null,
          windCardinal: null,
          feelsLikeC: 31,
        },
        nighttime: {
          conditionType: "CLEAR",
          conditionText: "Frio",
          iconBaseUri: null,
          humidityPercent: 60,
          rainProbabilityPercent: 0,
          precipitationMm: 0,
          windSpeedKph: 20,
          windGustKph: null,
          windCardinal: null,
          feelsLikeC: 6,
        },
      })
    );
    expect(s.dayPart.items).toContain("regata");
    expect(s.nightPart.items).toContain("casaco_quente");
  });

  it("expõe atributos de peça", () => {
    expect(CLOTHING_META.camiseta_leve.fabric).toBe("algodao");
    expect(CLOTHING_META.casaco_quente.thickness).toBe("grossa");
    expect(clothingAttrLine("capa_chuva")).toMatch(/impermeável/);
  });

  it("usa feels like quando disponível", () => {
    expect(
      effectiveTempC({ tempC: 20, feelsLikeC: 14, windSpeedKph: 5 })
    ).toBe(14);
    expect(effectiveTempC({ tempC: 20, windSpeedKph: 30 })).toBeLessThan(20);
  });

  it("monta outfit com atributos e faixas horárias", () => {
    const s = suggestClothingForDay(
      day({ date: "2026-08-10", maxTemperatureC: 32, minTemperatureC: 22 }),
      [
        hour({
          localDate: "2026-08-10",
          localHour: 8,
          temperatureC: 24,
          feelsLikeC: 25,
        }),
        hour({
          localDate: "2026-08-10",
          localHour: 15,
          temperatureC: 33,
          feelsLikeC: 35,
        }),
      ]
    );
    expect(s.outfit.some((o) => o.slot === "top")).toBe(true);
    expect(s.outfit[0]?.fabric).toBeTruthy();
    expect(s.hourlySlots.length).toBe(2);
    expect(s.hourlySlots[1]?.primaryItem).toBe("regata");
    expect(s.summary).toMatch(/Sensação/);
    expect(s.outfitPhrase.length).toBeGreaterThan(0);
    expect(s.outfitWindowLabel).toBeNull();
    expect(s.dayPart.items.length).toBeGreaterThan(0);
    expect(s.nightPart.items.length).toBeGreaterThan(0);
  });

  it("hoje: outfit pela janela restante (agora → fim do dia)", () => {
    const s = suggestClothingForDay(
      day({
        date: "2026-08-10",
        maxTemperatureC: 34,
        minTemperatureC: 12,
        daytime: {
          conditionType: "CLEAR",
          conditionText: "Sol",
          iconBaseUri: null,
          humidityPercent: 40,
          rainProbabilityPercent: 0,
          precipitationMm: 0,
          windSpeedKph: 8,
          windGustKph: null,
          windCardinal: null,
          feelsLikeC: 35,
        },
      }),
      [
        hour({
          localDate: "2026-08-10",
          localHour: 20,
          temperatureC: 14,
          feelsLikeC: 12,
        }),
        hour({
          localDate: "2026-08-10",
          localHour: 22,
          temperatureC: 12,
          feelsLikeC: 10,
        }),
      ],
      { isToday: true }
    );
    expect(s.outfitWindowLabel).toBe("Agora → 22h");
    expect(s.outfitSegments).toHaveLength(1);
    expect(s.outfitSegments[0]?.key).toBe("remaining");
    expect(s.outfit.some((o) => o.slot === "outer")).toBe(true);
    expect(s.feelsLikeDayC).toBe(12);
  });

  it("amplitude grande: sugestão separada dia vs noite", () => {
    const s = suggestClothingForDay(
      day({
        date: "2026-08-10",
        maxTemperatureC: 37,
        minTemperatureC: 2,
        daytime: {
          conditionType: "CLEAR",
          conditionText: "Sol",
          iconBaseUri: null,
          humidityPercent: 30,
          rainProbabilityPercent: 0,
          precipitationMm: 0,
          windSpeedKph: 5,
          windGustKph: null,
          windCardinal: null,
          feelsLikeC: 37,
        },
        nighttime: {
          conditionType: "CLEAR",
          conditionText: "Frio",
          iconBaseUri: null,
          humidityPercent: 50,
          rainProbabilityPercent: 0,
          precipitationMm: 0,
          windSpeedKph: 10,
          windGustKph: null,
          windCardinal: null,
          feelsLikeC: 2,
        },
      })
    );
    expect(s.outfitSegments.map((x) => x.key)).toEqual(["day", "night"]);
    expect(s.outfitSegments[0]?.outfit.some((o) => o.item === "regata")).toBe(
      true
    );
    expect(
      s.outfitSegments[1]?.outfit.some((o) => o.item === "casaco_quente")
    ).toBe(true);
    expect(s.outfitPhrase).toMatch(/Dia:/);
    expect(s.outfitPhrase).toMatch(/Noite:/);
  });

  it("condição dia/noite quando diferem", () => {
    const s = suggestClothingForDay(
      day({
        date: "2026-08-10",
        maxTemperatureC: 30,
        minTemperatureC: 10,
        conditionText: "Ensolarado",
        daytime: {
          conditionType: "CLEAR",
          conditionText: "Ensolarado",
          iconBaseUri: null,
          humidityPercent: 40,
          rainProbabilityPercent: 0,
          precipitationMm: 0,
          windSpeedKph: 5,
          windGustKph: null,
          windCardinal: null,
          feelsLikeC: 30,
        },
        nighttime: {
          conditionType: "CLEAR",
          conditionText: "Limpo",
          iconBaseUri: null,
          humidityPercent: 50,
          rainProbabilityPercent: 0,
          precipitationMm: 0,
          windSpeedKph: 8,
          windGustKph: null,
          windCardinal: null,
          feelsLikeC: 10,
        },
      })
    );
    expect(s.conditionPhrase).toBe("Ensolarado de dia · Limpo à noite");
  });

  it("monta faixas hora a hora", () => {
    const bands = suggestClothingBands(
      [
        hour({ localDate: "2026-08-10", localHour: 8, temperatureC: 18, feelsLikeC: 16 }),
        hour({ localDate: "2026-08-10", localHour: 14, temperatureC: 31, feelsLikeC: 33 }),
        hour({ localDate: "2026-08-10", localHour: 20, temperatureC: 19, feelsLikeC: 17 }),
      ],
      "2026-08-10"
    );
    expect(bands.map((b) => b.key)).toEqual(
      expect.arrayContaining(["manha", "tarde", "noite"])
    );
    const tarde = bands.find((b) => b.key === "tarde");
    expect(tarde?.items).toContain("regata");
  });

  it("agrega mala do período", () => {
    const pack = suggestPackingList([
      day({ date: "2026-08-10", maxTemperatureC: 30, minTemperatureC: 20 }),
      day({
        date: "2026-08-11",
        maxTemperatureC: 18,
        minTemperatureC: 10,
        rainProbabilityPercent: 60,
      }),
    ]);
    expect(pack.dayCount).toBe(2);
    expect(pack.items.length).toBeGreaterThan(0);
    expect(pack.summary.length).toBeGreaterThan(0);
  });
});
