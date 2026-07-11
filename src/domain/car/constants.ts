import type { MaintenanceType } from "@/types/car";

export const KM_WARNING = 1000;
export const DATE_WARNING_DAYS = 30;

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  oil: "Óleo do motor",
  oil_filter: "Filtro de óleo",
  air_filter: "Filtro de ar",
  fuel_filter: "Filtro de combustível",
  tires: "Pneus",
  brakes: "Freios",
  battery: "Bateria",
  timing_belt: "Correia dentada",
  spark_plugs: "Velas de ignição",
  coolant: "Fluido de arrefecimento",
  transmission_oil: "Óleo de câmbio",
  general_service: "Revisão geral",
  other: "Outro",
};

/** Intervalos sugeridos (km) ao registrar manutenção. */
export const MAINTENANCE_DEFAULT_KM_INTERVAL: Partial<
  Record<MaintenanceType, number>
> = {
  oil: 10_000,
  oil_filter: 10_000,
  air_filter: 15_000,
  fuel_filter: 20_000,
  tires: 40_000,
  brakes: 30_000,
  battery: 30_000,
  timing_belt: 60_000,
  spark_plugs: 30_000,
  coolant: 40_000,
  transmission_oil: 40_000,
  general_service: 10_000,
};

export const FUEL_TYPE_LABELS: Record<string, string> = {
  gasoline: "Gasolina",
  ethanol: "Etanol",
  flex: "Flex",
  diesel: "Diesel",
  electric: "Elétrico",
  hybrid: "Híbrido",
};

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  ipva: "IPVA",
  licensing: "Licenciamento",
  insurance: "Seguro",
  fine: "Multa",
  other: "Outro",
};

export const TRACKED_MAINTENANCE_TYPES: MaintenanceType[] = [
  "oil",
  "oil_filter",
  "air_filter",
  "fuel_filter",
  "tires",
  "brakes",
  "battery",
  "timing_belt",
  "spark_plugs",
  "coolant",
  "transmission_oil",
  "general_service",
];
