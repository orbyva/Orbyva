export enum MovieStatus {
  TO_WATCH = "to_watch",
  WATCHING = "watching",
  WATCHED = "watched",
  ABANDONED = "abandoned",
}

export type MovieMediaType = "movie" | "series";

export interface Movie {
  imdb_id: string;
  user_id?: string;
  title: string;
  year: number;
  poster?: string | null;
  genre: string[];
  director?: string | null;
  actors: string[];
  plot?: string | null;
  type: MovieMediaType;
  /** Nota do usuário de 0 a 10 (meias notas permitidas). */
  rating?: number | null;
  status: MovieStatus;
  score_imdb?: number | null;
  watched_dates: Date[] | string[];
  /** Opinião escrita, mesmo papel de place_visit.notes. */
  notes?: string | null;
  /** Se recomendaria, mesmo papel de place_visit.would_recommend. */
  would_recommend?: boolean;
  /** Favorito explícito, independente de nota / recomendaria. */
  is_favorite?: boolean;
  /** ID TMDB da série (quando type === series). */
  tmdb_tv_id?: number | null;
  /** Acompanhar a série. */
  following?: boolean;
  /** Avisar episódios novos. */
  notify_new_episodes?: boolean;
  /** Total de episódios (TMDB) p/ barra de progresso. */
  episode_count?: number | null;
  created_at?: string;
}

export type MovieEpisodeStatus = "unwatched" | "watched" | "skipped";

export interface MovieEpisode {
  user_id?: string;
  imdb_id: string;
  season_number: number;
  episode_number: number;
  tmdb_episode_id?: number | null;
  episode_name?: string | null;
  air_date?: string | null;
  status: MovieEpisodeStatus;
  watched_at?: string | null;
  rating?: number | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type MovieEpisodeUpsert = Pick<
  MovieEpisode,
  | "imdb_id"
  | "season_number"
  | "episode_number"
  | "tmdb_episode_id"
  | "episode_name"
  | "air_date"
  | "status"
  | "watched_at"
  | "rating"
  | "notes"
>;

export type MovieCreateRequest = Omit<Movie, "created_at" | "user_id">;
export type MovieUpdateRequest = Partial<Omit<Movie, "user_id">> & {
  imdb_id: string;
};

export type MovieListFilter =
  | "to_watch"
  | "watching"
  | "watched"
  | "abandoned";
export type MovieTypeFilter = "all" | MovieMediaType;
