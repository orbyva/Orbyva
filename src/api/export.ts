import { fetchTransactionsQuery } from "@/api/finance";
import { fetchMovies } from "@/api/movies";
import { fetchAllFuelLogs, fetchAllMaintenances, fetchVehicles } from "@/api/car";
import { fetchGoals } from "@/api/goals";
import { fetchHabits, fetchAllHabitLogs } from "@/api/habits";
import { fetchPlaces } from "@/api/places";
import { fetchTrips } from "@/api/travel";
import { downloadCsv, rowsToCsv, stampFilename } from "@/lib/csv";

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
        tx.class?.type?.name ?? "",
        tx.class?.type?.nature?.name ?? "",
      ]);
    }
    if (page >= result.totalPages) break;
    page += 1;
  }

  const csv = rowsToCsv(
    [
      "id",
      "data",
      "descricao",
      "valor",
      "classe",
      "tipo",
      "natureza",
    ],
    rows
  );
  downloadCsv(stampFilename("orbyva-financas"), csv);
}

export async function exportMoviesCsv(): Promise<void> {
  const pageSize = 100;
  const rows: Array<Array<unknown>> = [];

  for (const status of ["to_watch", "watched"] as const) {
    let page = 1;
    for (;;) {
      const { data, total } = await fetchMovies(status, page, pageSize);
      for (const m of data) {
        rows.push([
          m.imdb_id,
          m.title,
          m.type,
          m.year,
          m.status,
          m.rating ?? "",
          m.would_recommend ?? "",
          m.notes ?? "",
          Array.isArray(m.watched_dates)
            ? m.watched_dates
                .map((d) =>
                  d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)
                )
                .join("|")
            : "",
        ]);
      }
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      if (page >= totalPages || data.length === 0) break;
      page += 1;
    }
  }

  const csv = rowsToCsv(
    [
      "imdb_id",
      "titulo",
      "tipo",
      "ano",
      "status",
      "nota",
      "recomendaria",
      "notas",
      "datas_assistido",
    ],
    rows
  );
  downloadCsv(stampFilename("orbyva-cinema"), csv);
}

export async function exportVehiclesCsv(): Promise<void> {
  const vehicles = await fetchVehicles();
  const vehicleRows: Array<Array<unknown>> = [];
  const maintenanceRows: Array<Array<unknown>> = [];
  const fuelRows: Array<Array<unknown>> = [];

  for (const v of vehicles) {
    const vehicleLabel = `${v.brand} ${v.model}`.trim();
    vehicleRows.push([
      v.id,
      v.kind,
      vehicleLabel,
      v.brand,
      v.model,
      v.year,
      v.plate,
      v.current_km,
    ]);

    const maintenances = await fetchAllMaintenances(v.id);
    for (const m of maintenances) {
      maintenanceRows.push([
        m.id,
        vehicleLabel,
        m.type,
        m.service_date,
        m.km_at_service,
        m.cost,
        m.notes ?? "",
      ]);
    }

    const fuels = await fetchAllFuelLogs(v.id);
    for (const f of fuels) {
      fuelRows.push([
        f.id,
        vehicleLabel,
        f.date,
        f.km,
        f.liters,
        f.total_cost,
        f.station ?? "",
        f.notes ?? "",
      ]);
    }
  }

  // Um arquivo “resumo” de veículos + abas via múltiplos downloads seria confuso;
  // exportamos três CSVs em sequência.
  downloadCsv(
    stampFilename("orbyva-veiculos"),
    rowsToCsv(
      ["id", "tipo", "nome", "marca", "modelo", "ano", "placa", "km_atual"],
      vehicleRows
    )
  );
  downloadCsv(
    stampFilename("orbyva-manutencoes"),
    rowsToCsv(
      ["id", "veiculo", "servico", "data", "km", "custo", "notas"],
      maintenanceRows
    )
  );
  downloadCsv(
    stampFilename("orbyva-abastecimentos"),
    rowsToCsv(
      ["id", "veiculo", "data", "km", "litros", "custo", "posto", "notas"],
      fuelRows
    )
  );
}

export async function exportGoalsCsv(): Promise<void> {
  const goals = await fetchGoals();
  const csv = rowsToCsv(
    [
      "id",
      "titulo",
      "descricao",
      "categoria",
      "valor_alvo",
      "valor_atual",
      "unidade",
      "prazo",
      "status",
    ],
    goals.map((g) => [
      g.id,
      g.title,
      g.description ?? "",
      g.category,
      g.target_value,
      g.current_value,
      g.unit ?? "",
      g.deadline ?? "",
      g.status,
    ])
  );
  downloadCsv(stampFilename("orbyva-metas"), csv);
}

export async function exportHabitsCsv(): Promise<void> {
  const [habits, logs] = await Promise.all([fetchHabits(), fetchAllHabitLogs()]);
  downloadCsv(
    stampFilename("orbyva-habitos"),
    rowsToCsv(
      ["id", "nome", "descricao", "frequencia", "meta_semana", "cor"],
      habits.map((h) => [
        h.id,
        h.name,
        h.description ?? "",
        h.frequency,
        h.target_per_week,
        h.color ?? "",
      ])
    )
  );
  downloadCsv(
    stampFilename("orbyva-habitos-logs"),
    rowsToCsv(
      ["id", "habit_id", "data", "concluido"],
      logs.map((l) => [l.id, l.habit_id, l.date, l.completed])
    )
  );
}

export async function exportPlacesCsv(): Promise<void> {
  const places = await fetchPlaces();
  const csv = rowsToCsv(
    [
      "id",
      "nome",
      "tipo",
      "nota",
      "data_visita",
      "endereco",
      "recomendaria",
      "viagem",
      "notas",
    ],
    places.map((p) => [
      p.id,
      p.name,
      p.type,
      p.rating ?? "",
      p.visited_date,
      p.address ?? "",
      p.would_recommend,
      p.trip?.title ?? "",
      p.notes ?? "",
    ])
  );
  downloadCsv(stampFilename("orbyva-lugares"), csv);
}

export async function exportTripsCsv(): Promise<void> {
  const trips = await fetchTrips();
  const csv = rowsToCsv(
    [
      "id",
      "titulo",
      "destino",
      "inicio",
      "fim",
      "orcamento",
      "gasto",
      "status",
      "notas",
    ],
    trips.map((t) => [
      t.id,
      t.title,
      t.destination ?? "",
      t.start_date,
      t.end_date,
      t.budget ?? "",
      t.spent ?? "",
      t.status,
      t.notes ?? "",
    ])
  );
  downloadCsv(stampFilename("orbyva-viagens"), csv);
}
