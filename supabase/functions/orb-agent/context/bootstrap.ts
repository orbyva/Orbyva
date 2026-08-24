/** Resumo curto de Entretenimento pro system prompt — contagens + últimos 3 por módulo, não o catálogo inteiro. */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface BootstrapContext {
  movies: { to_watch: number; watching: number; watched: number; recent: string[] };
  books: { to_read: number; reading: number; read: number; recent: string[] };
  albums: { to_listen: number; listened: number; recent: string[] };
}

async function countByStatus(
  client: SupabaseClient,
  table: string,
  userId: string,
  status: string
): Promise<number> {
  const { count } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", status);
  return count ?? 0;
}

async function recentTitles(
  client: SupabaseClient,
  table: string,
  userId: string,
  status: string,
  orderCol: string,
  rating: (row: Record<string, unknown>) => number | null | undefined
): Promise<string[]> {
  const { data } = await client
    .from(table)
    .select("title, rating")
    .eq("user_id", userId)
    .eq("status", status)
    .order(orderCol, { ascending: false, nullsFirst: false })
    .limit(3);
  return (data ?? []).map((row) => {
    const r = rating(row as Record<string, unknown>);
    const title = String((row as Record<string, unknown>).title ?? "");
    return r != null ? `${title} (nota ${r})` : title;
  });
}

export async function buildBootstrapContext(
  client: SupabaseClient,
  userId: string
): Promise<BootstrapContext> {
  const [
    moviesToWatch,
    moviesWatching,
    moviesWatched,
    moviesRecent,
    booksToRead,
    booksReading,
    booksRead,
    booksRecent,
    albumsToListen,
    albumsListened,
    albumsRecent,
  ] = await Promise.all([
    countByStatus(client, "movie", userId, "to_watch"),
    countByStatus(client, "movie", userId, "watching"),
    countByStatus(client, "movie", userId, "watched"),
    recentTitles(client, "movie", userId, "watched", "watched_dates", (r) => r.rating as number | null),
    countByStatus(client, "book", userId, "to_read"),
    countByStatus(client, "book", userId, "reading"),
    countByStatus(client, "book", userId, "read"),
    recentTitles(client, "book", userId, "read", "read_dates", (r) => r.rating as number | null),
    countByStatus(client, "album", userId, "to_listen"),
    countByStatus(client, "album", userId, "listened"),
    recentTitles(client, "album", userId, "listened", "listened_dates", (r) => r.rating as number | null),
  ]);

  return {
    movies: {
      to_watch: moviesToWatch,
      watching: moviesWatching,
      watched: moviesWatched,
      recent: moviesRecent,
    },
    books: {
      to_read: booksToRead,
      reading: booksReading,
      read: booksRead,
      recent: booksRecent,
    },
    albums: {
      to_listen: albumsToListen,
      listened: albumsListened,
      recent: albumsRecent,
    },
  };
}
