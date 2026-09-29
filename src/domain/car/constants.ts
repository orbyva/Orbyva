import type { MaintenanceType, VehicleKind } from "@/types/car";
import { getTrackedMaintenanceTypes } from "../../../supabase/functions/_shared/orb/vehicles.ts";

/**
 * Limiares, rótulos e a lista de tipos acompanhados moram na regra compartilhada
 * (`supabase/functions/_shared/orb/vehicles.ts`), que é quem os aplica para decidir se uma troca
 * está atrasada — as tools da Orb usam a MESMA regra. Aqui só reexportamos, para o app continuar
 * importando tudo de `@/domain/car`.
 */
export {
  KM_WARNING,
  DATE_WARNING_DAYS,
  MAINTENANCE_TYPE_LABELS,
  TRACKED_MAINTENANCE_TYPES,
  getTrackedMaintenanceTypes,
  normalizeVehicleKind,
} from "../../../supabase/functions/_shared/orb/vehicles.ts";

export const VEHICLE_KIND_LABELS: Record<VehicleKind, string> = {
  car: "Carro",
  motorcycle: "Moto",
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

export function getMaintenanceTypesForKind(
  kind: VehicleKind = "car"
): MaintenanceType[] {
  return [...getTrackedMaintenanceTypes(kind), "other"];
}
