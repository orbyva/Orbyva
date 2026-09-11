import { MovieStatus } from "@/types/movies";
import type { Movie } from "@/types/movies";
import { tmdbApiKey } from "@/lib/env";

const API_URL = "https://api.themoviedb.org/3";
const IMG_URL = "https://image.tmdb.org/t/p/w500";

export type CinemaSearchHit = {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  year: number;
  poster: string | null;
  overview?: string | null;
};

export function isCinemaCatalogAvailable(): boolean {
  return Boolean(tmdbApiKey);
}

async function tmdbGet<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  if (!tmdbApiKey) {
    throw new Error("Catálogo de cinema temporariamente indisponível.");
  }
  const url = new URL(`${API_URL}${path}`);
  url.searchParams.set("api_key", tmdbApiKey);
  url.searchParams.set("language", "pt-BR");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Não foi possível consultar o catálogo de cinema.");
  return (await res.json()) as T;
}

export async function searchCinemaCatalog(query: string): Promise<CinemaSearchHit[]> {
  const q = query.trim();
  if (!q || !tmdbApiKey) return [];
  const data = await tmdbGet<{
    results?: Array<{
      id: number;
      media_type?: string;
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
      poster_path?: string | null;
      overview?: string;
    }>;
  }>("/search/multi", { query: q, include_adult: "false" });

  const hits: CinemaSearchHit[] = [];
  for (const item of data.results ?? []) {
    if (item.media_type !== "movie" && item.media_type !== "tv") continue;
    const date = item.release_date || item.first_air_date || "";
    hits.push({
      tmdb_id: item.id,
      media_type: item.media_type,
      title: (item.title || item.name || "Sem título").trim(),
      year: date.length >= 4 ? Number.parseInt(date.slice(0, 4), 10) || 0 : 0,
      poster: item.poster_path ? `${IMG_URL}${item.poster_path}` : null,
      overview: item.overview || null,
    });
  }
  return hits;
}

export async function fetchCinemaDetails(
  hit: CinemaSearchHit
): Promise<Movie | null> {
  if (!tmdbApiKey || hit.tmdb_id <= 0) return null;
  const path = hit.media_type === "tv" ? `/tv/${hit.tmdb_id}` : `/movie/${hit.tmdb_id}`;
  const detail = await tmdbGet<{
    id: number;
    title?: string;
    name?: string;
    release_date?: string;
    first_air_date?: string;
    poster_path?: string | null;
    overview?: string;
    genres?: { name: string }[];
    vote_average?: number;
    credits?: {
      cast?: { name: string; order: number }[];
      crew?: { name: string; job: string }[];
    };
    external_ids?: { imdb_id?: string | null };
  }>(path, { append_to_response: "external_ids,credits" });

  const date = detail.release_date || detail.first_air_date || "";
  const imdb =
    detail.external_ids?.imdb_id && detail.external_ids.imdb_id !== "null"
      ? detail.external_ids.imdb_id.trim()
      : hit.media_type === "tv"
        ? `tmdb_tv_${detail.id}`
        : `tmdb_m_${detail.id}`;
  const directors =
    detail.credits?.crew?.filter((c) => c.job === "Director").map((c) => c.name) ?? [];
  const actors = (detail.credits?.cast ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .slice(0, 8)
    .map((c) => c.name);

  return {
    imdb_id: imdb,
    title: (detail.title || detail.name || hit.title).trim(),
    year: date.length >= 4 ? Number.parseInt(date.slice(0, 4), 10) || hit.year : hit.year,
    poster: detail.poster_path ? `${IMG_URL}${detail.poster_path}` : hit.poster,
    genre: (detail.genres ?? []).map((g) => g.name).filter(Boolean),
    director: directors[0] ?? null,
    actors,
    plot: detail.overview?.trim() || hit.overview || null,
    type: hit.media_type === "tv" ? "series" : "movie",
    rating: null,
    score_imdb:
      detail.vote_average != null && detail.vote_average > 0
        ? Math.round(detail.vote_average * 10) / 10
        : null,
    status: MovieStatus.TO_WATCH,
    watched_dates: [],
    notes: null,
    would_recommend: true,
    tmdb_tv_id: hit.media_type === "tv" ? detail.id : null,
    following: true,
    notify_new_episodes: false,
  };
}

export function parseTmdbTvId(
  imdbId: string,
  tmdbTvId?: number | null
): number | null {
  if (tmdbTvId != null && Number.isFinite(tmdbTvId) && tmdbTvId > 0) {
    return tmdbTvId;
  }
  const match = /^tmdb_tv_(\d+)$/i.exec(imdbId.trim());
  return match ? Number(match[1]) : null;
}

export type TmdbAirEpisode = {
  season_number: number;
  episode_number: number;
  name?: string | null;
  air_date?: string | null;
};

export async function fetchTvAirEpisodesTmdb(tmdbTvId: number): Promise<{
  last_episode_to_air?: TmdbAirEpisode | null;
  next_episode_to_air?: TmdbAirEpisode | null;
} | null> {
  if (!tmdbApiKey) return null;
  try {
    const detail = await tmdbGet<{
      last_episode_to_air?: TmdbAirEpisode | null;
      next_episode_to_air?: TmdbAirEpisode | null;
    }>(`/tv/${tmdbTvId}`);
    return {
      last_episode_to_air: detail.last_episode_to_air ?? null,
      next_episode_to_air: detail.next_episode_to_air ?? null,
    };
  } catch {
    return null;
  }
}

export type TmdbSeasonSummary = {
  season_number: number;
  name: string;
  episode_count: number;
};

export type TmdbEpisode = {
  id: number;
  season_number: number;
  episode_number: number;
  name: string;
  air_date?: string | null;
};

export async function fetchTvMetaTmdb(
  tmdbTvId: number
): Promise<{ seasons: TmdbSeasonSummary[]; episodeCount: number } | null> {
  if (!tmdbApiKey) return null;
  try {
    const detail = await tmdbGet<{
      seasons?: {
        season_number: number;
        name?: string;
        episode_count?: number;
      }[];
    }>(`/tv/${tmdbTvId}`);
    const seasons = (detail.seasons ?? [])
      .filter((season) => season.season_number > 0 && (season.episode_count ?? 0) > 0)
      .map((season) => ({
        season_number: season.season_number,
        name: season.name?.trim() || `Temporada ${season.season_number}`,
        episode_count: season.episode_count ?? 0,
      }));
    return {
      seasons,
      episodeCount: seasons.reduce((sum, season) => sum + season.episode_count, 0),
    };
  } catch {
    return null;
  }
}

export async function fetchTvSeasonEpisodesTmdb(
  tmdbTvId: number,
  seasonNumber: number
): Promise<TmdbEpisode[]> {
  if (!tmdbApiKey) return [];
  try {
    const data = await tmdbGet<{
      episodes?: {
        id: number;
        season_number: number;
        episode_number: number;
        name?: string;
        air_date?: string | null;
      }[];
    }>(`/tv/${tmdbTvId}/season/${seasonNumber}`);
    return (data.episodes ?? []).map((episode) => ({
      id: episode.id,
      season_number: episode.season_number,
      episode_number: episode.episode_number,
      name: episode.name?.trim() || `Episódio ${episode.episode_number}`,
      air_date: episode.air_date ?? null,
    }));
  } catch {
    return [];
  }
}
