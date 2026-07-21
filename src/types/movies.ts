export enum MovieStatus {
  TO_WATCH = "to_watch",
  WATCHED = "watched",
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
  /** Opinião escrita — mesmo papel de place_visit.notes. */
  notes?: string | null;
  /** Se recomendaria — mesmo papel de place_visit.would_recommend. */
  would_recommend?: boolean;
  created_at?: string;
}

export type MovieCreateRequest = Omit<Movie, "created_at" | "user_id">;
export type MovieUpdateRequest = Partial<Omit<Movie, "user_id">> & {
  imdb_id: string;
};

export type MovieListFilter = "to_watch" | "watched";
export type MovieTypeFilter = "all" | MovieMediaType;
