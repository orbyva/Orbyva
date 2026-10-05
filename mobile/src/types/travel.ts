export type TripStatus =
  | "planning"
  | "upcoming"
  | "ongoing"
  | "completed"
  | "cancelled";

export interface TripStop {
  id: string;
  trip_id: string;
  name: string;
  place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  start_date: string;
  end_date: string;
  sort_order: number;
}

export interface Trip {
  id: string;
  user_id?: string;
  title: string;
  destination?: string | null;
  start_date: string;
  end_date: string;
  status: TripStatus;
  notes?: string | null;
  budget?: number | null;
  spent?: number | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  destination_place_id?: string | null;
  origin_lat?: number | null;
  origin_lng?: number | null;
  origin_label?: string | null;
  created_at?: string;
  stops?: TripStop[];
}

export interface TripWithChecklist extends Trip {
  checklist: TripChecklistItem[];
  checklistProgress: number;
  checklistDone?: number;
  checklistTotal?: number;
  daysUntilStart: number | null;
}

export type TripChecklistCategory =
  | "documents"
  | "transport"
  | "lodging"
  | "packing"
  | "other";

export type TripExpenseCategory =
  | "transport"
  | "lodging"
  | "food"
  | "activity"
  | "shopping"
  | "other";

export type TripMilestoneType =
  | "flight"
  | "hotel"
  | "document"
  | "activity"
  | "other";

export interface TripChecklistItem {
  id: string;
  trip_id: string;
  title: string;
  category: TripChecklistCategory;
  done: boolean;
  sort_order: number;
}

export interface TripExpense {
  id: string;
  trip_id: string;
  description: string;
  amount: number;
  category: TripExpenseCategory;
  expense_date: string;
  visibility?: "personal" | "shared";
  created_by_user_id?: string | null;
  paid_by_user_id?: string | null;
  transaction_id?: number | null;
  splits?: TripExpenseSplit[];
}

export interface TripExpenseSplit {
  id: string;
  expense_id: string;
  user_id: string;
  amount: number;
  transaction_id?: number | null;
  display_name?: string | null;
}

export interface TripMember {
  id: string;
  trip_id: string;
  user_id: string;
  role: "owner" | "editor";
  display_name?: string | null;
}

export interface TripMilestone {
  id: string;
  trip_id: string;
  title: string;
  type: TripMilestoneType;
  due_date: string;
  done: boolean;
  notes?: string | null;
}

export interface TripItineraryActivity {
  id: string;
  day_id: string;
  title: string;
  activity_time?: string | null;
  arrival_time?: string | null;
  notes?: string | null;
  sort_order: number;
  category?: string | null;
  transport_mode?: string | null;
  origin_label?: string | null;
  origin_lat?: number | null;
  origin_lng?: number | null;
  origin_place_id?: string | null;
  destination_label?: string | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  destination_place_id?: string | null;
  place_visit_id?: string | null;
  visit_status?: "pending" | "completed" | "skipped" | null;
  completed_at?: string | null;
  skipped_at?: string | null;
}

export type TripActivityAssetKind = "file" | "link";

/** Espelha `public.trip_activity_asset` (web, feature 102). Arquivo vive no bucket privado
 * `trip-assets` e só abre por URL assinada. */
export interface TripActivityAsset {
  id: string;
  trip_id: string;
  activity_id: string;
  kind: TripActivityAssetKind;
  label: string | null;
  url: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  position: number;
  created_by_user_id?: string | null;
  created_at?: string;
}

export type TripActivityCategory =
  | "restaurant"
  | "cafe"
  | "bar"
  | "attraction"
  | "hotel"
  | "park"
  | "museum"
  | "shop"
  | "transport"
  | "other";

export interface TripItineraryDay {
  id: string;
  trip_id: string;
  day_number: number;
  date?: string | null;
  title?: string | null;
  notes?: string | null;
  activities?: TripItineraryActivity[];
}

export interface TripInvite {
  id: string;
  trip_id: string;
  token: string;
  email?: string | null;
  status: string;
  expires_at: string;
}
