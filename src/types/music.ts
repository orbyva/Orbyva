export type AlbumStatus = "to_listen" | "listened";
export type AlbumType =
  | "album"
  | "ep"
  | "single"
  | "compilation"
  | "other";
export type AlbumSource = "spotify" | "musicbrainz" | "manual";

export interface Album {
  musicbrainz_id: string;
  user_id?: string;
  title: string;
  artists: string[];
  release_year?: number | null;
  album_type: AlbumType;
  cover_url?: string | null;
  source: AlbumSource;
  status: AlbumStatus;
  rating?: number | null;
  notes?: string | null;
  would_recommend?: boolean;
  /** Favorito explícito — independente de nota / recomendaria. */
  is_favorite?: boolean;
  listened_dates: string[];
  /** Notas por faixa: `"disc:position"` → 0–10. */
  track_ratings?: Record<string, number>;
  created_at?: string;
}

export type AlbumCreateRequest = Omit<Album, "created_at" | "user_id">;
export type AlbumUpdateRequest = Partial<Omit<Album, "user_id">> & {
  musicbrainz_id: string;
};

export type AlbumListFilter = AlbumStatus;
export type AlbumRatingFloor = "all" | "6" | "7" | "8" | "9";
