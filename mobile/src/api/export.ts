import { Share } from "react-native";

import { fetchFleetOverview } from "@/api/car/car";
import { fetchTransactionsQuery } from "@/api/finance/transactions";
import { fetchGoals } from "@/api/goals/goals";
import { fetchHabitsWithLogs } from "@/api/habits/habits";
import { fetchAllMovies } from "@/api/movies/movies";
import { fetchPlaces } from "@/api/places/places";
import { fetchTrips } from "@/api/travel/travel";

function escapeCell(value: unknown): string {
  if (value == null) return "";
  const raw = String(value);
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function rowsToCsv(headers: string[], rows: Array<Array<unknown>>): string {
  return [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ].join("\n");
}

function stamp(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
}

async function shareCsv(filename: string, csv: string): Promise<void> {
  await Share.share({ title: filename, message: `\uFEFF${csv}` });
}

export async function exportFinanceCsv(): Promise<void> {
  const pageSize = 500;
  let page = 1;
  const rows: Array<Array<unknown>> = [];
  for (;;) {
    const result = await fetchTransactionsQuery({ page, pageSize });
    for (const tx of result.data) {
      rows.push([
        tx.id,
        tx.transaction_at,
        tx.description,
        tx.value,
        tx.class?.name ?? "",
      ]);
    }
    if (page >= result.totalPages) break;
    page += 1;
  }
  await shareCsv(
    stamp("orbyva-financas"),
    rowsToCsv(["id", "data", "descricao", "valor", "subcategoria"], rows)
  );
}

export async function exportMoviesCsv(): Promise<void> {
  const movies = await fetchAllMovies();
  await shareCsv(
    stamp("orbyva-cinema"),
    rowsToCsv(
      ["imdb_id", "titulo", "tipo", "ano", "status", "nota"],
      movies.map((m) => [m.imdb_id, m.title, m.type, m.year, m.status, m.rating ?? ""])
    )
  );
}

export async function exportVehiclesCsv(): Promise<void> {
  const { vehicles } = await fetchFleetOverview();
  await shareCsv(
    stamp("orbyva-veiculos"),
    rowsToCsv(
      ["id", "marca", "modelo", "ano", "placa", "km"],
      vehicles.map((v) => [v.id, v.brand, v.model, v.year, v.plate, v.current_km])
    )
  );
}

export async function exportGoalsCsv(): Promise<void> {
  const goals = await fetchGoals();
  await shareCsv(
    stamp("orbyva-metas"),
    rowsToCsv(
      ["id", "titulo", "categoria", "alvo", "atual", "prazo", "status"],
      goals.map((g) => [
        g.id,
        g.title,
        g.category,
        g.target_value,
        g.current_value,
        g.deadline ?? "",
        g.status,
      ])
    )
  );
}

export async function exportHabitsCsv(): Promise<void> {
  const { habits } = await fetchHabitsWithLogs();
  await shareCsv(
    stamp("orbyva-habitos"),
    rowsToCsv(
      ["id", "nome", "frequencia"],
      habits.map((h) => [h.id, h.name, h.frequency])
    )
  );
}

export async function exportPlacesCsv(): Promise<void> {
  const places = await fetchPlaces();
  await shareCsv(
    stamp("orbyva-lugares"),
    rowsToCsv(
      ["id", "nome", "tipo", "status", "data"],
      places.map((p) => [p.id, p.name, p.type, p.status ?? "", p.visited_date ?? ""])
    )
  );
}

export async function exportTripsCsv(): Promise<void> {
  const trips = await fetchTrips();
  await shareCsv(
    stamp("orbyva-viagens"),
    rowsToCsv(
      ["id", "titulo", "destino", "inicio", "fim", "status"],
      trips.map((t) => [t.id, t.title, t.destination ?? "", t.start_date, t.end_date, t.status])
    )
  );
}
