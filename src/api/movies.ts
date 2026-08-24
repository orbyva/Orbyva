import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { normalizeMovie } from "@/domain/movies";
import {
  mergeEntertainmentDates,
  mergeEntertainmentScalars,
} from "@/domain/orb/mergeEntertainment";
import {
  Movie,
  MovieCreateRequest,
  MovieListFilter,
  MovieUpdateRequest,
} from "@/types/movies";

export async function fetchMovies(
  status: MovieListFilter,
  page: number,
  pageSize: number
): Promise<{ data: Movie[]; total: number }> {
  const userId = await getCurrentUserId();
  const { data, error, count } = await supabase
    .from("movie")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .eq("status", status)
    .order(status === "watched" ? "watched_dates" : "year", {
      ascending: false,
      nullsFirst: false,
    })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) throw new Error(error.message);
  return {
    data: (data || []).map((row) => normalizeMovie(row as Movie)),
    total: count || 0,
  };
}

/** Só total (+ opcionalmente 1 linha), hub / summary sem baixar catálogo. */
export async function fetchMovieListMeta(
  status: MovieListFilter,
  opts?: { includeLatest?: boolean }
): Promise<{ total: number; latest: Movie | null }> {
  const userId = await getCurrentUserId();
  const countPromise = supabase
    .from("movie")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", status);

  if (!opts?.includeLatest) {
    const { count, error } = await countPromise;
    if (error) throw new Error(error.message);
    return { total: count || 0, latest: null };
  }

  const [countRes, latestRes] = await Promise.all([
    countPromise,
    supabase
      .from("movie")
      .select("*")
      .eq("user_id", userId)
      .eq("status", status)
      .order(status === "watched" ? "watched_dates" : "year", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(1),
  ]);

  if (countRes.error) throw new Error(countRes.error.message);
  if (latestRes.error) throw new Error(latestRes.error.message);
  const row = latestRes.data?.[0];
  return {
    total: countRes.count || 0,
    latest: row ? normalizeMovie(row as Movie) : null,
  };
}

/** Lista completa do usuário, filtro/paginação no cliente (UX mais rápida). */
export async function fetchAllMovies(): Promise<Movie[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("movie")
    .select("*")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return (data || []).map((row) => normalizeMovie(row as Movie));
}

export async function fetchMovieById(imdbId: string): Promise<Movie | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("movie")
    .select("*")
    .eq("user_id", userId)
    .eq("imdb_id", imdbId)
    .maybeSingle();

  if (error) return null;
  return data ? normalizeMovie(data as Movie) : null;
}

export async function createMovie(movie: MovieCreateRequest): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase.from("movie").insert([
    {
      ...movie,
      user_id: userId,
      notes: movie.notes ?? null,
      would_recommend: movie.would_recommend ?? true,
      is_favorite: movie.is_favorite === true,
    },
  ]);

  if (error) throw new Error(error.message);
}

export async function updateMovie(
  updateData: MovieUpdateRequest
): Promise<void> {
  const userId = await getCurrentUserId();
  const { imdb_id, ...updateFields } = updateData;

  const { error } = await supabase
    .from("movie")
    .update(updateFields)
    .eq("user_id", userId)
    .eq("imdb_id", imdb_id);

  if (error) throw new Error(error.message);
}

export async function upsertMovie(
  movie: MovieCreateRequest
): Promise<"created" | "updated"> {
  const existing = await fetchMovieById(movie.imdb_id);
  if (!existing) {
    await createMovie(movie);
    return "created";
  }

  const scalars = mergeEntertainmentScalars(existing, movie);
  await updateMovie({
    imdb_id: movie.imdb_id,
    ...scalars,
    watched_dates: mergeEntertainmentDates(
      existing.watched_dates,
      movie.watched_dates
    ),
  });
  return "updated";
}

export async function deleteMovie(imdbId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("movie")
    .delete()
    .eq("user_id", userId)
    .eq("imdb_id", imdbId);

  if (error) throw new Error(error.message);
}

/** Séries com aviso de episódio novo ligado (para o sino de alertas). */
export async function fetchSeriesWithEpisodeNotify(): Promise<Movie[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("movie")
    .select("*")
    .eq("user_id", userId)
    .eq("type", "series")
    .eq("notify_new_episodes", true);

  if (error) throw new Error(error.message);
  return (data || []).map((row) => normalizeMovie(row as Movie));
}
