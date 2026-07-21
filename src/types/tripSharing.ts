export type TripMemberRole = "owner" | "editor";

export type TripInviteStatus = "pending" | "accepted" | "revoked" | "expired";

export type TripExpenseVisibility = "personal" | "shared";

export interface TripMember {
  id: string;
  trip_id: string;
  user_id: string;
  role: TripMemberRole;
  display_name?: string | null;
  avatar_url?: string | null;
  joined_at?: string;
}

export interface TripInvite {
  id: string;
  trip_id: string;
  token: string;
  email?: string | null;
  created_by: string;
  status: TripInviteStatus;
  expires_at: string;
  accepted_by?: string | null;
  created_at?: string;
}

export interface TripPlaceOpinion {
  id: string;
  place_visit_id: string;
  user_id: string;
  rating?: number | null;
  notes?: string | null;
  would_recommend: boolean;
  created_at?: string;
  updated_at?: string;
  display_name?: string | null;
}

export interface TripExpenseSplit {
  id: string;
  expense_id: string;
  user_id: string;
  amount: number;
  transaction_id?: number | null;
  created_at?: string;
  display_name?: string | null;
}

export type TripAccessRole = TripMemberRole | null;
