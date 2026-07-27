import { describe, expect, it } from "vitest";
import { parseMovieImportCsv } from "@/lib/movieImport";
import {
  asStringList,
  formatMovieRating,
  getMovieRatingLabel,
  letterboxdToTen,
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

describe("parseMovieImportCsv", () => {
  it("parses Letterboxd-like diary CSV", () => {
    const csv = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
2024-01-15,Inception,2010,https://boxd.it/abc,4.5,,,2024-01-15
2024-02-01,The Matrix,1999,https://boxd.it/def,5,,,2024-02-01`;

    const result = parseMovieImportCsv(csv);
    expect(result.source).toBe("letterboxd");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      title: "Inception",
      year: 2010,
      rating: 9,
      watchedDate: "2024-01-15",
    });
    expect(result.rows[1].rating).toBe(10);
  });

  it("parses generic / TV Time style CSV", () => {
    const csv = `Title,Year,Score,Watched Date,Notes
Breaking Bad,2008,9.5,2023-05-01,Best show ever`;

    const result = parseMovieImportCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      title: "Breaking Bad",
      year: 2008,
      rating: 9.5,
      watchedDate: "2023-05-01",
      notes: "Best show ever",
    });
  });
});
