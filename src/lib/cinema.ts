/**
 * Camada de cinema: TMDB (pt-BR) preferencial, OMDB como fallback.
 */
import type { Movie } from "@/types/movies";
import {
  fetchMovieByImdbId as fetchOmdbByImdbId,
  findMovieByTitleYear as findOmdbByTitleYear,
  searchMovies as searchOmdb,
} from "@/lib/omdb";
import {
  fetchCinemaByImdbIdTmdb,
  fetchCinemaDetailsTmdb,
  findCinemaByTitleYearTmdb,
  isTmdbConfigured,
  searchCinemaTmdb,
  type CinemaSearchHit,
} from "@/lib/tmdb";

export type { CinemaSearchHit };
export { isTmdbConfigured };

export async function searchCinema(query: string): Promise<CinemaSearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  if (isTmdbConfigured()) {
    try {
      return await searchCinemaTmdb(q);
    } catch (error) {
      console.warn("TMDB search failed, falling back to OMDB:", error);
    }
  }

  const omdb = await searchOmdb(q);
  return omdb.map((m) => ({
    tmdb_id: 0,
    media_type: (m.type === "series" ? "tv" : "movie") as "tv" | "movie",
    title: m.title,
    year: m.year,
    poster: m.poster ?? null,
    overview: m.plot,
    imdb_id: m.imdb_id,
  }));
}

export async function fetchCinemaDetails(
  hit: CinemaSearchHit
): Promise<Movie | null> {
  if (isTmdbConfigured() && hit.tmdb_id > 0) {
    try {
      return await fetchCinemaDetailsTmdb(hit.tmdb_id, hit.media_type);
    } catch (error) {
      console.warn("TMDB detail failed:", error);
    }
  }

  if (hit.imdb_id) {
    return fetchOmdbByImdbId(hit.imdb_id);
  }

  const omdbHits = await searchOmdb(hit.title);
  const match =
    omdbHits.find(
      (m) =>
        m.title.toLowerCase() === hit.title.toLowerCase() &&
        (!hit.year || m.year === hit.year)
    ) ?? omdbHits[0];
  if (!match) return null;
  return fetchOmdbByImdbId(match.imdb_id);
}

export async function fetchCinemaByImdbId(
  imdbId: string
): Promise<Movie | null> {
  if (isTmdbConfigured()) {
    try {
      const movie = await fetchCinemaByImdbIdTmdb(imdbId);
      if (movie) return movie;
    } catch (error) {
      console.warn("TMDB find by imdb failed:", error);
    }
  }
  return fetchOmdbByImdbId(imdbId);
}

export async function findCinemaByTitleYear(
  title: string,
  year?: number | null
): Promise<Movie | null> {
  if (isTmdbConfigured()) {
    try {
      const movie = await findCinemaByTitleYearTmdb(title, year);
      if (movie) return movie;
    } catch (error) {
      console.warn("TMDB find by title failed:", error);
    }
  }
  return findOmdbByTitleYear(title, year);
}
