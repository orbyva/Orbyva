export {
  KM_WARNING,
  DATE_WARNING_DAYS,
  VEHICLE_KIND_LABELS,
  MAINTENANCE_TYPE_LABELS,
  MAINTENANCE_DEFAULT_KM_INTERVAL,
  getMaintenanceDefaultKmInterval,
  FUEL_TYPE_LABELS,
  getFuelTypesForKind,
  DOCUMENT_TYPE_LABELS,
  TRACKED_MAINTENANCE_TYPES,
  getTrackedMaintenanceTypes,
  getMaintenanceTypesForKind,
  normalizeVehicleKind,
} from "./constants";

export {
  getMaintenanceSchedule,
  getMaintenanceAlerts,
  getDocumentAlerts,
  getMaintenanceTypeLabel,
  calculateFuelConsumption,
  estimateConsumptionFromPrevious,
  getLatestFuelLogKm,
} from "./alerts";

export function vehicleLabel(vehicle: {
  brand: string;
  model: string;
  year?: number | null;
}): string {
  return [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(" ");
}
