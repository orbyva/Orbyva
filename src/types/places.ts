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

export interface PlaceVisit {
  id: string;
  user_id?: string;
  trip_id?: string | null;
  name: string;
  type: PlaceType;
  rating?: number | null;
  notes?: string | null;
  visited_date: string;
  address?: string | null;
  would_recommend: boolean;
  created_at?: string;
  trip?: { id: string; title: string; destination?: string | null } | null;
}

export type PlaceVisitCreateRequest = Omit<
  PlaceVisit,
  "id" | "user_id" | "created_at" | "trip"
>;

export type PlaceVisitUpdateRequest = Partial<PlaceVisitCreateRequest> & {
  id: string;
};

export type PlaceFilter = "all" | "local" | "trip" | PlaceType;
