import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type { MovieEpisode, MovieEpisodeUpsert } from "@/types/movies";

export async function fetchEpisodesForSeries(
  imdbId: string
): Promise<MovieEpisode[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("movie_episode")
    .select("*")
    .eq("user_id", userId)
    .eq("imdb_id", imdbId)
    .order("season_number", { ascending: true })
    .order("episode_number", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as MovieEpisode[];
}

export async function upsertEpisode(
  episode: MovieEpisodeUpsert
): Promise<void> {
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();
  const { error } = await supabase.from("movie_episode").upsert(
    {
      ...episode,
      user_id: userId,
      updated_at: now,
    },
    { onConflict: "user_id,imdb_id,season_number,episode_number" }
  );

  if (error) throw new Error(error.message);
}

export async function markEpisodeWatched(params: {
  imdbId: string;
  season: number;
  episode: number;
  tmdbEpisodeId?: number | null;
  episodeName?: string | null;
  airDate?: string | null;
  rating?: number | null;
  notes?: string | null;
}): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await upsertEpisode({
    imdb_id: params.imdbId,
    season_number: params.season,
    episode_number: params.episode,
    tmdb_episode_id: params.tmdbEpisodeId ?? null,
    episode_name: params.episodeName ?? null,
    air_date: params.airDate ?? null,
    status: "watched",
    watched_at: today,
    rating: params.rating ?? null,
    notes: params.notes?.trim() || null,
  });
}

export async function markEpisodeUnwatched(params: {
  imdbId: string;
  season: number;
  episode: number;
}): Promise<void> {
  await upsertEpisode({
    imdb_id: params.imdbId,
    season_number: params.season,
    episode_number: params.episode,
    status: "unwatched",
    watched_at: null,
    rating: null,
    notes: null,
  });
}

export type SeasonEpisodeInput = {
  season: number;
  episode: number;
  tmdbEpisodeId?: number | null;
  episodeName?: string | null;
  airDate?: string | null;
};

/** Marca vários episódios como assistidos (ex.: temporada inteira). */
export async function markSeasonWatched(params: {
  imdbId: string;
  episodes: SeasonEpisodeInput[];
}): Promise<void> {
  if (params.episodes.length === 0) return;
  const userId = await getCurrentUserId();
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const { error } = await supabase.from("movie_episode").upsert(
    params.episodes.map((ep) => ({
      user_id: userId,
      imdb_id: params.imdbId,
      season_number: ep.season,
      episode_number: ep.episode,
      tmdb_episode_id: ep.tmdbEpisodeId ?? null,
      episode_name: ep.episodeName ?? null,
      air_date: ep.airDate ?? null,
      status: "watched",
      watched_at: today,
      updated_at: now,
    })),
    { onConflict: "user_id,imdb_id,season_number,episode_number" }
  );
  if (error) throw new Error(error.message);
}

/** Desmarca episódios (ex.: desfazer temporada). Preserva nota/comentário. */
export async function markSeasonUnwatched(params: {
  imdbId: string;
  episodes: Array<{ season: number; episode: number }>;
}): Promise<void> {
  if (params.episodes.length === 0) return;
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();
  const { error } = await supabase.from("movie_episode").upsert(
    params.episodes.map((ep) => ({
      user_id: userId,
      imdb_id: params.imdbId,
      season_number: ep.season,
      episode_number: ep.episode,
      status: "unwatched",
      watched_at: null,
      updated_at: now,
    })),
    { onConflict: "user_id,imdb_id,season_number,episode_number" }
  );
  if (error) throw new Error(error.message);
}

/** Contagem de episódios assistidos por série (uma query). */
export async function fetchWatchedEpisodeCounts(
  imdbIds: string[]
): Promise<Record<string, number>> {
  const ids = [...new Set(imdbIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("movie_episode")
    .select("imdb_id")
    .eq("user_id", userId)
    .eq("status", "watched")
    .in("imdb_id", ids);

  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = (row as { imdb_id: string }).imdb_id;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

