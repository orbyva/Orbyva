import { fetchTransactionsQuery } from "@/api/finance";
import { fetchMovies } from "@/api/movies";
import { fetchPlaces } from "@/api/places";
import { fetchTrips } from "@/api/travel";
import { fetchGoals } from "@/api/goals";
import { fetchHabits } from "@/api/habits";
import { fetchVehicles } from "@/api/car";

export type GlobalSearchKind =
  | "transaction"
  | "movie"
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

export async function searchGlobal(query: string): Promise<GlobalSearchHit[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const hits: GlobalSearchHit[] = [];

  const [
    tx,
    moviesWatch,
    moviesWatching,
    moviesWatched,
    moviesAbandoned,
    places,
    trips,
    goals,
    habits,
    vehicles,
  ] = await Promise.all([
      fetchTransactionsQuery({ page: 1, pageSize: 40, search: query }).catch(
        () => null
      ),
      fetchMovies("to_watch", 1, 40).catch(() => null),
      fetchMovies("watching", 1, 40).catch(() => null),
      fetchMovies("watched", 1, 40).catch(() => null),
      fetchMovies("abandoned", 1, 40).catch(() => null),
      fetchPlaces().catch(() => []),
      fetchTrips().catch(() => []),
      fetchGoals().catch(() => []),
      fetchHabits().catch(() => []),
      fetchVehicles().catch(() => []),
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

  const movies = [
    ...(moviesWatch?.data ?? []),
    ...(moviesWatching?.data ?? []),
    ...(moviesWatched?.data ?? []),
    ...(moviesAbandoned?.data ?? []),
  ];
  for (const m of movies) {
    const hay = [
      m.title,
      m.notes,
      ...(Array.isArray(m.genre) ? m.genre : []),
      ...(Array.isArray(m.actors) ? m.actors : []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) continue;
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
      subtitle: `${m.year} · ${statusLabel}`,
      href: "/movies",
    });
  }

  for (const p of places) {
    const hay = `${p.name} ${p.notes ?? ""} ${p.address ?? ""}`.toLowerCase();
    if (!hay.includes(q)) continue;
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

  for (const t of trips) {
    const hay = `${t.title} ${t.destination ?? ""} ${t.notes ?? ""}`.toLowerCase();
    if (!hay.includes(q)) continue;
    hits.push({
      id: `trip-${t.id}`,
      kind: "trip",
      title: t.title,
      subtitle: t.destination ?? `${t.start_date} → ${t.end_date}`,
      href: `/travel/${t.id}`,
    });
  }

  for (const g of goals) {
    const hay = `${g.title} ${g.description ?? ""} ${g.category}`.toLowerCase();
    if (!hay.includes(q)) continue;
    hits.push({
      id: `goal-${g.id}`,
      kind: "goal",
      title: g.title,
      subtitle: `${g.status} · ${g.current_value}/${g.target_value}${g.unit ? ` ${g.unit}` : ""}`,
      href: "/goals",
    });
  }

  for (const h of habits) {
    const hay = `${h.name} ${h.description ?? ""}`.toLowerCase();
    if (!hay.includes(q)) continue;
    hits.push({
      id: `habit-${h.id}`,
      kind: "habit",
      title: h.name,
      subtitle: h.frequency === "daily" ? "Diário" : "Semanal",
      href: "/habits",
    });
  }

  for (const v of vehicles) {
    const label = `${v.brand} ${v.model}`.trim();
    const hay = `${label} ${v.plate ?? ""} ${v.notes ?? ""}`.toLowerCase();
    if (!hay.includes(q)) continue;
    hits.push({
      id: `vehicle-${v.id}`,
      kind: "vehicle",
      title: label || "Veículo",
      subtitle: v.plate ?? `${v.current_km} km`,
      href: "/car",
    });
  }

  return hits.slice(0, 40);
}

export const SEARCH_KIND_LABEL: Record<GlobalSearchKind, string> = {
  transaction: "Transação",
  movie: "Cinema",
  place: "Lugar",
  trip: "Viagem",
  goal: "Meta",
  habit: "Hábito",
  vehicle: "Veículo",
};
