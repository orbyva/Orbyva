import { describe, expect, it } from "vitest";
import {
  lodgingStopForDate,
  planItineraryTransfers,
  planTransferActivitySync,
  toItineraryActivityInput,
  type StopLike,
  type TransferActivityLike,
  type TransferDayLike,
} from "@/domain/travel/itineraryTransfers";

const home = {
  label: "Valparaíso",
  lat: -16.07,
  lng: -47.98,
  place_id: "valp",
};

const altoParaiso: StopLike = {
  name: "Alto Paraíso de Goiás",
  place_id: "ap",
  lat: -14.13,
  lng: -47.51,
  start_date: "2026-09-15",
  end_date: "2026-09-18",
  sort_order: 0,
};

const saoJorge: StopLike = {
  name: "São Jorge",
  place_id: "sj",
  lat: -14.18,
  lng: -47.81,
  start_date: "2026-09-17",
  end_date: "2026-09-17",
  sort_order: 1,
};

function titlesOn(date: string, stops = [altoParaiso, saoJorge]) {
  return planItineraryTransfers({
    stops,
    startDate: "2026-09-15",
    endDate: "2026-09-18",
    home,
  })
    .filter((t) => t.date === date)
    .map((t) => `${t.origin.label} → ${t.destination.label}`);
}

describe("lodgingStopForDate", () => {
  it("mantém Alto Paraíso no dia do passeio a São Jorge", () => {
    expect(
      lodgingStopForDate([altoParaiso, saoJorge], "2026-09-17")?.name
    ).toBe("Alto Paraíso de Goiás");
    expect(
      lodgingStopForDate([altoParaiso, saoJorge], "2026-09-18")?.name
    ).toBe("Alto Paraíso de Goiás");
  });
});

describe("planItineraryTransfers", () => {
  it("no passeio de um dia, volta para a hospedagem e não para a origem", () => {
    const planned = planItineraryTransfers({
      stops: [altoParaiso, saoJorge],
      startDate: "2026-09-15",
      endDate: "2026-09-18",
      home,
    });

    expect(titlesOn("2026-09-15")).toEqual([
      "Valparaíso → Alto Paraíso de Goiás",
    ]);
    expect(titlesOn("2026-09-17")).toEqual([
      "Alto Paraíso de Goiás → São Jorge",
      "São Jorge → Alto Paraíso de Goiás",
    ]);
    expect(titlesOn("2026-09-18")).toEqual([
      "Alto Paraíso de Goiás → Valparaíso",
    ]);
    expect(
      planned.some(
        (t) =>
          t.origin.label === "São Jorge" && t.destination.label === "Valparaíso"
      )
    ).toBe(false);
    expect(planned.find((t) => t.role === "return")?.origin.label).toBe(
      "Alto Paraíso de Goiás"
    );
  });

  it("só volta à origem se o passeio for o último local do último dia", () => {
    const lastDayVisit: StopLike = {
      ...saoJorge,
      start_date: "2026-09-18",
      end_date: "2026-09-18",
    };
    const planned = planItineraryTransfers({
      stops: [altoParaiso, lastDayVisit],
      startDate: "2026-09-15",
      endDate: "2026-09-18",
      home,
    });
    expect(
      planned.filter((t) => t.date === "2026-09-18").map((t) => t.role)
    ).toEqual(["leg", "return"]);
    expect(
      planned
        .filter((t) => t.date === "2026-09-18")
        .map((t) => `${t.origin.label} → ${t.destination.label}`)
    ).toEqual([
      "Alto Paraíso de Goiás → São Jorge",
      "São Jorge → Valparaíso",
    ]);
  });

  it("liga cidades consecutivas sem overlap", () => {
    const planned = planItineraryTransfers({
      stops: [
        {
          name: "Madrid",
          start_date: "2026-08-01",
          end_date: "2026-08-03",
          sort_order: 0,
        },
        {
          name: "Paris",
          start_date: "2026-08-04",
          end_date: "2026-08-06",
          sort_order: 1,
        },
      ],
      startDate: "2026-08-01",
      endDate: "2026-08-06",
      home: { label: "Casa", lat: null, lng: null, place_id: null },
    });
    expect(
      planned.map((t) => `${t.date}:${t.origin.label} → ${t.destination.label}`)
    ).toEqual([
      "2026-08-01:Casa → Madrid",
      "2026-08-04:Madrid → Paris",
      "2026-08-06:Paris → Casa",
    ]);
  });
});

describe("planTransferActivitySync", () => {
  it("corrige São Jorge → Valparaíso no dia do passeio para a hospedagem", () => {
    const stale: TransferActivityLike = {
      id: "stale-home",
      day_id: "d17",
      title: "São Jorge → Valparaíso",
      category: "transport",
      origin_label: "São Jorge",
      origin_place_id: "sj",
      destination_label: "Valparaíso",
      destination_place_id: "valp",
      sort_order: 0,
    };
    const days: TransferDayLike[] = [
      { id: "d15", date: "2026-09-15", activities: [] },
      { id: "d16", date: "2026-09-16", activities: [] },
      { id: "d17", date: "2026-09-17", activities: [stale] },
      { id: "d18", date: "2026-09-18", activities: [] },
    ];
    const planned = planItineraryTransfers({
      stops: [altoParaiso, saoJorge],
      startDate: "2026-09-15",
      endDate: "2026-09-18",
      home,
    });
    const sync = planTransferActivitySync({
      planned,
      days,
      home,
      mode: "car",
    });

    expect(
      sync.update.find((u) => u.id === "stale-home")?.title
    ).toBe("São Jorge → Alto Paraíso de Goiás");
    expect(sync.create.map((c) => `${c.date}:${c.title}`)).toEqual([
      "2026-09-15:Valparaíso → Alto Paraíso de Goiás",
      "2026-09-17:Alto Paraíso de Goiás → São Jorge",
      "2026-09-18:Alto Paraíso de Goiás → Valparaíso",
    ]);
    expect(sync.deleteIds).toEqual([]);
    expect("date" in toItineraryActivityInput(sync.create[0]!)).toBe(false);
  });
});
