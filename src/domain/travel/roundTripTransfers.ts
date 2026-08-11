import { isTransportActivity } from "@/domain/travel/interDayTransfers";
import type { TripItineraryActivity, TripItineraryDay } from "@/types/travel";

export type RoundTripHome = {
  label: string;
  lat: number | null;
  lng: number | null;
  place_id: string | null;
};

export type RoundTripMatch = {
  outbound: TripItineraryActivity | null;
  returnTrip: TripItineraryActivity | null;
  home: RoundTripHome | null;
};

type StopLike = {
  name: string;
  place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
};

function normLabel(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** HH:mm a partir de time do banco (`09:00:00` / `09:00`). */
export function activityTimeToInput(value: string | null | undefined): string {
  const t = value?.trim();
  if (!t) return "";
  return t.slice(0, 5);
}

function endpointMatchesStop(
  stop: StopLike | null | undefined,
  label: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
  placeId: string | null | undefined
): boolean {
  if (!stop) return false;
  const stopPlace = stop.place_id?.trim();
  const actPlace = placeId?.trim();
  if (stopPlace && actPlace && stopPlace === actPlace) return true;
  if (
    typeof lat === "number" &&
    typeof lng === "number" &&
    typeof stop.lat === "number" &&
    typeof stop.lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Number.isFinite(stop.lat) &&
    Number.isFinite(stop.lng) &&
    Math.abs(lat - stop.lat) < 0.02 &&
    Math.abs(lng - stop.lng) < 0.02
  ) {
    return true;
  }
  const stopName = normLabel(stop.name);
  const actLabel = normLabel(label);
  if (!stopName || !actLabel) return false;
  return (
    stopName === actLabel ||
    actLabel.includes(stopName) ||
    stopName.includes(actLabel)
  );
}

function homeFromEndpoint(
  label: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
  placeId: string | null | undefined
): RoundTripHome | null {
  const trimmed = label?.trim();
  if (!trimmed) return null;
  return {
    label: trimmed,
    lat: lat ?? null,
    lng: lng ?? null,
    place_id: placeId ?? null,
  };
}

function matchesHome(
  home: RoundTripHome,
  label: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
  placeId: string | null | undefined
): boolean {
  const homePlace = home.place_id?.trim();
  const actPlace = placeId?.trim();
  if (homePlace && actPlace && homePlace === actPlace) return true;
  if (
    typeof home.lat === "number" &&
    typeof home.lng === "number" &&
    typeof lat === "number" &&
    typeof lng === "number" &&
    Math.abs(home.lat - lat) < 0.02 &&
    Math.abs(home.lng - lng) < 0.02
  ) {
    return true;
  }
  return normLabel(home.label) === normLabel(label);
}

function transportsOnDay(day: TripItineraryDay): TripItineraryActivity[] {
  return (day.activities ?? [])
    .filter((a) => isTransportActivity(a))
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Detecta ida (casa → 1ª parada) e volta (última parada → casa) no roteiro.
 * Preferência: destino da ida bate com a 1ª parada; destino da volta bate com a origem da ida.
 */
export function findRoundTripTransfers(params: {
  itinerary: TripItineraryDay[];
  firstStop?: StopLike | null;
  lastStop?: StopLike | null;
  tripOrigin?: RoundTripHome | null;
}): RoundTripMatch {
  const tripHome = params.tripOrigin?.label.trim()
    ? {
        label: params.tripOrigin.label.trim(),
        lat: params.tripOrigin.lat,
        lng: params.tripOrigin.lng,
        place_id: params.tripOrigin.place_id,
      }
    : null;

  const days = [...params.itinerary].sort((a, b) => a.day_number - b.day_number);
  if (days.length === 0) {
    return { outbound: null, returnTrip: null, home: tripHome };
  }

  const firstDay = days[0]!;
  const lastDay = days[days.length - 1]!;
  const firstTransports = transportsOnDay(firstDay);
  const lastTransports =
    firstDay.id === lastDay.id ? firstTransports : transportsOnDay(lastDay);

  const outbound =
    firstTransports.find((a) =>
      endpointMatchesStop(
        params.firstStop,
        a.destination_label,
        a.destination_lat,
        a.destination_lng,
        a.destination_place_id
      )
    ) ??
    firstTransports[0] ??
    null;

  let home =
    (outbound
      ? homeFromEndpoint(
          outbound.origin_label,
          outbound.origin_lat,
          outbound.origin_lng,
          outbound.origin_place_id
        )
      : null) ?? tripHome;

  const returnCandidates = lastTransports.filter((a) => a.id !== outbound?.id);

  let returnTrip: TripItineraryActivity | null = null;
  if (home) {
    returnTrip =
      returnCandidates.find((a) =>
        matchesHome(
          home!,
          a.destination_label,
          a.destination_lat,
          a.destination_lng,
          a.destination_place_id
        )
      ) ?? null;
  }

  if (!returnTrip && params.lastStop) {
    returnTrip =
      returnCandidates.find((a) =>
        endpointMatchesStop(
          params.lastStop,
          a.origin_label,
          a.origin_lat,
          a.origin_lng,
          a.origin_place_id
        )
      ) ?? null;
  }

  if (!home && returnTrip) {
    home = homeFromEndpoint(
      returnTrip.destination_label,
      returnTrip.destination_lat,
      returnTrip.destination_lng,
      returnTrip.destination_place_id
    );
  }

  return { outbound, returnTrip, home };
}
