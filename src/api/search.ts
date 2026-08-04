import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { fetchTransactionsQuery } from "@/api/finance";

export type GlobalSearchKind =
  | "transaction"
  | "movie"
  | "book"
  | "music"
  | "place"
  | "trip"
  | "goal"
  | "habit"
  | "vehicle";

export type GlobalSearchHit = {
  id: string;
  kind: GlobalSearchKind;
  title: string;
  subtitle?: string;
  href: string;
};

const PER_KIND = 12;

/** Escapa valor para filtros `.or()` / `.ilike` do PostgREST. */
function ilikePattern(raw: string): string {
  const escaped = raw
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  return `"%${escaped.replace(/"/g, '""')}%"`;
}

function orIlike(columns: string[], pattern: string): string {
  return columns.map((col) => `${col}.ilike.${pattern}`).join(",");
}

export async function searchGlobal(query: string): Promise<GlobalSearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const q = trimmed.toLowerCase();
  const pattern = ilikePattern(q);
  const userId = await getCurrentUserId();
  const hits: GlobalSearchHit[] = [];

  const [
    tx,
    moviesRes,
    booksRes,
    albumsRes,
    placesRes,
    tripsRes,
    goalsRes,
    habitsRes,
    vehiclesRes,
  ] = await Promise.all([
    fetchTransactionsQuery({ page: 1, pageSize: PER_KIND, search: trimmed }).catch(
      () => null
    ),
    supabase
      .from("movie")
      .select("imdb_id, title, year, status, notes")
      .eq("user_id", userId)
      .or(orIlike(["title", "notes"], pattern))
      .limit(PER_KIND),
    supabase
      .from("book")
      .select("google_id, title, authors, notes, status")
      .eq("user_id", userId)
      .or(orIlike(["title", "notes"], pattern))
      .limit(PER_KIND),
    supabase
      .from("album")
      .select("musicbrainz_id, title, artists, notes, status")
      .eq("user_id", userId)
      .or(orIlike(["title", "notes"], pattern))
      .limit(PER_KIND),
    supabase
      .from("place_visit")
      .select("id, name, notes, address, status, visited_date")
      .eq("user_id", userId)
      .or(orIlike(["name", "notes", "address"], pattern))
      .limit(PER_KIND),
    supabase
      .from("trip")
      .select("id, title, destination, notes, start_date, end_date")
      .eq("user_id", userId)
      .or(orIlike(["title", "destination", "notes"], pattern))
      .limit(PER_KIND),
    supabase
      .from("personal_goal")
      .select("id, title, description, category, status, current_value, target_value, unit")
      .eq("user_id", userId)
      .or(orIlike(["title", "description", "category"], pattern))
      .limit(PER_KIND),
    supabase
      .from("habit")
      .select("id, name, description, frequency")
      .eq("user_id", userId)
      .or(orIlike(["name", "description"], pattern))
      .limit(PER_KIND),
    supabase
      .from("vehicle")
      .select("id, brand, model, plate, notes, current_km")
      .eq("user_id", userId)
      .or(orIlike(["brand", "model", "plate", "notes"], pattern))
      .limit(PER_KIND),
  ]);

  for (const t of tx?.data ?? []) {
    hits.push({
      id: `tx-${t.id}`,
      kind: "transaction",
      title: t.description || t.class?.name || `Transação #${t.id}`,
      subtitle: `${t.class?.name ?? ""} · ${t.transaction_at}`,
      href: "/finance/transactions",
    });
  }

  for (const m of moviesRes.data ?? []) {
    const statusLabel =
      m.status === "watched"
        ? "Assistido"
        : m.status === "watching"
          ? "Assistindo"
          : m.status === "abandoned"
            ? "Abandonei"
            : "Para assistir";
    hits.push({
      id: `movie-${m.imdb_id}`,
      kind: "movie",
      title: m.title,
      subtitle: `${m.year ?? ""} · ${statusLabel}`.replace(/^ · /, ""),
      href: "/movies",
    });
  }

  for (const b of booksRes.data ?? []) {
    const authors = Array.isArray(b.authors) ? b.authors : [];
    hits.push({
      id: `book-${b.google_id}`,
      kind: "book",
      title: b.title,
      subtitle: authors.slice(0, 2).join(", ") || undefined,
      href: "/books",
    });
  }

  for (const a of albumsRes.data ?? []) {
    const artists = Array.isArray(a.artists) ? a.artists : [];
    hits.push({
      id: `album-${a.musicbrainz_id}`,
      kind: "music",
      title: a.title,
      subtitle: artists.slice(0, 2).join(", ") || undefined,
      href: "/music",
    });
  }

  for (const p of placesRes.data ?? []) {
    hits.push({
      id: `place-${p.id}`,
      kind: "place",
      title: p.name,
      subtitle:
        p.status === "to_visit"
          ? "Para visitar"
          : p.address ?? p.visited_date ?? undefined,
      href: "/places",
    });
  }

  for (const t of tripsRes.data ?? []) {
    hits.push({
      id: `trip-${t.id}`,
      kind: "trip",
      title: t.title,
      subtitle: t.destination ?? `${t.start_date} → ${t.end_date}`,
      href: `/travel/${t.id}`,
    });
  }

  for (const g of goalsRes.data ?? []) {
    hits.push({
      id: `goal-${g.id}`,
      kind: "goal",
      title: g.title,
      subtitle: `${g.status} · ${g.current_value}/${g.target_value}${g.unit ? ` ${g.unit}` : ""}`,
      href: "/goals",
    });
  }

  for (const h of habitsRes.data ?? []) {
    hits.push({
      id: `habit-${h.id}`,
      kind: "habit",
      title: h.name,
      subtitle: h.frequency === "daily" ? "Diário" : "Semanal",
      href: "/habits",
    });
  }

  for (const v of vehiclesRes.data ?? []) {
    const label = `${v.brand ?? ""} ${v.model ?? ""}`.trim();
    hits.push({
      id: `vehicle-${v.id}`,
      kind: "vehicle",
      title: label || "Veículo",
      subtitle: v.plate ?? `${v.current_km ?? 0} km`,
      href: "/car",
    });
  }

  return hits.slice(0, 40);
}

export const SEARCH_KIND_LABEL: Record<GlobalSearchKind, string> = {
  transaction: "Transação",
  movie: "Cinema",
  book: "Livro",
  music: "Música",
  place: "Lugar",
  trip: "Viagem",
  goal: "Meta",
  habit: "Hábito",
  vehicle: "Veículo",
};
