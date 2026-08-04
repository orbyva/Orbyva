/**
 * Modos de transporte do próximo trecho (Google Routes).
 * UI usa ícones Lucide (sem emoji).
 * Moto (TWO_WHEELER) não é suportada.
 */

export type TravelModeKey = "DRIVE" | "TRANSIT" | "BICYCLE" | "WALK";

export type TravelModeOption = {
  mode: TravelModeKey;
  /** Nome do ícone Lucide. */
  icon: "car" | "bus" | "bike" | "walk";
  label: string;
  /** Contador de cota Google Routes. */
  quota: "essentials" | "pro";
};

export const TRAVEL_MODES: TravelModeOption[] = [
  { mode: "DRIVE", icon: "car", label: "Carro", quota: "pro" },
  {
    mode: "TRANSIT",
    icon: "bus",
    label: "Transporte público",
    quota: "essentials",
  },
  { mode: "BICYCLE", icon: "bike", label: "Bicicleta", quota: "essentials" },
  { mode: "WALK", icon: "walk", label: "Caminhada", quota: "essentials" },
];

/** Preferidos no primeiro carregamento (custo). */
export const PREFERRED_TRAVEL_MODES: TravelModeKey[] = [
  "DRIVE",
  "TRANSIT",
  "WALK",
];

export const ROUTE_CACHE_TTL_MS = 7 * 60 * 1000; // ~7 min (faixa 5–10)

export function travelModeMeta(mode: string): TravelModeOption {
  return (
    TRAVEL_MODES.find((m) => m.mode === mode) ?? {
      mode: mode as TravelModeKey,
      icon: "car",
      label: mode,
      quota: mode === "DRIVE" ? "pro" : "essentials",
    }
  );
}
