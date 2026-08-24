import { describe, expect, it } from "vitest";
import {
  mergeEntertainmentDates,
  mergeEntertainmentScalars,
  mergeTrackRatings,
} from "@/domain/orb/mergeEntertainment";

describe("mergeEntertainmentScalars", () => {
  it("não sobrescreve notes existente com valor vazio/ausente", () => {
    const existing = {
      status: "watched",
      rating: 8,
      notes: "Ótimo filme",
      would_recommend: true,
      is_favorite: true,
    };
    const merged = mergeEntertainmentScalars(existing, {
      status: "watched",
      notes: "   ",
    });
    expect(merged.notes).toBe("Ótimo filme");
  });

  it("usa o novo rating quando informado, preserva quando ausente", () => {
    const existing = { status: "watched", rating: 6 };
    expect(
      mergeEntertainmentScalars(existing, { status: "watched", rating: 9 })
        .rating
    ).toBe(9);
    expect(
      mergeEntertainmentScalars(existing, { status: "watched" }).rating
    ).toBe(6);
  });

  it("preserva is_favorite quando o payload novo não manda o campo", () => {
    const existing = { status: "watched", is_favorite: true };
    expect(
      mergeEntertainmentScalars(existing, { status: "watched" }).is_favorite
    ).toBe(true);
    expect(
      mergeEntertainmentScalars(existing, {
        status: "watched",
        is_favorite: false,
      }).is_favorite
    ).toBe(false);
  });

  it("sempre adota o novo status", () => {
    expect(
      mergeEntertainmentScalars(
        { status: "watching" },
        { status: "watched" }
      ).status
    ).toBe("watched");
  });
});

describe("mergeEntertainmentDates", () => {
  it("une datas sem duplicar", () => {
    expect(
      mergeEntertainmentDates(["2026-01-01"], ["2026-01-01", "2026-02-01"])
    ).toEqual(["2026-01-01", "2026-02-01"]);
  });

  it("normaliza formatos mistos antes de unir", () => {
    expect(
      mergeEntertainmentDates(["01/03/2026"], [new Date(2026, 2, 1)])
    ).toEqual(["2026-03-01"]);
  });

  it("lida com listas vazias", () => {
    expect(mergeEntertainmentDates(undefined, [])).toEqual([]);
  });
});

describe("mergeTrackRatings", () => {
  it("mantém existente quando incoming está vazio", () => {
    expect(mergeTrackRatings({ "1:1": 8 }, undefined)).toEqual({ "1:1": 8 });
    expect(mergeTrackRatings({ "1:1": 8 }, {})).toEqual({ "1:1": 8 });
  });

  it("sobrescreve só as chaves informadas", () => {
    expect(mergeTrackRatings({ "1:1": 8, "1:2": 5 }, { "1:2": 9 })).toEqual({
      "1:1": 8,
      "1:2": 9,
    });
  });
});
