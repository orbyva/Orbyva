import type { Movie, MovieMediaType, MovieTypeFilter } from "@/types/movies";
import { MovieStatus } from "@/types/movies";

export const MOVIE_TYPE_LABELS: Record<MovieMediaType, string> = {
  movie: "Filme",
  series: "Série",
};

/** Supabase may return text[] or a comma-separated string — normalize to string[]. */
export function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((s) => s.trim())
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

export function normalizeWatchedDates(
  dates: Movie["watched_dates"] | undefined
): string[] {
  if (!dates?.length) return [];
  return dates.map((d) =>
    d instanceof Date ? d.toISOString().split("T")[0] : String(d).slice(0, 10)
  );
}
