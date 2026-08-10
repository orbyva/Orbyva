/**
 * Paradas multi-cidade da viagem (país / estado / cidade).
 */
import { formatLocalIsoDate } from "@/lib/dates";
import type { TripStop } from "@/types/travel";

export type TripStopInput = {
  name: string;
  place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  start_date: string;
  end_date: string;
  sort_order?: number;
};

export type AssignStopToDatePayload = {
  name: string;
  place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
};

function addDaysIso(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return formatLocalIsoDate(d);
}

export type TripStopDraft = TripStopInput & {
  /** Chave local estável no formulário. */
  key: string;
  id?: string;
};

/**
 * Atribui uma cidade a uma data: parte intervalos que cobrem o dia e
 * reinsere uma parada só para aquela data; renumerar `sort_order`.
 */
export function assignStopToDate(
  stops: TripStopInput[],
  date: string,
  newStop: AssignStopToDatePayload
): TripStopInput[] {
  const day = date.slice(0, 10);
  const name = newStop.name.trim();
  if (!day || !name) return stops.map((s) => ({ ...s }));

  const remaining: TripStopInput[] = [];
  for (const s of stops) {
    if (day < s.start_date || day > s.end_date) {
      remaining.push({ ...s });
      continue;
    }
    if (s.start_date < day) {
      remaining.push({
        ...s,
        end_date: addDaysIso(day, -1),
      });
    }
    if (s.end_date > day) {
      remaining.push({
        ...s,
        start_date: addDaysIso(day, 1),
      });
    }
  }

  remaining.push({
    name,
    place_id: newStop.place_id?.trim() || null,
    lat:
      typeof newStop.lat === "number" && Number.isFinite(newStop.lat)
        ? newStop.lat
        : null,
    lng:
      typeof newStop.lng === "number" && Number.isFinite(newStop.lng)
        ? newStop.lng
        : null,
    start_date: day,
    end_date: day,
  });

  remaining.sort((a, b) => {
    if (a.start_date !== b.start_date) {
      return a.start_date.localeCompare(b.start_date);
    }
    return a.end_date.localeCompare(b.end_date);
  });

  return remaining.map((s, i) => ({ ...s, sort_order: i }));
}

/** Parada ativa no dia do roteiro (intervalo inclusivo). */
export function stopForDate(
  stops: Pick<
    TripStop,
    | "start_date"
    | "end_date"
    | "sort_order"
    | "name"
    | "lat"
    | "lng"
    | "place_id"
  >[],
  date: string
): (typeof stops)[number] | null {
  if (!date || stops.length === 0) return null;
  const matches = stops.filter(
    (s) => s.start_date <= date && date <= s.end_date
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0] ?? null;

  // Dia de troca (ex.: Madrid termina e Bruxelas começa no mesmo dia):
  // prioriza a cidade de chegada.
  const arriving = matches.filter((s) => s.start_date === date);
  if (arriving.length > 0) {
    return [...arriving].sort((a, b) => b.sort_order - a.sort_order)[0] ?? null;
  }

  // Se várias cobrem o dia sem chegada nova, fica a última do roteiro.
  return [...matches].sort((a, b) => b.sort_order - a.sort_order)[0] ?? null;
}

/** Rótulo agregado + campos legado em `trip`. */
export function destinationFieldsFromStops(stops: TripStopInput[]): {
  destination: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
  destination_place_id: string | null;
} {
  const ordered = [...stops].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  if (ordered.length === 0) {
    return {
      destination: null,
      destination_lat: null,
      destination_lng: null,
      destination_place_id: null,
    };
  }
  const primary = ordered[0]!;
  const label = ordered
    .map((s) => s.name.trim())
    .filter(Boolean)
    .join(" → ");
  return {
    destination: label.slice(0, 240) || null,
    destination_lat:
      typeof primary.lat === "number" && Number.isFinite(primary.lat)
        ? primary.lat
        : null,
    destination_lng:
      typeof primary.lng === "number" && Number.isFinite(primary.lng)
        ? primary.lng
        : null,
    destination_place_id: primary.place_id?.trim() || null,
  };
}

export function validateTripStops(
  stops: TripStopInput[],
  tripStart: string,
  tripEnd: string
): string | null {
  if (stops.length === 0) {
    return "Adicione ao menos uma parada (cidade, estado ou país).";
  }
  for (const s of stops) {
    if (!s.name.trim()) return "Cada parada precisa de um nome.";
    if (s.end_date < s.start_date) {
      return `Datas inválidas em ${s.name.trim()}.`;
    }
    if (s.start_date < tripStart || s.end_date > tripEnd) {
      return `A parada ${s.name.trim()} deve ficar dentro das datas da viagem.`;
    }
  }
  return null;
}

export function draftFromLegacyTrip(params: {
  destination?: string | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  destination_place_id?: string | null;
  start_date: string;
  end_date: string;
}): TripStopDraft[] {
  const name = params.destination?.trim();
  if (!name) return [];
  return [
    {
      key: "legacy-0",
      name,
      place_id: params.destination_place_id ?? null,
      lat: params.destination_lat ?? null,
      lng: params.destination_lng ?? null,
      start_date: params.start_date,
      end_date: params.end_date,
      sort_order: 0,
    },
  ];
}

export function draftsFromStops(stops: TripStop[]): TripStopDraft[] {
  return [...stops]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s, i) => ({
      key: s.id,
      id: s.id,
      name: s.name,
      place_id: s.place_id ?? null,
      lat: s.lat ?? null,
      lng: s.lng ?? null,
      start_date: s.start_date,
      end_date: s.end_date,
      sort_order: s.sort_order ?? i,
    }));
}

export function emptyStopDraft(
  tripStart: string,
  tripEnd: string,
  sortOrder: number
): TripStopDraft {
  return {
    key: `new-${Date.now()}-${sortOrder}`,
    name: "",
    place_id: null,
    lat: null,
    lng: null,
    start_date: tripStart,
    end_date: tripEnd,
    sort_order: sortOrder,
  };
}
