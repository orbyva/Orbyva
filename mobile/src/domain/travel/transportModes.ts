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

export type RoundTripHome = {
  label: string;
  lat: number | null;
  lng: number | null;
  place_id: string | null;
};
