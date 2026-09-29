import type {
  Maintenance,
  MaintenanceAlert,
  MaintenanceScheduleItem,
  MaintenanceType,
  Vehicle,
  VehicleDocument,
  DocumentAlert,
} from "@/types/car";
import {
  DATE_WARNING_DAYS,
  calculateFuelConsumption as calculateFuelConsumptionRule,
  getDocumentAlerts as getDocumentAlertsRule,
  getMaintenanceAlerts as getMaintenanceAlertsRule,
  getMaintenanceSchedule as getMaintenanceScheduleRule,
  getMaintenanceTypeLabel as getMaintenanceTypeLabelRule,
} from "../../../supabase/functions/_shared/orb/vehicles.ts";

/**
 * A REGRA de alerta (o que está atrasado, o que está perto de vencer e a mensagem de cada um) mora
 * em `supabase/functions/_shared/orb/vehicles.ts`, que é TS puro e é a fonte única: as tools da Orb
 * chamam exatamente estas funções. Este arquivo é só a ponte para a tela — ele resolve "hoje" no
 * relógio do usuário e repassa. Não reimplemente nada aqui: duas verdades sobre o mesmo alerta
 * divergem na primeira mudança de limiar, e o usuário vê o app e a Orb discordando.
 */

/** Data civil de hoje no relógio de quem está com o app aberto (o browser é o fuso do usuário). */
function todayLocalIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function getMaintenanceSchedule(
  vehicle: Vehicle,
  maintenances: Maintenance[]
): MaintenanceScheduleItem[] {
  return getMaintenanceScheduleRule(vehicle, maintenances, todayLocalIso());
}

export function getMaintenanceAlerts(
  vehicle: Vehicle,
  maintenances: Maintenance[]
): MaintenanceAlert[] {
  return getMaintenanceAlertsRule(vehicle, maintenances, todayLocalIso());
}

export function getDocumentAlerts(
  documents: VehicleDocument[],
  warningDays = DATE_WARNING_DAYS
): DocumentAlert[] {
  return getDocumentAlertsRule(documents, todayLocalIso(), warningDays);
}

export function getMaintenanceTypeLabel(
  type: MaintenanceType,
  customType?: string | null
): string {
  return getMaintenanceTypeLabelRule(type, customType);
}

export function calculateFuelConsumption(
  logs: { km: number; liters: number; date: string }[]
): number | null {
  return calculateFuelConsumptionRule(logs);
}

/**
 * Consumo estimado ao registrar um novo abastecimento,
 * com base no km do último registro e nos litros atuais.
 */
export function estimateConsumptionFromPrevious(
  previousKm: number | null | undefined,
  currentKm: number,
  liters: number
): number | null {
  if (previousKm == null || previousKm <= 0) return null;
  if (currentKm <= previousKm || liters <= 0) return null;
  return (currentKm - previousKm) / liters;
}

export function getLatestFuelLogKm(
  logs: { km: number; date: string }[]
): number | null {
  if (!logs.length) return null;
  const sorted = [...logs].sort((a, b) => {
    if (a.km !== b.km) return a.km - b.km;
    return a.date.localeCompare(b.date);
  });
  return sorted[sorted.length - 1]?.km ?? null;
}
