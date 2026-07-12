export type HomeMaintenanceType =
  | "ac_filter"
  | "painting"
  | "plumbing"
  | "electrical"
  | "pest_control"
  | "cleaning"
  | "garden"
  | "appliance"
  | "security"
  | "general"
  | "other";

export interface HomeProfile {
  id: string;
  user_id?: string;
  name: string;
  address?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface HomeMaintenance {
  id: string;
  home_id: string;
  type: HomeMaintenanceType;
  custom_type?: string | null;
  service_date: string;
  cost?: number | null;
  provider?: string | null;
  next_date?: string | null;
  notes?: string | null;
  created_at?: string;
}

export type HomeProfileCreateRequest = Omit<
  HomeProfile,
  "id" | "user_id" | "created_at" | "updated_at"
>;

export type HomeProfileUpdateRequest = Partial<HomeProfileCreateRequest> & {
  id: string;
};

export type HomeMaintenanceCreateRequest = Omit<HomeMaintenance, "id" | "created_at">;

export type HomeMaintenanceUpdateRequest = Partial<HomeMaintenanceCreateRequest> & {
  id: string;
};

export interface HomeMaintenanceScheduleItem {
  type: HomeMaintenanceType;
  label: string;
  status: "ok" | "upcoming" | "overdue" | "none";
  lastServiceDate?: string | null;
  nextDate?: string | null;
  daysRemaining?: number | null;
  message: string;
}
