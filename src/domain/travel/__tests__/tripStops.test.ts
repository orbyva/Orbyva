import { describe, expect, it } from "vitest";
import {
  destinationFieldsFromStops,
  stopForDate,
  validateTripStops,
} from "@/domain/travel/tripStops";

describe("tripStops", () => {
  it("escolhe a parada do dia", () => {
    const stops = [
      {
        name: "Madrid",
        start_date: "2026-08-06",
        end_date: "2026-08-10",
        sort_order: 0,
      },
      {
        name: "Bruxelas",
        start_date: "2026-08-10",
        end_date: "2026-08-12",
        sort_order: 1,
      },
      {
        name: "Paris",
        start_date: "2026-08-12",
        end_date: "2026-08-16",
        sort_order: 2,
      },
    ];
    expect(stopForDate(stops, "2026-08-08")?.name).toBe("Madrid");
    // Dia de troca: prioriza a cidade de chegada.
    expect(stopForDate(stops, "2026-08-10")?.name).toBe("Bruxelas");
    expect(stopForDate(stops, "2026-08-11")?.name).toBe("Bruxelas");
    expect(stopForDate(stops, "2026-08-12")?.name).toBe("Paris");
    expect(stopForDate(stops, "2026-08-20")).toBeNull();
  });

  it("agrega destino legado", () => {
    const fields = destinationFieldsFromStops([
      {
        name: "Madrid",
        lat: 40.4,
        lng: -3.7,
        place_id: "pid1",
        start_date: "2026-08-10",
        end_date: "2026-08-12",
        sort_order: 0,
      },
      {
        name: "Paris",
        lat: 48.8,
        lng: 2.3,
        place_id: "pid2",
        start_date: "2026-08-12",
        end_date: "2026-08-15",
        sort_order: 1,
      },
    ]);
    expect(fields.destination).toBe("Madrid → Paris");
    expect(fields.destination_lat).toBe(40.4);
    expect(fields.destination_place_id).toBe("pid1");
  });

  it("valida intervalo das paradas", () => {
    expect(
      validateTripStops(
        [
          {
            name: "Madrid",
            start_date: "2026-08-10",
            end_date: "2026-08-20",
          },
        ],
        "2026-08-10",
        "2026-08-15"
      )
    ).toMatch(/dentro das datas/);
  });
});
