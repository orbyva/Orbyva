import { Movie, MovieStatus } from "@/types/movies";

const API_URL = "https://api.themoviedb.org/3";
const IMG_URL = "https://image.tmdb.org/t/p/w500";
const LANG = "pt-BR";
const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

export type TmdbMediaType = "movie" | "tv";

/** Resultado de busca (ainda sem imdb_id definitivo). */
export type CinemaSearchHit = {
  tmdb_id: number;
  media_type: TmdbMediaType;
  title: string;
  year: number;
  poster: string | null;
  overview?: string | null;
  /** Preenchido só no fallback OMDB. */
  imdb_id?: string;
};

type TmdbSearchItem = {
  id: number;
  media_type?: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
};

type TmdbSearchResponse = {
  results?: TmdbSearchItem[];
};

type TmdbGenre = { id: number; name: string };

type TmdbCredits = {
  cast?: { name: string; order: number }[];
  crew?: { name: string; job: string }[];
};

type TmdbExternalIds = {
  imdb_id?: string | null;
};

type TmdbMovieDetail = {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  genres?: TmdbGenre[];
  vote_average?: number;
  credits?: TmdbCredits;
  external_ids?: TmdbExternalIds;
};

export function isTmdbConfigured(): boolean {
  return Boolean(API_KEY && String(API_KEY).trim());
}

function posterUrl(path?: string | null): string | null {
  if (!path) return null;
  return `${IMG_URL}${path}`;
}

function yearFromDate(date?: string): number {
  if (!date || date.length < 4) return 0;
  const y = parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) ? y : 0;
}

function syntheticImdbId(media: TmdbMediaType, tmdbId: number): string {
  return media === "tv" ? `tmdb_tv_${tmdbId}` : `tmdb_m_${tmdbId}`;
}

async function tmdbGet<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  if (!isTmdbConfigured()) {
    throw new Error("TMDB não configurada. Defina VITE_TMDB_API_KEY no .env.");
  }
  const url = new URL(`${API_URL}${path}`);
  url.searchParams.set("api_key", String(API_KEY));
  url.searchParams.set("language", LANG);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`TMDB ${res.status}`);
  }
  return (await res.json()) as T;
}

function hitFromItem(
  item: TmdbSearchItem,
  media: TmdbMediaType
): CinemaSearchHit {
  return {
    tmdb_id: item.id,
    media_type: media,
    title: (item.title || item.name || "Sem título").trim(),
    year: yearFromDate(item.release_date || item.first_air_date),
    poster: posterUrl(item.poster_path),
    overview: item.overview || null,
  };
}

/** Busca filmes e séries em português. */
export async function searchCinemaTmdb(query: string): Promise<CinemaSearchHit[]> {
  const data = await tmdbGet<TmdbSearchResponse>("/search/multi", {
    query: query.trim(),
    include_adult: "false",
  });

  const hits: CinemaSearchHit[] = [];
  for (const item of data.results ?? []) {
    if (item.media_type === "movie") {
      hits.push(hitFromItem(item, "movie"));
    } else if (item.media_type === "tv") {
      hits.push(hitFromItem(item, "tv"));
    }
  }
  return hits;
}

function formatDetail(
  detail: TmdbMovieDetail,
  media: TmdbMediaType
): Movie {
  const imdb =
    detail.external_ids?.imdb_id &&
    detail.external_ids.imdb_id !== "null" &&
    detail.external_ids.imdb_id.trim()
      ? detail.external_ids.imdb_id.trim()
      : syntheticImdbId(media, detail.id);

  const directors =
    detail.credits?.crew
      ?.filter((c) => c.job === "Director")
      .map((c) => c.name) ?? [];
  const creators =
    detail.credits?.crew
      ?.filter((c) =>
        ["Creator", "Executive Producer", "Writer"].includes(c.job)
      )
      .map((c) => c.name) ?? [];

  const director = directors[0] || creators[0] || null;

  const actors = (detail.credits?.cast ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .slice(0, 8)
    .map((c) => c.name);

  return {
    imdb_id: imdb,
    title: (detail.title || detail.name || "Sem título").trim(),
    year: yearFromDate(detail.release_date || detail.first_air_date),
    poster: posterUrl(detail.poster_path),
    genre: (detail.genres ?? []).map((g) => g.name).filter(Boolean),
    director,
    actors,
    plot: detail.overview?.trim() || null,
    type: media === "tv" ? "series" : "movie",
    rating: null,
    score_imdb:
      detail.vote_average != null && detail.vote_average > 0
        ? Math.round(detail.vote_average * 10) / 10
        : null,
    status: MovieStatus.TO_WATCH,
    watched_dates: [],
    notes: null,
    would_recommend: true,
  };
}

/** Detalhe em pt-BR + imdb_id (ou id sintético tmdb_*). */
export async function fetchCinemaDetailsTmdb(
  tmdbId: number,
  mediaType: TmdbMediaType
): Promise<Movie | null> {
  try {
    const path = mediaType === "tv" ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
    const detail = await tmdbGet<TmdbMovieDetail>(path, {
      append_to_response: "external_ids,credits",
    });
    return formatDetail(detail, mediaType);
  } catch (error) {
    console.error("TMDB detail error:", error);
    return null;
  }
}

/** Resolve IMDb ID → detalhes em pt-BR via TMDB find. */
export async function fetchCinemaByImdbIdTmdb(
  imdbId: string
): Promise<Movie | null> {
  try {
    type FindResponse = {
      movie_results?: TmdbSearchItem[];
      tv_results?: TmdbSearchItem[];
    };
    const found = await tmdbGet<FindResponse>(`/find/${imdbId}`, {
      external_source: "imdb_id",
    });

    const movieHit = found.movie_results?.[0];
    if (movieHit) {
      return fetchCinemaDetailsTmdb(movieHit.id, "movie");
    }
    const tvHit = found.tv_results?.[0];
    if (tvHit) {
      return fetchCinemaDetailsTmdb(tvHit.id, "tv");
    }
    return null;
  } catch (error) {
    console.error("TMDB find by imdb error:", error);
    return null;
  }
}

export async function findCinemaByTitleYearTmdb(
  title: string,
  year?: number | null
): Promise<Movie | null> {
  const hits = await searchCinemaTmdb(title);
  if (!hits.length) return null;

  const normalized = title.trim().toLowerCase();
  const exact = hits.find(
    (h) =>
      h.title.toLowerCase() === normalized &&
      (year == null || h.year === year)
  );
  const yearMatch = year ? hits.find((h) => h.year === year) : undefined;
  const pick = exact ?? yearMatch ?? hits[0];
  return fetchCinemaDetailsTmdb(pick.tmdb_id, pick.media_type);
}
