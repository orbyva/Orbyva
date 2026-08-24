/** Fallback OMDb pra Deno — só usado quando TMDB não está configurado/falha. */
import type { MovieDraft } from "./tmdb.ts";

const API_URL = "https://www.omdbapi.com/";

function apiKey(): string | null {
  const key = (Deno.env.get("OMDB_API_KEY") ?? "").trim();
  return key || null;
}

export function isOmdbConfigured(): boolean {
  return apiKey() != null;
}

interface OmdbSearchResult {
  imdbID: string;
  Title: string;
  Year: string;
}

interface OmdbMovieResponse extends OmdbSearchResult {
  Genre?: string;
  Director?: string;
  Actors?: string;
  Plot?: string;
  Poster?: string;
  Type?: string;
  imdbRating?: string;
  Response?: "True" | "False";
}

function draftFromOmdb(movie: OmdbMovieResponse): MovieDraft {
  return {
    imdb_id: movie.imdbID,
    title: movie.Title,
    year: parseInt(movie.Year, 10) || 0,
    poster: movie.Poster && movie.Poster !== "N/A" ? movie.Poster : null,
    genre: movie.Genre ? movie.Genre.split(", ").filter(Boolean) : [],
    director: movie.Director && movie.Director !== "N/A" ? movie.Director : null,
    actors:
      movie.Actors && movie.Actors !== "N/A" ? movie.Actors.split(", ") : [],
    plot: movie.Plot && movie.Plot !== "N/A" ? movie.Plot : null,
    type: movie.Type === "series" ? "series" : "movie",
    score_imdb:
      movie.imdbRating && movie.imdbRating !== "N/A"
        ? parseFloat(movie.imdbRating)
        : null,
    tmdb_tv_id: null,
  };
}

export async function findMovieByTitleYearOmdb(
  title: string,
  year?: number | null
): Promise<MovieDraft | null> {
  const key = apiKey();
  if (!key) return null;

  const res = await fetch(
    `${API_URL}?s=${encodeURIComponent(title)}&apikey=${key}`
  );
  const data = (await res.json()) as {
    Search?: OmdbSearchResult[];
    Response: "True" | "False";
  };
  if (!data.Search?.length) return null;

  const normalized = title.trim().toLowerCase();
  const exact = data.Search.find(
    (r) =>
      r.Title.toLowerCase() === normalized &&
      (year == null || Number(r.Year) === year)
  );
  const yearMatch = year ? data.Search.find((r) => Number(r.Year) === year) : undefined;
  const pick = exact ?? yearMatch ?? data.Search[0];

  const detailRes = await fetch(`${API_URL}?i=${pick.imdbID}&apikey=${key}`);
  const detail = (await detailRes.json()) as OmdbMovieResponse;
  if (detail.Response === "False") return null;
  return draftFromOmdb(detail);
}
