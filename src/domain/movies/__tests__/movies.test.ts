import { describe, expect, it } from "vitest";
import {
  asStringList,
  formatMovieRating,
  getMovieRatingLabel,
  letterboxdToTen,
  MOVIE_STATUS_LABELS,
} from "@/domain/movies";

describe("asStringList", () => {
  it("keeps arrays and splits comma strings", () => {
    expect(asStringList(["Action", "Drama"])).toEqual(["Action", "Drama"]);
    expect(asStringList("Action, Drama")).toEqual(["Action", "Drama"]);
    expect(asStringList(null)).toEqual([]);
  });

  it("parseia JSON stringificado sem aspas/colchetes", () => {
    expect(asStringList('["Crime", "Drama", "Thriller"]')).toEqual([
      "Crime",
      "Drama",
      "Thriller",
    ]);
    expect(
      asStringList(
        '["Jude Law", "Nicholas Hoult", "Tye Sheridan"]'
      )
    ).toEqual(["Jude Law", "Nicholas Hoult", "Tye Sheridan"]);
  });

  it("limpa tokens quebrados de split ingenuo", () => {
    expect(asStringList(['["Crime"', '"Drama"', '"Thriller"]'])).toEqual([
      "Crime",
      "Drama",
      "Thriller",
    ]);
  });
});

describe("letterboxdToTen", () => {
  it("converts 5-star scale to 10", () => {
    expect(letterboxdToTen(4.5)).toBe(9);
    expect(letterboxdToTen(3)).toBe(6);
  });
});

describe("formatMovieRating / labels", () => {
  it("formats half scores with comma", () => {
    expect(formatMovieRating(8.5)).toBe("8,5");
    expect(formatMovieRating(8)).toBe("8");
  });

  it("labels high scores", () => {
    expect(getMovieRatingLabel(9.5)).toBe("Obra-prima");
    expect(getMovieRatingLabel(7)).toBe("Muito bom");
  });
});

describe("MOVIE_STATUS_LABELS", () => {
  it("covers watching and abandoned", () => {
    expect(MOVIE_STATUS_LABELS.watching).toBe("Assistindo");
    expect(MOVIE_STATUS_LABELS.abandoned).toBe("Abandonei");
  });
});
