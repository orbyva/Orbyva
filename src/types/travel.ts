export type TripStatus =
  | "planning"
  | "upcoming"
  | "ongoing"
  | "completed"
  | "cancelled";

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

export interface Trip {
  id: string;
  user_id?: string;
  title: string;
  destination?: string | null;
  start_date: string;
  end_date: string;
  budget?: number | null;
  spent?: number | null;
  notes?: string | null;
  status: TripStatus;
  created_at?: string;
  updated_at?: string;
}

export interface TripChecklistItem {
  id: string;
  trip_id: string;
  title: string;
  category: TripChecklistCategory;
  done: boolean;
  sort_order: number;
  created_at?: string;
}

export interface TripExpense {
  id: string;
  trip_id: string;
  description: string;
  amount: number;
  category: TripExpenseCategory;
  expense_date: string;
  transaction_id?: number | null;
  created_at?: string;
}

export interface TripItineraryDay {
  id: string;
  trip_id: string;
  day_number: number;
  date?: string | null;
  title?: string | null;
  notes?: string | null;
  activities?: TripItineraryActivity[];
}

export interface TripItineraryActivity {
  id: string;
  day_id: string;
  title: string;
  activity_time?: string | null;
  notes?: string | null;
  place_visit_id?: string | null;
  sort_order: number;
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

export interface TripWithChecklist extends Trip {
  checklist: TripChecklistItem[];
  checklistProgress: number;
  daysUntilStart: number | null;
}

export interface TripFull extends TripWithChecklist {
  expenses: TripExpense[];
  itinerary: TripItineraryDay[];
  milestones: TripMilestone[];
  placesCount: number;
  expenseTotal: number;
  budgetRemaining: number | null;
}

export type TripCreateRequest = Omit<Trip, "id" | "user_id" | "created_at" | "updated_at">;

export type TripUpdateRequest = Partial<TripCreateRequest> & { id: string };

export type TripChecklistCreateRequest = Omit<TripChecklistItem, "id" | "created_at">;

export type TripChecklistUpdateRequest = Partial<TripChecklistCreateRequest> & {
  id: string;
};

export type TripExpenseCreateRequest = Omit<TripExpense, "id" | "created_at">;

export type TripExpenseUpdateRequest = Partial<TripExpenseCreateRequest> & {
  id: string;
};

export type TripMilestoneCreateRequest = Omit<TripMilestone, "id" | "created_at">;

export type TripMilestoneUpdateRequest = Partial<TripMilestoneCreateRequest> & {
  id: string;
};

export type TripItineraryDayCreateRequest = Omit<TripItineraryDay, "id" | "activities">;

export type TripItineraryActivityCreateRequest = Omit<TripItineraryActivity, "id">;

export type TripItineraryActivityUpdateRequest = Partial<
  TripItineraryActivityCreateRequest
> & { id: string };
