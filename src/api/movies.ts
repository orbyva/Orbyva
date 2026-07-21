import { supabase } from "@/lib/supabase";
import { normalizeMovie } from "@/domain/movies";
import {
  Movie,
  MovieCreateRequest,
  MovieUpdateRequest,
} from "@/types/movies";

/**
 * Supabase Functions for `movie` Table
 */

export async function fetchMovies(
  status: "to_watch" | "watched",
  page: number,
  pageSize: number
): Promise<{ data: Movie[]; total: number }> {
  const { data, error, count } = await supabase
    .from("movie")
    .select("*", { count: "exact" })
    .eq("status", status)
    .order(status === "watched" ? "watched_dates" : "year", {
      ascending: false,
    })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) throw new Error(error.message);
  return {
    data: (data || []).map((row) => normalizeMovie(row as Movie)),
    total: count || 0,
  };
}

export async function fetchMovieById(imdbId: string): Promise<Movie | null> {
  const { data, error } = await supabase
    .from("movie")
    .select("*")
    .eq("imdb_id", imdbId)
    .single();

  if (error) return null;
  return normalizeMovie(data as Movie);
}

export async function createMovie(movie: MovieCreateRequest): Promise<void> {
  const { error } = await supabase.from("movie").insert([
    {
      ...movie,
      notes: movie.notes ?? null,
      would_recommend: movie.would_recommend ?? true,
    },
  ]);

  if (error) throw new Error(error.message);
}

export async function updateMovie(
  updateData: MovieUpdateRequest
): Promise<void> {
  const { imdb_id, ...updateFields } = updateData;

  const { error } = await supabase
    .from("movie")
    .update(updateFields)
    .eq("imdb_id", imdb_id);

  if (error) throw new Error(error.message);
}

/** Insert or merge opinion/watch data when importing. */
export async function upsertMovie(movie: MovieCreateRequest): Promise<"created" | "updated"> {
  const existing = await fetchMovieById(movie.imdb_id);
  if (!existing) {
    await createMovie(movie);
    return "created";
  }

  const mergedDates = Array.from(
    new Set([
      ...normalizeDates(existing.watched_dates),
      ...normalizeDates(movie.watched_dates),
    ])
  );

  await updateMovie({
    imdb_id: movie.imdb_id,
    status: movie.status,
    rating: movie.rating ?? existing.rating,
    notes: movie.notes?.trim() ? movie.notes : existing.notes,
    would_recommend: movie.would_recommend ?? existing.would_recommend,
    watched_dates: mergedDates,
  });
  return "updated";
}

export async function deleteMovie(imdbId: string): Promise<void> {
  const { error } = await supabase.from("movie").delete().eq("imdb_id", imdbId);

  if (error) throw new Error(error.message);
}

function normalizeDates(dates: Movie["watched_dates"] | undefined): string[] {
  if (!dates?.length) return [];
  return dates.map((d) =>
    d instanceof Date ? d.toISOString().split("T")[0] : String(d).slice(0, 10)
  );
}
