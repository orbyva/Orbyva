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

export type DocumentType = "ipva" | "licensing" | "insurance" | "fine" | "other";

export type MaintenanceAlertStatus = "ok" | "upcoming" | "overdue" | "none";

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
  created_at?: string;
  updated_at?: string;
}

export interface Maintenance {
  id: string;
  vehicle_id: string;
  type: MaintenanceType;
  custom_type?: string | null;
  service_date: string;
  km_at_service: number;
  cost?: number | null;
  shop?: string | null;
  next_km?: number | null;
  next_date?: string | null;
  notes?: string | null;
  transaction_id?: number | null;
  created_at?: string;
}

export interface FuelLog {
  id: string;
  vehicle_id: string;
  date: string;
  liters: number;
  total_cost: number;
  km: number;
  station?: string | null;
  notes?: string | null;
  transaction_id?: number | null;
  created_at?: string;
}

export interface VehicleDocument {
  id: string;
  vehicle_id: string;
  type: DocumentType;
  custom_type?: string | null;
  due_date: string;
  cost?: number | null;
  paid: boolean;
  paid_date?: string | null;
  notes?: string | null;
  created_at?: string;
}

export type VehicleCreateRequest = Omit<
  Vehicle,
  "id" | "user_id" | "created_at" | "updated_at"
>;

export type VehicleUpdateRequest = Partial<VehicleCreateRequest> & { id: string };

export type MaintenanceCreateRequest = Omit<Maintenance, "id" | "created_at">;

export type MaintenanceUpdateRequest = Partial<MaintenanceCreateRequest> & {
  id: string;
};

export type FuelLogCreateRequest = Omit<FuelLog, "id" | "created_at">;

export type FuelLogUpdateRequest = Partial<FuelLogCreateRequest> & { id: string };

export type VehicleDocumentCreateRequest = Omit<VehicleDocument, "id" | "created_at">;

export type VehicleDocumentUpdateRequest = Partial<VehicleDocumentCreateRequest> & {
  id: string;
};

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
