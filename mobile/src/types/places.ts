export type PlaceType =
  | "restaurant"
  | "cafe"
  | "bar"
  | "attraction"
  | "hotel"
  | "park"
  | "museum"
  | "shop"
  | "other";

export type PlaceStatus = "to_visit" | "visited";

export type PlaceFilter = "all" | "local" | "trip" | PlaceType;

export interface PlaceVisit {
  id: string;
  user_id?: string;
  trip_id?: string | null;
  name: string;
  type: PlaceType;
  status?: PlaceStatus;
  rating?: number | null;
  notes?: string | null;
  visited_date?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  would_recommend: boolean;
  amount?: number | null;
  transaction_id?: number | null;
  google_place_id?: string | null;
  created_at?: string;
  trip?: { id: string; title: string; destination?: string | null } | null;
  opinionSummary?: PlaceOpinionSummary | null;
}

/** Agregado das opiniões dos membros da viagem sobre um lugar. */
export type PlaceOpinionSummary = {
  avgRating: number | null;
  ratedCount: number;
  recommendYes: number;
  recommendNo: number;
  totalOpinions: number;
};

/** Opinião de um membro sobre um lugar de viagem (`trip_place_opinion`). */
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

export interface PlaceVisitOccurrence {
  id: string;
  place_visit_id: string;
  user_id?: string;
  visited_date: string;
  rating?: number | null;
  notes?: string | null;
  amount?: number | null;
  would_recommend?: boolean;
  transaction_id?: number | null;
  created_at?: string;
}
