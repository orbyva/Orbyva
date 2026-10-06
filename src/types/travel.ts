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
  destination_lat?: number | null;
  destination_lng?: number | null;
  destination_place_id?: string | null;
  start_date: string;
  end_date: string;
  budget?: number | null;
  spent?: number | null;
  notes?: string | null;
  status: TripStatus;
  /** Origem inicial do roteiro (fallback sem GPS). */
  origin_lat?: number | null;
  origin_lng?: number | null;
  origin_label?: string | null;
  created_at?: string;
  updated_at?: string;
  /** Paradas multi-cidade (quando carregadas). */
  stops?: TripStop[];
}

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
  created_at?: string;
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
  visibility?: TripExpenseVisibility;
  created_by_user_id?: string | null;
  paid_by_user_id?: string | null;
  /** Gasto gerado a partir de um lugar visitado. */
  place_visit_id?: string | null;
  created_at?: string;
  splits?: TripExpenseSplit[];
}

export type TripExpenseVisibility = "personal" | "shared";

export interface TripExpenseSplit {
  id?: string;
  expense_id?: string;
  user_id: string;
  amount: number;
  transaction_id?: number | null;
  display_name?: string | null;
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

export type TripVisitStatus = "pending" | "completed" | "skipped";

export interface TripItineraryActivity {
  id: string;
  day_id: string;
  title: string;
  /** Horário do evento ou saída do deslocamento. */
  activity_time?: string | null;
  /** Chegada do deslocamento (quando category = transport). */
  arrival_time?: string | null;
  /**
   * Embarque do deslocamento (feature 102) — o terceiro instante do voo, anterior a
   * `activity_time` (a partida) e **não** derivável dela: fecha ~20 min antes, mas varia por
   * companhia, aeroporto e tipo de voo. É o horário que decide quando sair do hotel.
   *
   * Só é oferecido nos modos com portão (voo, trem, ônibus) — ver `transportModeHasBoarding`.
   */
  boarding_time?: string | null;
  /**
   * Modo do deslocamento: flight | train | bus | car | other.
   */
  transport_mode?: string | null;
  /** @deprecated Escopo legado; conflitos usam só os horários. */
  transport_scope?: string | null;
  /** Origem do deslocamento (país / estado / cidade). */
  origin_label?: string | null;
  origin_lat?: number | null;
  origin_lng?: number | null;
  origin_place_id?: string | null;
  /** Destino do deslocamento (país / estado / cidade). */
  destination_label?: string | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  destination_place_id?: string | null;
  notes?: string | null;
  place_visit_id?: string | null;
  sort_order: number;
  link_url?: string | null;
  is_reserved?: boolean;
  /** Tipo do lugar (mesmo conjunto de PlaceType) ou transport. */
  category?: TripActivityCategory;
  /** Checklist do evento, nunca auto por horário. */
  visit_status?: TripVisitStatus;
  completed_at?: string | null;
  skipped_at?: string | null;
  created_by_user_id?: string | null;
  created_by_name?: string | null;
  created_by_avatar?: string | null;
  /**
   * Arquivos e links anexados a esta linha do roteiro (feature 102). Chega preenchido por
   * `fetchTripDetailBundle` — ausente significa "não carregado", não "vazio", e por isso o card usa
   * `assets?.length ?? 0` em vez de assumir lista.
   */
  assets?: TripActivityAsset[];
}

/**
 * Um asset de uma linha do roteiro (feature 102) — espelha `public.trip_activity_asset`.
 *
 * Vale igualmente para evento e deslocamento: os dois querem "coisas importantes anexadas a esta
 * linha", e o pedido-mãe pede o botão nos dois.
 *
 * Arquivo **não** tem URL: o bucket `trip-assets` é privado (um cartão de embarque tem nome, número
 * de documento e localizador — num bucket público a URL é a senha), então o que se guarda é o
 * `storage_path` e cada abertura assina uma URL nova via `signedAssetUrl`.
 */
export interface TripActivityAsset {
  id: string;
  /** Viagem, denormalizada — é o que permite baixar os assets na wave 1 do bundle e o escopo da
   * RLS. Atividade muda de dia, nunca de viagem, então o valor nunca precisa ser reescrito. */
  trip_id: string;
  activity_id: string;
  kind: TripActivityAssetKind;
  /** Rótulo editável. `null` = a UI cai para o nome do arquivo ou para o host da URL. */
  label: string | null;
  /** Só em `kind = 'link'`: a URL de destino, como o usuário colou. */
  url: string | null;
  /** Só em `kind = 'file'`: caminho em `trip-assets`, sempre
   * `{tripId}/{activityId}/{uuid}.{ext}` — a primeira pasta é o que as policies do bucket leem. */
  storage_path: string | null;
  /** Decide se a URL assinada abre inline (pdf/imagem) ou força download. */
  mime_type: string | null;
  size_bytes: number | null;
  position: number;
  created_by_user_id?: string | null;
  created_at?: string;
}

/** `file` = arquivo no bucket privado; `link` = URL externa. Gravado na coluna, não derivado de
 * "tem `storage_path`?" — é o que o `check` da tabela ancora e o que a UI lê. */
export type TripActivityAssetKind = "file" | "link";

/** Tipos de evento no roteiro, alinhados a lugares + transporte entre cidades. */
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
  /** Contagens para cards da lista (evita baixar checklist inteiro). */
  checklistDone?: number;
  checklistTotal?: number;
  daysUntilStart: number | null;
}

export interface TripFull extends TripWithChecklist {
  expenses: TripExpense[];
  itinerary: TripItineraryDay[];
  milestones: TripMilestone[];
  placesCount: number;
  expenseTotal: number;
  budgetRemaining: number | null;
  /** Papel do usuário atual nesta viagem. */
  myRole?: "owner" | "editor" | null;
  isShared?: boolean;
}

export type TripCreateRequest = Omit<
  Trip,
  "id" | "user_id" | "created_at" | "updated_at" | "stops"
> & {
  stops?: Omit<TripStop, "id" | "trip_id" | "created_at">[];
};

export type TripUpdateRequest = Partial<
  Omit<TripCreateRequest, "stops">
> & {
  id: string;
  stops?: Omit<TripStop, "id" | "trip_id" | "created_at">[];
};

export type TripChecklistCreateRequest = Omit<TripChecklistItem, "id" | "created_at">;

export type TripChecklistUpdateRequest = Partial<TripChecklistCreateRequest> & {
  id: string;
};

export type TripExpenseCreateRequest = Omit<
  TripExpense,
  "id" | "created_at" | "splits" | "transaction_id"
> & {
  splits?: { user_id: string; amount: number }[];
};

export type TripExpenseUpdateRequest = Partial<TripExpenseCreateRequest> & {
  id: string;
  splits?: { user_id: string; amount: number }[];
};

export type TripMilestoneCreateRequest = Omit<TripMilestone, "id" | "created_at">;

export type TripMilestoneUpdateRequest = Partial<TripMilestoneCreateRequest> & {
  id: string;
};

export type TripItineraryDayCreateRequest = Omit<TripItineraryDay, "id" | "activities">;

export type TripItineraryActivityCreateRequest = Omit<
  TripItineraryActivity,
  // `assets` é coleção filha (tabela própria), não coluna: deixá-la aqui faria o insert mandar um
  // campo que `trip_itinerary_activity` não tem.
  "id" | "created_by_user_id" | "created_by_name" | "created_by_avatar" | "assets"
>;

export type TripItineraryActivityUpdateRequest = Partial<
  TripItineraryActivityCreateRequest
> & { id: string };
