import { describe, expect, it } from "vitest";

import {
  placeCardBadges,
  placeShortAddress,
  placesOverview,
  placeTypeCounts,
} from "../listView";
import type { PlaceVisit } from "@/types/places";

const lugar = (over: Partial<PlaceVisit>): PlaceVisit => ({
  id: "x",
  name: "Lugar",
  type: "restaurant",
  would_recommend: true,
  ...over,
});

const br = (iso: string) => iso.split("-").reverse().join("/");

describe("placesOverview", () => {
  it("conta visitados e para visitar, com média e % de recomendação", () => {
    const o = placesOverview([
      lugar({ status: "visited", rating: 5 }),
      lugar({ status: "visited", rating: 4, would_recommend: false }),
      lugar({ status: "visited", rating: 4 }),
      lugar({ status: "to_visit" }),
    ]);
    expect(o).toEqual({ visited: 3, toVisit: 1, avgRating: "4,3", recommendPct: 67 });
  });

  it("sem visitados, média e recomendação ficam nulas", () => {
    expect(placesOverview([lugar({ status: "to_visit" })])).toEqual({
      visited: 0,
      toVisit: 1,
      avgRating: null,
      recommendPct: null,
    });
  });

  it("status ausente segue a data de visita", () => {
    expect(placesOverview([lugar({ visited_date: "2026-09-01" })]).visited).toBe(1);
  });
});

describe("placeTypeCounts", () => {
  it("conta só a aba pedida, do mais frequente ao menos", () => {
    const counts = placeTypeCounts(
      [
        lugar({ status: "visited", type: "cafe" }),
        lugar({ status: "visited", type: "bar" }),
        lugar({ status: "visited", type: "bar" }),
        lugar({ status: "to_visit", type: "museum" }),
      ],
      "visited"
    );
    expect(counts).toEqual([
      { type: "bar", count: 2 },
      { type: "cafe", count: 1 },
    ]);
  });
});

describe("placeShortAddress", () => {
  it("extrai bairro e cidade do endereço do Google", () => {
    expect(
      placeShortAddress("R. Augusta, 1500 - Consolação, São Paulo - SP, 01304-001, Brasil")
    ).toBe("Consolação, São Paulo");
  });

  it("sem bairro, fica só a cidade", () => {
    expect(placeShortAddress("Av. Borges de Medeiros, 2500, Gramado - RS, Brasil")).toBe(
      "Gramado"
    );
  });

  it("endereço curto ou vazio", () => {
    expect(placeShortAddress("Centro histórico")).toBe("Centro histórico");
    expect(placeShortAddress("  ")).toBeNull();
    expect(placeShortAddress(null)).toBeNull();
  });
});

describe("placeCardBadges", () => {
  it("visitado: nota, recomendação, viagem e data", () => {
    expect(
      placeCardBadges(
        lugar({
          status: "visited",
          rating: 4.5,
          visited_date: "2026-09-20",
          trip: { id: "t", title: "Serra Gaúcha" },
        }),
        br
      )
    ).toEqual([
      { kind: "rating", label: "4,5" },
      { kind: "recommend", label: "Recomendo", positive: true },
      { kind: "trip", label: "Serra Gaúcha" },
      { kind: "date", label: "20/09/2026" },
    ]);
  });

  it("usa a média do grupo quando há mais de uma opinião", () => {
    const [nota] = placeCardBadges(
      lugar({
        status: "visited",
        rating: 3,
        opinionSummary: {
          avgRating: 4.2,
          ratedCount: 3,
          recommendYes: 3,
          recommendNo: 0,
          totalOpinions: 3,
        },
      }),
      br
    );
    expect(nota).toEqual({ kind: "rating", label: "4,2 · 3 opiniões" });
  });

  it("para visitar não ganha recomendação nem data", () => {
    expect(
      placeCardBadges(lugar({ status: "to_visit", would_recommend: false }), br)
    ).toEqual([]);
  });

  it("não recomendado aparece como negativo", () => {
    expect(
      placeCardBadges(lugar({ status: "visited", would_recommend: false }), br)
    ).toEqual([{ kind: "recommend", label: "Não recomendo", positive: false }]);
  });
});
