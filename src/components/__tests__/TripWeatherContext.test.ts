import { describe, expect, it } from "vitest";
import {
  cityWeatherKey,
  hoursNeededForCityEnd,
} from "@/components/TripWeatherContext";

describe("TripWeather share helpers", () => {
  it("chave de cidade por lat/lng arredondados", () => {
    expect(cityWeatherKey(40.4168, -3.7038)).toBe("40.417|-3.704");
    expect(cityWeatherKey(40.4168, -3.7038)).toBe(
      cityWeatherKey(40.41681, -3.70379)
    );
  });

  it("calcula hours até o fim da parada com mínimo 72", () => {
    const inThreeDays = new Date();
    inThreeDays.setUTCDate(inThreeDays.getUTCDate() + 3);
    const end = inThreeDays.toISOString().slice(0, 10);
    const hours = hoursNeededForCityEnd([end]);
    expect(hours).not.toBeNull();
    expect(hours!).toBeGreaterThanOrEqual(72);
    expect(hours!).toBeLessThanOrEqual(240);
  });

  it("retorna null para paradas antigas", () => {
    expect(hoursNeededForCityEnd(["2020-01-01"])).toBeNull();
  });
});
