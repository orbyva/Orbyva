import type { MaintenanceType, VehicleKind } from "@/types/car";

export const KM_WARNING = 1000;
export const DATE_WARNING_DAYS = 30;

export const VEHICLE_KIND_LABELS: Record<VehicleKind, string> = {
  car: "Carro",
  motorcycle: "Moto",
};

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
  chain: "Corrente",
  drive_belt: "Correia de transmissão",
  sprockets: "Coroa / pinhão",
  fork_oil: "Óleo de suspensão",
  general_service: "Revisão geral",
  other: "Outro",
};

const CAR_DEFAULT_KM: Partial<Record<MaintenanceType, number>> = {
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

const MOTORCYCLE_DEFAULT_KM: Partial<Record<MaintenanceType, number>> = {
  oil: 3_000,
  oil_filter: 3_000,
  air_filter: 6_000,
  fuel_filter: 10_000,
  tires: 15_000,
  brakes: 10_000,
  battery: 20_000,
  spark_plugs: 8_000,
  transmission_oil: 10_000,
  chain: 500,
  drive_belt: 20_000,
  sprockets: 15_000,
  fork_oil: 15_000,
  general_service: 5_000,
};

/** @deprecated Use getMaintenanceDefaultKmInterval(kind) */
export const MAINTENANCE_DEFAULT_KM_INTERVAL = CAR_DEFAULT_KM;

export function getMaintenanceDefaultKmInterval(
  kind: VehicleKind = "car"
): Partial<Record<MaintenanceType, number>> {
  return kind === "motorcycle" ? MOTORCYCLE_DEFAULT_KM : CAR_DEFAULT_KM;
}

export const FUEL_TYPE_LABELS: Record<string, string> = {
  gasoline: "Gasolina",
  ethanol: "Etanol",
  flex: "Flex",
  diesel: "Diesel",
  electric: "Elétrico",
  hybrid: "Híbrido",
};

export function getFuelTypesForKind(kind: VehicleKind): string[] {
  if (kind === "motorcycle") {
    return ["gasoline", "ethanol", "flex", "electric"];
  }
  return Object.keys(FUEL_TYPE_LABELS);
}

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  ipva: "IPVA",
  licensing: "Licenciamento",
  insurance: "Seguro",
  fine: "Multa",
  other: "Outro",
};

const CAR_TRACKED: MaintenanceType[] = [
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

const MOTORCYCLE_TRACKED: MaintenanceType[] = [
  "oil",
  "oil_filter",
  "air_filter",
  "fuel_filter",
  "tires",
  "brakes",
  "battery",
  "spark_plugs",
  "chain",
  "drive_belt",
  "sprockets",
  "fork_oil",
  "transmission_oil",
  "general_service",
];

/** @deprecated Use getTrackedMaintenanceTypes(kind) */
export const TRACKED_MAINTENANCE_TYPES = CAR_TRACKED;

export function getTrackedMaintenanceTypes(
  kind: VehicleKind = "car"
): MaintenanceType[] {
  return kind === "motorcycle" ? MOTORCYCLE_TRACKED : CAR_TRACKED;
}

export function getMaintenanceTypesForKind(
  kind: VehicleKind = "car"
): MaintenanceType[] {
  return [...getTrackedMaintenanceTypes(kind), "other"];
}

export function normalizeVehicleKind(value: unknown): VehicleKind {
  return value === "motorcycle" ? "motorcycle" : "car";
}
