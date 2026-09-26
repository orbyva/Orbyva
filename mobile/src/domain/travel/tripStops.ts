export type TripStopInput = {
  name: string;
  place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  start_date: string;
  end_date: string;
  sort_order?: number;
};

/** Parada ativa no dia do roteiro (intervalo inclusivo). */
export function stopForDate<
  T extends {
    start_date: string;
    end_date: string;
    sort_order: number;
    name: string;
  },
>(stops: T[], date: string): T | null {
  if (!date || stops.length === 0) return null;
  const matches = stops.filter(
    (stop) => stop.start_date <= date && date <= stop.end_date
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0] ?? null;
  const arriving = matches.filter((stop) => stop.start_date === date);
  if (arriving.length > 0) {
    return [...arriving].sort((a, b) => b.sort_order - a.sort_order)[0] ?? null;
  }
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
