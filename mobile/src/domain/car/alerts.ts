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
  KM_WARNING,
  MAINTENANCE_TYPE_LABELS,
  getTrackedMaintenanceTypes,
  normalizeVehicleKind,
} from "./constants";
import { formatDateBR } from "@/lib/currency";

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function getMaintenanceLabel(
  type: MaintenanceType,
  customType?: string | null
): string {
  if (type === "other" && customType?.trim()) return customType.trim();
  return MAINTENANCE_TYPE_LABELS[type];
}

function resolveAlertStatus(
  kmRemaining: number | null,
  daysRemaining: number | null
): "ok" | "upcoming" | "overdue" {
  const kmOverdue = kmRemaining !== null && kmRemaining < 0;
  const daysOverdue = daysRemaining !== null && daysRemaining < 0;
  if (kmOverdue || daysOverdue) return "overdue";

  const kmUpcoming =
    kmRemaining !== null && kmRemaining >= 0 && kmRemaining <= KM_WARNING;
  const daysUpcoming =
    daysRemaining !== null &&
    daysRemaining >= 0 &&
    daysRemaining <= DATE_WARNING_DAYS;
  if (kmUpcoming || daysUpcoming) return "upcoming";

  return "ok";
}

function getLatestMaintenanceByType(
  maintenances: Maintenance[]
): Map<MaintenanceType, Maintenance> {
  const map = new Map<MaintenanceType, Maintenance>();

  for (const item of maintenances) {
    const existing = map.get(item.type);
    if (!existing || item.service_date > existing.service_date) {
      map.set(item.type, item);
    } else if (
      item.service_date === existing.service_date &&
      item.km_at_service > existing.km_at_service
    ) {
      map.set(item.type, item);
    }
  }

  return map;
}

export function getMaintenanceSchedule(
  vehicle: Vehicle,
  maintenances: Maintenance[]
): MaintenanceScheduleItem[] {
  const latestByType = getLatestMaintenanceByType(maintenances);
  const today = startOfToday();
  const kind = normalizeVehicleKind(vehicle.kind);
  const tracked = getTrackedMaintenanceTypes(kind);

  return tracked.map((type) => {
    const label = MAINTENANCE_TYPE_LABELS[type];
    const latest = latestByType.get(type);

    if (!latest || (!latest.next_km && !latest.next_date)) {
      return {
        type,
        label,
        status: "none" as const,
        message: "Sem registro de troca",
      };
    }

    const kmRemaining =
      latest.next_km != null ? latest.next_km - vehicle.current_km : null;

    let daysRemaining: number | null = null;
    if (latest.next_date) {
      const nextDate = new Date(`${latest.next_date}T12:00:00`);
      nextDate.setHours(0, 0, 0, 0);
      daysRemaining = daysBetween(today, nextDate);
    }

    const status = resolveAlertStatus(kmRemaining, daysRemaining);

    let message = "Em dia";
    if (status === "overdue") {
      if (kmRemaining !== null && kmRemaining < 0) {
        message = `Atrasado em ${Math.abs(kmRemaining).toLocaleString("pt-BR")} km`;
      } else if (daysRemaining !== null && daysRemaining < 0) {
        message = `Atrasado há ${Math.abs(daysRemaining)} dias`;
      } else {
        message = "Troca atrasada";
      }
    } else if (status === "upcoming") {
      const parts: string[] = [];
      if (kmRemaining !== null && kmRemaining >= 0 && kmRemaining <= KM_WARNING) {
        parts.push(`faltam ${kmRemaining.toLocaleString("pt-BR")} km`);
      }
      if (
        daysRemaining !== null &&
        daysRemaining >= 0 &&
        daysRemaining <= DATE_WARNING_DAYS
      ) {
        parts.push(
          daysRemaining === 0
            ? "vence hoje"
            : `vence em ${daysRemaining} dias`
        );
      }
      message = parts.join(" · ") || "Troca próxima";
    }

    return {
      type,
      label,
      status,
      lastServiceDate: latest.service_date,
      lastKm: latest.km_at_service,
      nextKm: latest.next_km,
      nextDate: latest.next_date,
      kmRemaining,
      daysRemaining,
      message,
    };
  });
}

export function getMaintenanceAlerts(
  vehicle: Vehicle,
  maintenances: Maintenance[]
): MaintenanceAlert[] {
  const schedule = getMaintenanceSchedule(vehicle, maintenances);

  return schedule
    .filter((item) => item.status === "upcoming" || item.status === "overdue")
    .map((item) => ({
      type: item.type,
      label: item.label,
      status: item.status as "upcoming" | "overdue",
      nextKm: item.nextKm,
      nextDate: item.nextDate,
      kmRemaining: item.kmRemaining,
      daysRemaining: item.daysRemaining,
      message: `${item.label}: ${item.message}`,
    }))
    .sort((a, b) => {
      const aScore = Math.min(
        a.kmRemaining ?? Number.POSITIVE_INFINITY,
        (a.daysRemaining ?? Number.POSITIVE_INFINITY) * 50
      );
      const bScore = Math.min(
        b.kmRemaining ?? Number.POSITIVE_INFINITY,
        (b.daysRemaining ?? Number.POSITIVE_INFINITY) * 50
      );
      return aScore - bScore;
    });
}

export function getDocumentAlerts(
  documents: VehicleDocument[],
  warningDays = DATE_WARNING_DAYS
): DocumentAlert[] {
  const today = startOfToday();
  const alerts: DocumentAlert[] = [];

  for (const doc of documents) {
    if (doc.paid) continue;

    const dueDate = new Date(`${doc.due_date}T12:00:00`);
    dueDate.setHours(0, 0, 0, 0);
    const daysRemaining = daysBetween(today, dueDate);

    if (daysRemaining > warningDays) continue;

    const typeLabel =
      doc.type === "other" && doc.custom_type
        ? doc.custom_type
        : doc.type.toUpperCase();

    alerts.push({
      document: doc,
      status: daysRemaining < 0 ? "overdue" : "upcoming",
      daysRemaining,
      message:
        daysRemaining < 0
          ? `${typeLabel} venceu em ${formatDateBR(doc.due_date)}`
          : daysRemaining === 0
            ? `${typeLabel} vence hoje`
            : `${typeLabel} vence em ${daysRemaining} dias (${formatDateBR(doc.due_date)})`,
    });
  }

  return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export function getMaintenanceTypeLabel(
  type: MaintenanceType,
  customType?: string | null
): string {
  return getMaintenanceLabel(type, customType);
}

export function calculateFuelConsumption(
  logs: { km: number; liters: number; date: string }[]
): number | null {
  if (logs.length < 2) return null;

  // Usa os dois últimos por quilometragem (tanque cheio → próximo cheio).
  const sorted = [...logs].sort((a, b) => {
    if (a.km !== b.km) return a.km - b.km;
    return a.date.localeCompare(b.date);
  });
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const kmDiff = latest.km - previous.km;

  if (kmDiff <= 0 || latest.liters <= 0) return null;
  return kmDiff / latest.liters;
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
