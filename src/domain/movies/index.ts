import type { Movie, MovieMediaType, MovieTypeFilter } from "@/types/movies";
import { MovieStatus } from "@/types/movies";

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
    watched_dates: Array.isArray(raw.watched_dates) ? raw.watched_dates : [],
    would_recommend: raw.would_recommend !== false,
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

export function getDisplayScore(movie: Movie): string | number {
  if (movie.status === MovieStatus.WATCHED) {
    return movie.rating != null ? formatMovieRating(movie.rating) : "—";
  }
  return movie.score_imdb != null ? formatMovieRating(movie.score_imdb) : "—";
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
  if (!dates?.length) return [];
  return dates.map((d) =>
    d instanceof Date ? d.toISOString().split("T")[0] : String(d).slice(0, 10)
  );
}
