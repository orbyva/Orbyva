import { fetchTransactionsQuery } from "@/api/finance/transactions";
import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";

export type GlobalSearchKind =
  | "transaction"
  | "movie"
  | "book"
  | "music"
  | "place"
  | "trip"
  | "goal"
  | "habit"
  | "vehicle"
  | "note";

export type GlobalSearchHit = {
  id: string;
  kind: GlobalSearchKind;
  title: string;
  subtitle?: string;
  href: string;
};

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
  note: "Nota",
};

const PER_KIND = 12;

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

function noteExcerpt(content: string, max = 60): string {
  const plain = content.replace(/[#*_`>\-\[\]]/g, " ").replace(/\s+/g, " ").trim();
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max).trim()}…`;
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
    notesRes,
  ] = await Promise.all([
    fetchTransactionsQuery({ page: 1, pageSize: PER_KIND, search: trimmed }).catch(
      () => null
    ),
    supabase
      .from("movie")
      .select("imdb_id, title, year, status")
      .eq("user_id", userId)
      .or(orIlike(["title", "notes"], pattern))
      .limit(PER_KIND),
    supabase
      .from("book")
      .select("google_id, title, authors, status")
      .eq("user_id", userId)
      .or(orIlike(["title", "notes"], pattern))
      .limit(PER_KIND),
    supabase
      .from("album")
      .select("musicbrainz_id, title, artists, status")
      .eq("user_id", userId)
      .or(orIlike(["title", "notes"], pattern))
      .limit(PER_KIND),
    supabase
      .from("place_visit")
      .select("id, name, address, status, visited_date")
      .eq("user_id", userId)
      .or(orIlike(["name", "notes", "address"], pattern))
      .limit(PER_KIND),
    supabase
      .from("trip")
      .select("id, title, destination, start_date, end_date")
      .eq("user_id", userId)
      .or(orIlike(["title", "destination", "notes"], pattern))
      .limit(PER_KIND),
    supabase
      .from("personal_goal")
      .select("id, title, category, status, current_value, target_value, unit")
      .eq("user_id", userId)
      .or(orIlike(["title", "description", "category"], pattern))
      .limit(PER_KIND),
    supabase
      .from("habit")
      .select("id, name, frequency")
      .eq("user_id", userId)
      .or(orIlike(["name", "description"], pattern))
      .limit(PER_KIND),
    supabase
      .from("vehicle")
      .select("id, brand, model, plate, current_km")
      .eq("user_id", userId)
      .or(orIlike(["brand", "model", "plate", "notes"], pattern))
      .limit(PER_KIND),
    supabase
      .from("note")
      .select("id, title, content, kind")
      .eq("user_id", userId)
      .or(orIlike(["title", "content"], pattern))
      .limit(PER_KIND),
  ]);

  for (const t of tx?.data ?? []) {
    hits.push({
      id: `tx-${t.id}`,
      kind: "transaction",
      title: t.description || t.class?.name || `Transação #${t.id}`,
      subtitle: `${t.class?.name ?? ""} · ${t.transaction_at}`.replace(/^ · /, ""),
      href: "/finance/transactions",
    });
  }

  for (const m of moviesRes.data ?? []) {
    hits.push({
      id: `movie-${m.imdb_id}`,
      kind: "movie",
      title: m.title,
      subtitle: String(m.year ?? ""),
      href: `/movies/${m.imdb_id}`,
    });
  }
  for (const b of booksRes.data ?? []) {
    const authors = Array.isArray(b.authors) ? b.authors : [];
    hits.push({
      id: `book-${b.google_id}`,
      kind: "book",
      title: b.title,
      subtitle: authors.slice(0, 2).join(", ") || undefined,
      href: `/books/${b.google_id}`,
    });
  }
  for (const a of albumsRes.data ?? []) {
    const artists = Array.isArray(a.artists) ? a.artists : [];
    hits.push({
      id: `album-${a.musicbrainz_id}`,
      kind: "music",
      title: a.title,
      subtitle: artists.slice(0, 2).join(", ") || undefined,
      href: `/music/${a.musicbrainz_id}`,
    });
  }
  for (const p of placesRes.data ?? []) {
    hits.push({
      id: `place-${p.id}`,
      kind: "place",
      title: p.name,
      subtitle: p.status === "to_visit" ? "Para visitar" : p.address ?? undefined,
      href: `/places/${p.id}`,
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
      href: `/cars/${v.id}`,
    });
  }
  for (const n of notesRes.data ?? []) {
    hits.push({
      id: `note-${n.id}`,
      kind: "note",
      title: n.title,
      subtitle:
        n.kind === "canvas" ? "Canvas" : noteExcerpt(n.content ?? "") || undefined,
      href: `/notes/${n.id}`,
    });
  }

  return hits.slice(0, 40);
}
