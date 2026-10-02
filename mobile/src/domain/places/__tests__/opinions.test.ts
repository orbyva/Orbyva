import { describe, expect, it } from "vitest";

import { summarizePlaceOpinions } from "@/domain/places";

describe("summarizePlaceOpinions", () => {
  it("média só das notas dadas, arredondada a uma casa; recomenda conta ausência como sim", () => {
    expect(
      summarizePlaceOpinions([
        { rating: 5, would_recommend: true },
        { rating: 4, would_recommend: false },
        { rating: 4 },
        { rating: null, would_recommend: true },
      ])
    ).toEqual({
      avgRating: 4.3,
      ratedCount: 3,
      recommendYes: 3,
      recommendNo: 1,
      totalOpinions: 4,
    });
  });

  it("sem nota nenhuma, média nula", () => {
    expect(summarizePlaceOpinions([{ rating: 0 }]).avgRating).toBeNull();
  });
});
