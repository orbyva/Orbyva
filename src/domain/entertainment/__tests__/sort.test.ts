import { describe, expect, it } from "vitest";
import {
  sortAlbums,
  sortBooks,
  sortMovies,
  type CatalogSort,
} from "@/domain/entertainment/sort";
import { MovieStatus, type Movie } from "@/types/movies";
import type { Book } from "@/types/books";
import type { Album } from "@/types/music";

const movies = [
  {
    imdb_id: "1",
    title: "Zebra",
    year: 2020,
    genre: [],
    actors: [],
    type: "movie",
    status: MovieStatus.WATCHED,
    rating: 7,
    watched_dates: ["2024-01-01"],
    created_at: "2024-01-02",
  },
  {
    imdb_id: "2",
    title: "Alpha",
    year: 2022,
    genre: [],
    actors: [],
    type: "movie",
    status: MovieStatus.WATCHED,
    rating: 9,
    watched_dates: ["2026-06-01"],
    created_at: "2026-06-02",
  },
  {
    imdb_id: "3",
    title: "Beta",
    year: 2019,
    genre: [],
    actors: [],
    type: "movie",
    status: MovieStatus.WATCHED,
    rating: null,
    watched_dates: [],
    created_at: "2025-01-01",
  },
] as Movie[];

describe("sortMovies", () => {
  it("ordena por título A–Z", () => {
    const ids = sortMovies(movies, "title_asc", "watched").map((m) => m.imdb_id);
    expect(ids).toEqual(["2", "3", "1"]);
  });

  it("ordena por nota (maior) com sem nota por último", () => {
    const ids = sortMovies(movies, "rating_desc", "watched").map((m) => m.imdb_id);
    expect(ids).toEqual(["2", "1", "3"]);
  });

  it("atividade recente usa watched_dates", () => {
    const ids = sortMovies(movies, "activity_desc", "watched").map(
      (m) => m.imdb_id
    );
    expect(ids[0]).toBe("2");
  });

  it("default em watched ordena por data de visão", () => {
    const ids = sortMovies(movies, "default", "watched").map((m) => m.imdb_id);
    expect(ids[0]).toBe("2");
  });
});

describe("sortBooks / sortAlbums", () => {
  it("ordena livros por ano", () => {
    const books = [
      {
        google_id: "a",
        title: "A",
        authors: [],
        categories: [],
        status: "to_read",
        published_year: 2010,
        read_dates: [],
      },
      {
        google_id: "b",
        title: "B",
        authors: [],
        categories: [],
        status: "to_read",
        published_year: 2020,
        read_dates: [],
      },
    ] as Book[];
    expect(
      sortBooks(books, "year_desc" as CatalogSort, "to_read").map((b) => b.google_id)
    ).toEqual(["b", "a"]);
  });

  it("ordena álbuns por título", () => {
    const albums = [
      {
        musicbrainz_id: "1",
        title: "Zoo",
        artists: [],
        album_type: "album",
        source: "manual",
        status: "to_listen",
        listened_dates: [],
      },
      {
        musicbrainz_id: "2",
        title: "Ark",
        artists: [],
        album_type: "album",
        source: "manual",
        status: "to_listen",
        listened_dates: [],
      },
    ] as Album[];
    expect(
      sortAlbums(albums, "title_asc", "to_listen").map((a) => a.musicbrainz_id)
    ).toEqual(["2", "1"]);
  });
});

describe("rating_asc", () => {
  it("ordena por nota menor primeiro", () => {
    const ids = sortMovies(movies, "rating_asc", "watched").map((m) => m.imdb_id);
    expect(ids).toEqual(["1", "2", "3"]); // 7, 9, null
  });

  it("na fila usa score IMDb exibido no card", () => {
    const queue = [
      {
        imdb_id: "hi",
        title: "High",
        year: 2020,
        genre: [],
        actors: [],
        type: "movie",
        status: MovieStatus.TO_WATCH,
        rating: null,
        score_imdb: 8.5,
        watched_dates: [],
      },
      {
        imdb_id: "lo",
        title: "Low",
        year: 2021,
        genre: [],
        actors: [],
        type: "movie",
        status: MovieStatus.TO_WATCH,
        rating: null,
        score_imdb: 5.2,
        watched_dates: [],
      },
    ] as Movie[];
    expect(
      sortMovies(queue, "rating_asc", "to_watch").map((m) => m.imdb_id)
    ).toEqual(["lo", "hi"]);
    expect(
      sortMovies(queue, "rating_desc", "to_watch").map((m) => m.imdb_id)
    ).toEqual(["hi", "lo"]);
  });
});
