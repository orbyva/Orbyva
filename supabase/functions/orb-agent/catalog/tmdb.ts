/** Porta mínima de `src/lib/tmdb.ts` pra Deno — só o necessário pro Orb resolver filmes/séries. */

const API_URL = "https://api.themoviedb.org/3";
const IMG_URL = "https://image.tmdb.org/t/p/w500";
const LANG = "pt-BR";

export type MovieDraft = {
  imdb_id: string;
  title: string;
  year: number;
  poster: string | null;
  genre: string[];
  director: string | null;
  actors: string[];
  plot: string | null;
  type: "movie" | "series";
  score_imdb: number | null;
  tmdb_tv_id: number | null;
};

export type MovieCandidate = {
  imdb_id: string;
  tmdb_id: number;
  /**
   * Título original. Sem ele o modelo trata "A Odisseia" e "The Odyssey" como
   * obras distintas e fica repetindo a pergunta de desambiguação.
   */
  original_title?: string;
  media_type: "movie" | "tv";
  title: string;
  year: number;
};

function apiKey(): string | null {
  const key = (Deno.env.get("TMDB_API_KEY") ?? "").trim();
  return key || null;
}

export function isTmdbConfigured(): boolean {
  return apiKey() != null;
}

function posterUrl(path?: string | null): string | null {
  return path ? `${IMG_URL}${path}` : null;
}

function yearFromDate(date?: string): number {
  if (!date || date.length < 4) return 0;
  const y = parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) ? y : 0;
}

function syntheticImdbId(media: "movie" | "tv", tmdbId: number): string {
  return media === "tv" ? `tmdb_tv_${tmdbId}` : `tmdb_m_${tmdbId}`;
}

async function tmdbGet<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error("TMDB não configurado");
  const url = new URL(`${API_URL}${path}`);
  url.searchParams.set("api_key", key);
  url.searchParams.set("language", LANG);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${path}: ${res.status}`);
  return (await res.json()) as T;
}

type TmdbSearchItem = {
  id: number;
  original_title?: string;
  original_name?: string;
  overview?: string;
  media_type?: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
};

async function searchMulti(query: string): Promise<MovieCandidate[]> {
  const data = await tmdbGet<{ results?: TmdbSearchItem[] }>("/search/multi", {
    query: query.trim(),
    include_adult: "false",
  });
  const hits: MovieCandidate[] = [];
  for (const item of data.results ?? []) {
    if (item.media_type !== "movie" && item.media_type !== "tv") continue;
    const media = item.media_type;
    hits.push({
      imdb_id: syntheticImdbId(media, item.id),
      tmdb_id: item.id,
      media_type: media,
      title: (item.title || item.name || "Sem título").trim(),
      original_title: (item.original_title || item.original_name || "").trim() ||
        undefined,
      year: yearFromDate(item.release_date || item.first_air_date),
    });
  }
  return hits;
}

type TmdbDetail = {
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
};

async function detailByTmdbId(
  tmdbId: number,
  media: "movie" | "tv"
): Promise<MovieDraft> {
  const path = media === "tv" ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
  const detail = await tmdbGet<TmdbDetail>(path, {
    append_to_response: "external_ids,credits",
  });
  const imdb =
    detail.external_ids?.imdb_id && detail.external_ids.imdb_id.trim()
      ? detail.external_ids.imdb_id.trim()
      : syntheticImdbId(media, detail.id);
  const directors =
    detail.credits?.crew?.filter((c) => c.job === "Director").map((c) => c.name) ??
    [];
  const creators =
    detail.credits?.crew
      ?.filter((c) => ["Creator", "Executive Producer", "Writer"].includes(c.job))
      .map((c) => c.name) ?? [];
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
    director: directors[0] || creators[0] || null,
    actors,
    plot: detail.overview?.trim() || null,
    type: media === "tv" ? "series" : "movie",
    score_imdb:
      detail.vote_average != null && detail.vote_average > 0
        ? Math.round(detail.vote_average * 10) / 10
        : null,
    tmdb_tv_id: media === "tv" ? detail.id : null,
  };
}

/** Busca por título (+ ano opcional), devolve candidatos p/ o LLM escolher. */
export async function searchMoviesTmdb(
  title: string,
  year?: number | null
): Promise<MovieCandidate[]> {
  const hits = await searchMulti(title);
  if (!year) return hits.slice(0, 8);
  return hits.filter((h) => h.year === year || h.year === 0).slice(0, 8).length
    ? hits.filter((h) => h.year === year || h.year === 0).slice(0, 8)
    : hits.slice(0, 8);
}

/** Detalhe completo por `imdb_id` (real ou sintético `tmdb_m_*`/`tmdb_tv_*`). */
export async function resolveMovieByImdbId(
  imdbId: string
): Promise<MovieDraft | null> {
  const synthetic = /^tmdb_(m|tv)_(\d+)$/.exec(imdbId.trim());
  if (synthetic) {
    const media = synthetic[1] === "tv" ? "tv" : "movie";
    const tmdbId = Number(synthetic[2]);
    try {
      return await detailByTmdbId(tmdbId, media);
    } catch {
      return null;
    }
  }

  try {
    const found = await tmdbGet<{
      movie_results?: TmdbSearchItem[];
      tv_results?: TmdbSearchItem[];
    }>(`/find/${imdbId}`, { external_source: "imdb_id" });
    const movieHit = found.movie_results?.[0];
    if (movieHit) return await detailByTmdbId(movieHit.id, "movie");
    const tvHit = found.tv_results?.[0];
    if (tvHit) return await detailByTmdbId(tvHit.id, "tv");
    return null;
  } catch {
    return null;
  }
}

export type SimilarTitle = {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  year: number | null;
  overview: string;
};

/**
 * Recomendações do TMDB para um título já resolvido.
 *
 * Usa `/recommendations` (curadoria por co-visualização) e não `/similar`
 * (só gênero/palavra-chave) — as sugestões ficam bem mais relevantes.
 */
export async function fetchSimilarTmdb(
  tmdbId: number,
  mediaType: "movie" | "tv",
  limit = 6
): Promise<SimilarTitle[]> {
  const data = await tmdbGet<{ results?: TmdbSearchItem[] }>(
    `/${mediaType}/${tmdbId}/recommendations`
  );
  return (data.results ?? []).slice(0, limit).map((item) => ({
    tmdb_id: item.id,
    media_type: mediaType,
    title: (item.title || item.name || "Sem título").trim(),
    year: yearFromDate(item.release_date || item.first_air_date),
    overview: (item.overview ?? "").trim().slice(0, 200),
  }));
}
