import { describe, expect, it } from "vitest";
import {
  datesTouchYear,
  isEntertainmentFavorite,
  pickRandomItem,
} from "@/domain/entertainment/insights";
import { getCinemaLibraryStats, pickRandomToWatchMovie } from "@/domain/movies";
import { getBookLibraryStats, pickRandomToReadBook } from "@/domain/books";
import { getAlbumLibraryStats, pickRandomToListenAlbum } from "@/domain/music";
import { MovieStatus, type Movie } from "@/types/movies";
import type { Book } from "@/types/books";
import type { Album } from "@/types/music";

describe("entertainment insights helpers", () => {
  it("marca favorito por nota ou recomendação", () => {
    expect(isEntertainmentFavorite({ rating: 8 })).toBe(true);
    expect(isEntertainmentFavorite({ rating: 7.5 })).toBe(false);
    expect(isEntertainmentFavorite({ rating: 6, would_recommend: true })).toBe(
      true
    );
  });

  it("detecta datas no ano", () => {
    expect(datesTouchYear(["2025-03-01", "2024-12-01"], 2025)).toBe(true);
    expect(datesTouchYear(["2024-12-01"], 2025)).toBe(false);
  });

  it("pickRandomItem retorna null em lista vazia", () => {
    expect(pickRandomItem([])).toBeNull();
  });
});

describe("getCinemaLibraryStats", () => {
  const movies = [
    {
      imdb_id: "1",
      title: "A",
      year: 2020,
      genre: [],
      actors: [],
      type: "movie",
      status: MovieStatus.WATCHED,
      rating: 9,
      watched_dates: ["2026-01-10"],
      would_recommend: true,
    },
    {
      imdb_id: "2",
      title: "B",
      year: 2021,
      genre: [],
      actors: [],
      type: "movie",
      status: MovieStatus.TO_WATCH,
      watched_dates: [],
    },
    {
      imdb_id: "3",
      title: "C",
      year: 2019,
      genre: [],
      actors: [],
      type: "movie",
      status: MovieStatus.WATCHED,
      rating: 7,
      watched_dates: ["2024-06-01"],
      would_recommend: false,
    },
  ] as Movie[];

  it("agrega status, favoritos e este ano", () => {
    const stats = getCinemaLibraryStats(movies, 2026);
    expect(stats.watched).toBe(2);
    expect(stats.toWatch).toBe(1);
    expect(stats.favorites).toBe(1);
    expect(stats.thisYear).toBe(1);
    expect(stats.avgRating).toBe(8);
  });

  it("escolhe só da lista para assistir", () => {
    const pick = pickRandomToWatchMovie(movies);
    expect(pick?.imdb_id).toBe("2");
    expect(pickRandomToWatchMovie([])).toBeNull();
  });
});

describe("getBookLibraryStats", () => {
  const books = [
    {
      google_id: "1",
      title: "Lido",
      authors: [],
      categories: [],
      status: "read",
      page_count: 300,
      rating: 8,
      read_dates: ["2026-02-01"],
      would_recommend: false,
    },
    {
      google_id: "2",
      title: "Fila",
      authors: [],
      categories: [],
      status: "to_read",
      read_dates: [],
    },
    {
      google_id: "3",
      title: "Sem páginas",
      authors: [],
      categories: [],
      status: "read",
      page_count: null,
      rating: 9,
      read_dates: ["2025-01-01"],
      would_recommend: true,
    },
  ] as Book[];

  it("soma páginas e conta favoritos/este ano", () => {
    const stats = getBookLibraryStats(books, 2026);
    expect(stats.read).toBe(2);
    expect(stats.toRead).toBe(1);
    expect(stats.pagesRead).toBe(300);
    expect(stats.favorites).toBe(2);
    expect(stats.thisYear).toBe(1);
  });

  it("escolhe só da fila", () => {
    expect(pickRandomToReadBook(books)?.google_id).toBe("2");
  });
});

describe("getAlbumLibraryStats", () => {
  const albums = [
    {
      musicbrainz_id: "1",
      title: "A",
      artists: [],
      album_type: "album",
      source: "manual",
      status: "listened",
      rating: 8.5,
      listened_dates: ["2026-03-01"],
      would_recommend: false,
    },
    {
      musicbrainz_id: "2",
      title: "B",
      artists: [],
      album_type: "ep",
      source: "manual",
      status: "to_listen",
      listened_dates: [],
    },
  ] as Album[];

  it("agrega ouvidos e fila", () => {
    const stats = getAlbumLibraryStats(albums, 2026);
    expect(stats.listened).toBe(1);
    expect(stats.toListen).toBe(1);
    expect(stats.favorites).toBe(1);
    expect(stats.thisYear).toBe(1);
  });

  it("escolhe só da fila", () => {
    expect(pickRandomToListenAlbum(albums)?.musicbrainz_id).toBe("2");
  });
});
