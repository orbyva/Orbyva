import type {
  Movie,
  MovieListFilter,
  MovieMediaType,
  MovieRatingFloor,
  MovieTypeFilter,
} from "@/types/movies";
import { MovieStatus } from "@/types/movies";
import {
  activityTouchesYear,
  appendActivityDate,
  isEntertainmentFavorite,
  normalizeEntertainmentDates,
  pickRandomItem,
} from "@/domain/entertainment/insights";

export const MOVIE_STATUS_LABELS: Record<MovieListFilter, string> = {
  to_watch: "Para assistir",
  watching: "Assistindo",
  watched: "Assistido",
  abandoned: "Abandonei",
};

export const MOVIE_TYPE_LABELS: Record<MovieMediaType, string> = {
  movie: "Filme",
  series: "Série",
};

function cleanListToken(value: string): string {
  return value
    .trim()
    .replace(/^\[+/, "")
    .replace(/\]+$/, "")
    .replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, "")
    .trim();
}

export function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) =>
        typeof item === "string" || typeof item === "number"
          ? [cleanListToken(String(item))]
          : asStringList(item)
      )
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return asStringList(parsed);
      } catch {
        /* split */
      }
    }
    return trimmed.split(",").map(cleanListToken).filter(Boolean);
  }
  return [];
}

export function normalizeMovie(raw: Movie): Movie {
  return {
    ...raw,
    genre: asStringList(raw.genre),
    actors: asStringList(raw.actors),
    watched_dates: normalizeEntertainmentDates(raw.watched_dates),
    would_recommend: raw.would_recommend !== false,
    is_favorite: raw.is_favorite === true,
  };
}

export function formatMovieRating(rating: number): string {
  return Number.isInteger(rating)
    ? String(rating)
    : rating.toFixed(1).replace(".", ",");
}

export function getLatestWatchedDate(dates: Movie["watched_dates"]): string | null {
  if (!dates?.length) return null;
  const sorted = [...dates]
    .map((d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)))
    .sort();
  return sorted[sorted.length - 1] ?? null;
}

export function newManualMovieId(): string {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `manual_${id}`;
}

export function movieStatusUpdate(
  movie: Movie,
  status: MovieStatus,
  todayIso: string
): { imdb_id: string; status: MovieStatus; watched_dates: string[] } {
  const dates = normalizeEntertainmentDates(movie.watched_dates);
  return {
    imdb_id: movie.imdb_id,
    status,
    watched_dates:
      status === MovieStatus.WATCHED
        ? appendActivityDate(dates, todayIso)
        : dates,
  };
}

export function filterMoviesByType<T extends { type: MovieMediaType }>(
  movies: T[],
  typeFilter: MovieTypeFilter
): T[] {
  if (typeFilter === "all") return movies;
  return movies.filter((movie) => movie.type === typeFilter);
}

export function collectMovieGenres(
  movies: { genre?: string[] | null }[]
): string[] {
  const set = new Set<string>();
  for (const movie of movies) {
    for (const genre of asStringList(movie.genre)) set.add(genre);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function filterMoviesByGenreAndRating<
  T extends { genre?: string[] | null; rating?: number | null },
>(
  movies: T[],
  options: { genre: string | "all"; minRating: MovieRatingFloor }
): T[] {
  const min = options.minRating === "all" ? null : Number(options.minRating);
  return movies.filter((movie) => {
    if (options.genre !== "all") {
      const genres = asStringList(movie.genre);
      if (!genres.some((g) => g.toLowerCase() === options.genre.toLowerCase())) {
        return false;
      }
    }
    if (min != null && (movie.rating == null || movie.rating < min)) return false;
    return true;
  });
}

export type CinemaLibraryStats = {
  watched: number;
  toWatch: number;
  watching: number;
  abandoned: number;
  favorites: number;
  thisYear: number;
  rated: number;
  avgRating: number | null;
};

export function getCinemaLibraryStats(
  movies: Movie[],
  year = new Date().getFullYear()
): CinemaLibraryStats {
  const watched = movies.filter((m) => m.status === MovieStatus.WATCHED);
  const rated = watched.filter((m) => m.rating != null && m.rating > 0);
  const avgRating =
    rated.length === 0
      ? null
      : Math.round(
          (rated.reduce((sum, m) => sum + (m.rating ?? 0), 0) / rated.length) * 10
        ) / 10;
  return {
    watched: watched.length,
    toWatch: movies.filter((m) => m.status === MovieStatus.TO_WATCH).length,
    watching: movies.filter((m) => m.status === MovieStatus.WATCHING).length,
    abandoned: movies.filter((m) => m.status === MovieStatus.ABANDONED).length,
    favorites: watched.filter((m) => isEntertainmentFavorite(m)).length,
    thisYear: watched.filter((m) =>
      activityTouchesYear(m.watched_dates, year, m.created_at)
    ).length,
    rated: rated.length,
    avgRating,
  };
}

export function pickRandomToWatchMovie(
  movies: Movie[],
  genre?: string | null
): Movie | null {
  let pool = movies.filter((m) => m.status === MovieStatus.TO_WATCH);
  if (genre && genre !== "all") {
    const needle = genre.toLowerCase();
    pool = pool.filter((m) =>
      asStringList(m.genre).some((g) => g.toLowerCase() === needle)
    );
  }
  return pickRandomItem(pool);
}

export function sumSeasonEpisodeCounts(
  seasons: { episode_count?: number }[]
): number {
  return seasons.reduce((sum, season) => sum + (season.episode_count ?? 0), 0);
}

export function getSeriesWatchProgress(options: {
  watched: number;
  total: number;
}): { watched: number; total: number; percent: number } | null {
  if (options.total <= 0) return null;
  const watched = Math.min(Math.max(0, options.watched), options.total);
  return {
    watched,
    total: options.total,
    percent: Math.round((watched / options.total) * 100),
  };
}

export { MovieStatus };
export type { MovieRatingFloor };
