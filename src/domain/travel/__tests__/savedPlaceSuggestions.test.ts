import { describe, expect, it } from "vitest";
import type { PlaceVisit } from "@/types/places";
import {
  CITY_MATCH_RADIUS_KM,
  collectItineraryPlaceIds,
  haversineKm,
  isEligibleSuggestionPlace,
  isStopDismissed,
  suggestionAnchorForDay,
  suggestionHeading,
  suggestionsForAnchor,
} from "@/domain/travel/savedPlaceSuggestions";

const PARIS = { name: "Paris", lat: 48.8566, lng: 2.3522, place_id: "paris-id" };
const LYON = { name: "Lyon", lat: 45.764, lng: 4.8357, place_id: "lyon-id" };
const LOUVRE = { lat: 48.8606, lng: 2.3376 };
const VERSAILLES = { lat: 48.8049, lng: 2.1204 };

function place(
  patch: Partial<PlaceVisit> & Pick<PlaceVisit, "id" | "name">
): PlaceVisit {
  return {
    type: "attraction",
    status: "to_visit",
    would_recommend: true,
    lat: LOUVRE.lat,
    lng: LOUVRE.lng,
    trip_id: null,
    ...patch,
  };
}

describe("savedPlaceSuggestions", () => {
  it("Louvre fica a menos de 2 km do centro de Paris", () => {
    expect(haversineKm(PARIS, LOUVRE)).toBeLessThan(2);
  });

  it("Versailles entra no raio; Lyon não", () => {
    expect(haversineKm(PARIS, VERSAILLES)).toBeLessThan(CITY_MATCH_RADIUS_KM);
    expect(haversineKm(PARIS, LYON)).toBeGreaterThan(300);
  });

  it("âncora do dia usa a parada com coordenadas", () => {
    const anchor = suggestionAnchorForDay({
      date: "2026-08-14",
      stops: [
        {
          name: "Bruxelas",
          lat: 50.85,
          lng: 4.35,
          place_id: "bru",
          start_date: "2026-08-10",
          end_date: "2026-08-12",
          sort_order: 0,
        },
        {
          name: "Paris",
          lat: PARIS.lat,
          lng: PARIS.lng,
          place_id: PARIS.place_id,
          start_date: "2026-08-12",
          end_date: "2026-08-16",
          sort_order: 1,
        },
      ],
    });
    expect(anchor?.name).toBe("Paris");
    expect(anchor?.place_id).toBe("paris-id");
  });

  it("sem paradas, usa o destino legado da viagem", () => {
    const anchor = suggestionAnchorForDay({
      date: "2026-08-14",
      stops: [],
      fallback: PARIS,
    });
    expect(anchor?.name).toBe("Paris");
  });

  it("parada sem coordenadas não cai no destino de outra cidade", () => {
    const anchor = suggestionAnchorForDay({
      date: "2026-08-14",
      stops: [
        {
          name: "Paris",
          lat: null,
          lng: null,
          start_date: "2026-08-12",
          end_date: "2026-08-16",
          sort_order: 0,
        },
      ],
      fallback: LYON,
    });
    expect(anchor).toBeNull();
  });

  it("elegível: salvo sem viagem, ou já na lista desta; não visitado nem de outra viagem", () => {
    const ids = new Set(["on-itinerary"]);
    expect(
      isEligibleSuggestionPlace(
        place({ id: "a", name: "Louvre" }),
        "trip-1",
        ids
      )
    ).toBe(true);
    expect(
      isEligibleSuggestionPlace(
        place({ id: "b", name: "Café", trip_id: "trip-1" }),
        "trip-1",
        ids
      )
    ).toBe(true);
    expect(
      isEligibleSuggestionPlace(
        place({ id: "c", name: "Outra", trip_id: "trip-2" }),
        "trip-1",
        ids
      )
    ).toBe(false);
    expect(
      isEligibleSuggestionPlace(
        place({
          id: "d",
          name: "Já fui",
          status: "visited",
          visited_date: "2026-01-01",
        }),
        "trip-1",
        ids
      )
    ).toBe(false);
    expect(
      isEligibleSuggestionPlace(
        place({ id: "on-itinerary", name: "Já no dia" }),
        "trip-1",
        ids
      )
    ).toBe(false);
    expect(
      isEligibleSuggestionPlace(
        place({ id: "e", name: "Sem mapa", lat: null, lng: null }),
        "trip-1",
        ids
      )
    ).toBe(false);
  });

  it("sugere os de Paris e ignora Lyon; some se a cidade foi dispensada", () => {
    const louvre = place({ id: "louvre", name: "Louvre" });
    const cafe = place({
      id: "cafe",
      name: "Café de Flore",
      type: "cafe",
      trip_id: "euro",
    });
    const lyonPlace = place({
      id: "lyon-resto",
      name: "Bouchon",
      type: "restaurant",
      lat: LYON.lat,
      lng: LYON.lng,
    });
    const found = suggestionsForAnchor({
      candidates: [lyonPlace, louvre, cafe],
      anchor: PARIS,
      tripId: "euro",
      itineraryPlaceIds: new Set(),
      dismissed: [],
    });
    expect(found.map((p) => p.id)).toEqual(["cafe", "louvre"]);

    const dismissed = suggestionsForAnchor({
      candidates: [louvre],
      anchor: PARIS,
      tripId: "euro",
      itineraryPlaceIds: new Set(),
      dismissed: [{ ...PARIS, lat: 48.86, lng: 2.35 }],
    });
    expect(dismissed).toEqual([]);
  });

  it("dispensar Paris não esconde Lyon", () => {
    expect(isStopDismissed(LYON, [PARIS])).toBe(false);
    expect(isStopDismissed({ ...PARIS, lat: 48.87, lng: 2.33 }, [PARIS])).toBe(
      true
    );
  });

  it("collectItineraryPlaceIds lê as visitas do roteiro", () => {
    expect(
      collectItineraryPlaceIds([
        { activities: [{ place_visit_id: "a" }, { place_visit_id: null }] },
        { activities: [{ place_visit_id: "b" }] },
      ])
    ).toEqual(new Set(["a", "b"]));
  });

  it("copy do bloco", () => {
    expect(suggestionHeading(1, "Paris")).toBe(
      "Você salvou 1 lugar em Paris"
    );
    expect(suggestionHeading(7, "Paris")).toBe(
      "Você tem 7 lugares salvos em Paris"
    );
    expect(suggestionHeading(2, "")).toBe(
      "Você tem 2 lugares salvos neste destino"
    );
  });
});
