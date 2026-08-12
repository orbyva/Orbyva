import { describe, expect, it } from "vitest";
import {
  activityTimeToInput,
  findRoundTripTransfers,
} from "@/domain/travel/roundTripTransfers";
import type { TripItineraryActivity, TripItineraryDay } from "@/types/travel";

function act(
  partial: Partial<TripItineraryActivity> & Pick<TripItineraryActivity, "id" | "day_id" | "title">
): TripItineraryActivity {
  return {
    sort_order: 0,
    category: "transport",
    ...partial,
  };
}

function day(
  partial: Partial<TripItineraryDay> & Pick<TripItineraryDay, "id" | "day_number">
): TripItineraryDay {
  return {
    trip_id: "t1",
    activities: [],
    ...partial,
  };
}

describe("activityTimeToInput", () => {
  it("normaliza HH:mm:ss para HH:mm", () => {
    expect(activityTimeToInput("09:30:00")).toBe("09:30");
    expect(activityTimeToInput("")).toBe("");
    expect(activityTimeToInput(null)).toBe("");
  });
});

describe("findRoundTripTransfers", () => {
  it("acha ida e volta em dias distintos", () => {
    const outbound = act({
      id: "out",
      day_id: "d1",
      title: "Casa → Paris",
      sort_order: 0,
      origin_label: "Casa",
      origin_lat: -15.8,
      origin_lng: -47.9,
      destination_label: "Paris",
      destination_lat: 48.8,
      destination_lng: 2.3,
      activity_time: "08:00:00",
      arrival_time: "14:00:00",
    });
    const cityHop = act({
      id: "hop",
      day_id: "d3",
      title: "Lyon → Paris",
      sort_order: 0,
      origin_label: "Lyon",
      destination_label: "Paris",
    });
    const returnTrip = act({
      id: "ret",
      day_id: "d3",
      title: "Paris → Casa",
      sort_order: 1,
      origin_label: "Paris",
      destination_label: "Casa",
      destination_lat: -15.8,
      destination_lng: -47.9,
      activity_time: "18:00:00",
    });

    const match = findRoundTripTransfers({
      itinerary: [
        day({ id: "d1", day_number: 1, activities: [outbound] }),
        day({ id: "d2", day_number: 2, activities: [] }),
        day({ id: "d3", day_number: 3, activities: [cityHop, returnTrip] }),
      ],
      firstStop: { name: "Paris", lat: 48.8, lng: 2.3 },
      lastStop: { name: "Paris", lat: 48.8, lng: 2.3 },
    });

    expect(match.outbound?.id).toBe("out");
    expect(match.returnTrip?.id).toBe("ret");
    expect(match.home?.label).toBe("Casa");
  });

  it("acha ida e volta no mesmo dia", () => {
    const outbound = act({
      id: "out",
      day_id: "d1",
      title: "Home → Beach",
      sort_order: 0,
      origin_label: "Home",
      destination_label: "Beach",
    });
    const returnTrip = act({
      id: "ret",
      day_id: "d1",
      title: "Beach → Home",
      sort_order: 1,
      origin_label: "Beach",
      destination_label: "Home",
    });

    const match = findRoundTripTransfers({
      itinerary: [
        day({ id: "d1", day_number: 1, activities: [outbound, returnTrip] }),
      ],
      firstStop: { name: "Beach" },
      lastStop: { name: "Beach" },
    });

    expect(match.outbound?.id).toBe("out");
    expect(match.returnTrip?.id).toBe("ret");
    expect(match.home?.label).toBe("Home");
  });

  it("usa origin da viagem quando não há atividades", () => {
    const match = findRoundTripTransfers({
      itinerary: [day({ id: "d1", day_number: 1 })],
      tripOrigin: {
        label: "Brasília",
        lat: -15.8,
        lng: -47.9,
        place_id: null,
      },
    });
    expect(match.outbound).toBeNull();
    expect(match.returnTrip).toBeNull();
    expect(match.home?.label).toBe("Brasília");
  });
});
