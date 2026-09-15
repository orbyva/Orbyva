export type VehicleKind = "car" | "motorcycle";
export type FuelType =
  | "gasoline"
  | "ethanol"
  | "flex"
  | "diesel"
  | "electric"
  | "hybrid";

export type MaintenanceType =
  | "oil"
  | "oil_filter"
  | "air_filter"
  | "fuel_filter"
  | "tires"
  | "brakes"
  | "battery"
  | "timing_belt"
  | "spark_plugs"
  | "coolant"
  | "transmission_oil"
  | "chain"
  | "drive_belt"
  | "sprockets"
  | "fork_oil"
  | "general_service"
  | "other";

export type MaintenanceAlertStatus = "ok" | "upcoming" | "overdue" | "none";

export type DocumentType = "ipva" | "licensing" | "insurance" | "fine" | "other";

export interface Vehicle {
  id: string;
  user_id?: string;
  kind: VehicleKind;
  brand: string;
  model: string;
  year?: number | null;
  plate?: string | null;
  color?: string | null;
  current_km: number;
  fuel_type?: FuelType | null;
  purchase_date?: string | null;
  purchase_value?: number | null;
  notes?: string | null;
}

export interface VehicleDocument {
  id: string;
  vehicle_id: string;
  type: DocumentType;
  custom_type?: string | null;
  due_date: string;
  paid: boolean;
}

export interface Maintenance {
  id: string;
  vehicle_id: string;
  type: MaintenanceType;
  custom_type?: string | null;
  service_date: string;
  km_at_service: number;
  next_km?: number | null;
  next_date?: string | null;
  cost?: number | null;
  transaction_id?: number | null;
}

export interface FuelLog {
  id: string;
  vehicle_id: string;
  date: string;
  liters: number;
  total_cost: number;
  km: number;
  station?: string | null;
  transaction_id?: number | null;
}

export interface MaintenanceScheduleItem {
  type: MaintenanceType;
  label: string;
  status: MaintenanceAlertStatus;
  lastServiceDate?: string | null;
  lastKm?: number | null;
  nextKm?: number | null;
  nextDate?: string | null;
  kmRemaining?: number | null;
  daysRemaining?: number | null;
  message: string;
}

export interface MaintenanceAlert {
  type: MaintenanceType;
  label: string;
  status: "upcoming" | "overdue";
  nextKm?: number | null;
  nextDate?: string | null;
  kmRemaining?: number | null;
  daysRemaining?: number | null;
  message: string;
}

export interface DocumentAlert {
  document: VehicleDocument;
  status: "upcoming" | "overdue";
  daysRemaining: number;
  message: string;
}
