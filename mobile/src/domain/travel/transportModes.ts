import type { TravelModeKey } from "@/domain/itinerary/travelModes";
import {
  computeLeaveByHHmm,
  minutesToHHmm,
  parseHHmmToMinutes,
} from "@/domain/itinerary/duration";

export type TripTransportMode = "flight" | "train" | "bus" | "car" | "other";

export const TRIP_TRANSPORT_MODES: TripTransportMode[] = [
  "flight",
  "train",
  "bus",
  "car",
  "other",
];

export const TRIP_TRANSPORT_MODE_LABELS: Record<TripTransportMode, string> = {
  flight: "Voo",
  train: "Trem",
  bus: "Ônibus",
  car: "Carro",
  other: "Outro",
};

export function transferEndpointsTitle(
  originLabel: string,
  destinationLabel: string
): string {
  return `${originLabel.trim()} → ${destinationLabel.trim()}`;
}

export type TransferEndpoint = {
  label: string;
  lat: number | null;
  lng: number | null;
  place_id: string | null;
};

export type RoundTripHome = TransferEndpoint;

export function normalizeTripTransportMode(
  value: string | null | undefined
): TripTransportMode {
  if (
    value === "flight" ||
    value === "train" ||
    value === "bus" ||
    value === "car" ||
    value === "other"
  ) {
    return value;
  }
  return "other";
}

export function transferEndpointHasCoords(
  endpoint: Pick<TransferEndpoint, "lat" | "lng"> | null | undefined
): boolean {
  return (
    endpoint != null &&
    typeof endpoint.lat === "number" &&
    typeof endpoint.lng === "number" &&
    Number.isFinite(endpoint.lat) &&
    Number.isFinite(endpoint.lng)
  );
}

export function hasRequiredTransferEndpoints(
  originLabel: string | null | undefined,
  destinationLabel: string | null | undefined
): boolean {
  return Boolean(originLabel?.trim() && destinationLabel?.trim());
}

export function isTransportActivity(act: {
  category?: string | null;
  title?: string | null;
}): boolean {
  return (
    (act.category ?? "").toLowerCase() === "transport" ||
    Boolean(act.title?.includes("→"))
  );
}

/** Carro / trem / ônibus podem estimar horários via Google Routes. */
export function canEstimateTransferArrival(mode: TripTransportMode): boolean {
  return mode === "car" || mode === "train" || mode === "bus";
}

export function routesModeForTransport(
  mode: TripTransportMode
): TravelModeKey | null {
  if (mode === "car") return "DRIVE";
  if (mode === "train" || mode === "bus") return "TRANSIT";
  return null;
}

export function transportModeHint(mode: TripTransportMode): string {
  if (mode === "flight") {
    return "Informe os horários da passagem. Estimativa por mapa não cobre voos.";
  }
  if (mode === "other") {
    return "Informe saída e chegada manualmente.";
  }
  return "Informe saída ou chegada; o botão estima o outro pela rota.";
}

export function estimateArrivalHHmm(
  departHHmm: string,
  durationSeconds: number
): string | null {
  const start = parseHHmmToMinutes(departHHmm);
  if (start == null) return null;
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) return null;
  const travelMinutes = Math.ceil(durationSeconds / 60);
  return minutesToHHmm(start + travelMinutes);
}

export function estimateDepartHHmm(
  arriveHHmm: string,
  durationSeconds: number
): string | null {
  return computeLeaveByHHmm({
    arrivalHHmm: arriveHHmm,
    durationSeconds,
  });
}
