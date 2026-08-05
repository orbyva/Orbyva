import type { Movie, MovieMediaType, MovieTypeFilter } from "@/types/movies";
import { MovieStatus } from "@/types/movies";
import {
  activityTouchesYear,
  isEntertainmentFavorite,
  normalizeEntertainmentDates,
  pickRandomItem,
} from "@/domain/entertainment/insights";

export const MOVIE_STATUS_LABELS: Record<MovieStatus, string> = {
  [MovieStatus.TO_WATCH]: "Para assistir",
  [MovieStatus.WATCHING]: "Assistindo",
  [MovieStatus.WATCHED]: "Assistido",
  [MovieStatus.ABANDONED]: "Abandonei",
};

export const MOVIE_TYPE_LABELS: Record<MovieMediaType, string> = {
  movie: "Filme",
  series: "Série",
};

/** Limpa aspas/colchetes residuais de tokens mal serializados. */
function cleanListToken(value: string): string {
  return value
    .trim()
    .replace(/^\[+/, "")
    .replace(/\]+$/, "")
    .replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, "")
    .trim();
}

/**
 * Supabase pode devolver text[], JSON stringificado (`["A","B"]`)
 * ou CSV — normaliza para string[] limpa.
 */
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
        /* cai no split */
      }
    }

    return trimmed
      .split(",")
      .map(cleanListToken)
      .filter(Boolean);
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

/** Converte nota Letterboxd (0–5) para escala Orbyva (0–10). */
export function letterboxdToTen(rating: number): number {
  return Math.round(rating * 2 * 10) / 10;
}

/** Formata nota 0–10 (vírgula BR). */
export function formatMovieRating(rating: number): string {
  return Number.isInteger(rating)
    ? String(rating)
    : rating.toFixed(1).replace(".", ",");
}

export function getMovieRatingLabel(rating: number): string {
  if (rating >= 9) return "Obra-prima";
  if (rating >= 8) return "Excelente";
  if (rating >= 7) return "Muito bom";
  if (rating >= 6) return "Bom";
  if (rating >= 4) return "Regular";
  if (rating >= 2) return "Fraco";
  return "Ruim";
}

/** Badge do card: nota do usuário (assistido) ou IMDb (lista / assistindo). */
export function getMovieCardRating(movie: Movie): {
  value: string;
  source: "user" | "imdb";
} | null {
  if (
    movie.status === MovieStatus.WATCHED &&
    movie.rating != null &&
    movie.rating > 0
  ) {
    return { value: formatMovieRating(movie.rating), source: "user" };
  }
  if (
    (movie.status === MovieStatus.TO_WATCH ||
      movie.status === MovieStatus.WATCHING) &&
    movie.score_imdb != null &&
    movie.score_imdb > 0
  ) {
    return { value: formatMovieRating(movie.score_imdb), source: "imdb" };
  }
  return null;
}

export function getDisplayScore(movie: Movie): string | number {
  return getMovieCardRating(movie)?.value ?? "—";
}

export function getLatestWatchedDate(
  dates: Movie["watched_dates"]
): string | null {
  if (!dates?.length) return null;
  const sorted = [...dates]
    .map((d) => (d instanceof Date ? d.toISOString() : String(d)))
    .sort();
  return sorted[sorted.length - 1] ?? null;
}

export function filterMoviesByType<T extends { type: MovieMediaType }>(
  movies: T[],
  typeFilter: MovieTypeFilter
): T[] {
  if (typeFilter === "all") return movies;
  return movies.filter((m) => m.type === typeFilter);
}

export type MovieRatingFloor = "all" | "6" | "7" | "8" | "9";

export function collectMovieGenres(
  movies: { genre?: string[] | null }[]
): string[] {
  const set = new Set<string>();
  for (const movie of movies) {
    for (const g of asStringList(movie.genre)) {
      set.add(g);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function filterMoviesByGenreAndRating<
  T extends { genre?: string[] | null; rating?: number | null; status?: string },
>(
  movies: T[],
  options: { genre: string | "all"; minRating: MovieRatingFloor }
): T[] {
  const min =
    options.minRating === "all" ? null : Number(options.minRating);

  return movies.filter((movie) => {
    if (options.genre !== "all") {
      const genres = asStringList(movie.genre);
      if (!genres.some((g) => g.toLowerCase() === options.genre.toLowerCase())) {
        return false;
      }
    }
    if (min != null) {
      if (movie.rating == null || movie.rating < min) return false;
    }
    return true;
  });
}

export function getWatchedMoviesStats(
  movies: { status?: string; rating?: number | null }[]
): { watched: number; rated: number; avgRating: number | null } {
  const watched = movies.filter((m) => m.status === MovieStatus.WATCHED);
  const rated = watched.filter((m) => m.rating != null && m.rating > 0);
  const avgRating =
    rated.length === 0
      ? null
      : Math.round(
          (rated.reduce((s, m) => s + (m.rating ?? 0), 0) / rated.length) * 10
        ) / 10;
  return { watched: watched.length, rated: rated.length, avgRating };
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

/** Agrega a biblioteca completa (todas as abas). */
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
          (rated.reduce((s, m) => s + (m.rating ?? 0), 0) / rated.length) * 10
        ) / 10;

  return {
    watched: watched.length,
    toWatch: movies.filter((m) => m.status === MovieStatus.TO_WATCH).length,
    watching: movies.filter((m) => m.status === MovieStatus.WATCHING).length,
    abandoned: movies.filter((m) => m.status === MovieStatus.ABANDONED).length,
    favorites: movies.filter(
      (m) =>
        m.status === MovieStatus.WATCHED && isEntertainmentFavorite(m)
    ).length,
    thisYear: watched.filter((m) =>
      activityTouchesYear(m.watched_dates, year, m.created_at)
    ).length,
    rated: rated.length,
    avgRating,
  };
}

export function pickRandomMovie(movies: Movie[]): Movie | null {
  return pickRandomItem(movies);
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

/** Soma episode_count das temporadas TMDB (exclui especiais). */
export function sumSeasonEpisodeCounts(
  seasons: { episode_count?: number }[]
): number {
  return seasons.reduce((sum, s) => sum + (s.episode_count ?? 0), 0);
}

export function getSeriesWatchProgress(options: {
  watched: number;
  total: number;
}): { watched: number; total: number; percent: number } | null {
  const total = options.total;
  if (total <= 0) return null;
  const watched = Math.min(Math.max(0, options.watched), total);
  return {
    watched,
    total,
    percent: Math.round((watched / total) * 100),
  };
}

export function normalizeWatchedDates(
  dates: Movie["watched_dates"] | undefined
): string[] {
  return normalizeEntertainmentDates(dates);
}
