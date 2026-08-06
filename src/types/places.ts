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

/** Espelha filmes: to_visit ≈ to_watch, visited ≈ watched. */
export type PlaceStatus = "to_visit" | "visited";

export interface PlaceVisit {
  id: string;
  user_id?: string;
  trip_id?: string | null;
  name: string;
  type: PlaceType;
  status?: PlaceStatus;
  rating?: number | null;
  notes?: string | null;
  /** Null quando ainda está em "Para visitar". */
  visited_date?: string | null;
  /** Valor gasto no local (opcional; só em visitados). */
  amount?: number | null;
  /** Lançamento em Finanças, se registrado. */
  transaction_id?: number | null;
  address?: string | null;
  /** Latitude WGS84 (Places / rota). */
  lat?: number | null;
  /** Longitude WGS84 (Places / rota). */
  lng?: number | null;
  /** Place ID Google (Places Autocomplete New). */
  google_place_id?: string | null;
  /** @deprecated Preferir google_place_id. */
  geoapify_place_id?: string | null;
  would_recommend: boolean;
  created_at?: string;
  trip?: { id: string; title: string; destination?: string | null } | null;
  /** Agregado de opiniões do grupo (viagem compartilhada). */
  opinionSummary?: PlaceOpinionSummary | null;
}

export type PlaceOpinionSummary = {
  avgRating: number | null;
  ratedCount: number;
  recommendYes: number;
  recommendNo: number;
  totalOpinions: number;
};

export type PlaceVisitCreateRequest = Omit<
  PlaceVisit,
  "id" | "user_id" | "created_at" | "trip" | "opinionSummary"
>;

export type PlaceVisitUpdateRequest = Partial<PlaceVisitCreateRequest> & {
  id: string;
};

export type PlaceFilter = "all" | "local" | "trip" | PlaceType;
export type PlaceListStatusFilter = PlaceStatus;
