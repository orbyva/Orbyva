export type BookStatus = "to_read" | "reading" | "read" | "abandoned";

export interface Book {
  google_id: string;
  user_id?: string;
  title: string;
  authors: string[];
  published_year?: number | null;
  cover_url?: string | null;
  categories: string[];
  description?: string | null;
  page_count?: number | null;
  publisher?: string | null;
  isbn13?: string | null;
  status: BookStatus;
  /** Marca-página, só faz sentido em status `reading`. */
  current_page?: number | null;
  /** Nota do usuário de 0 a 10 (meias notas). */
  rating?: number | null;
  notes?: string | null;
  would_recommend?: boolean;
  /** Favorito explícito, independente de nota / recomendaria. */
  is_favorite?: boolean;
  read_dates: string[];
  /** Nota média Google Books (0–5), só informativa. */
  score_google?: number | null;
  created_at?: string;
}

/** Comentário durante a leitura. */
export interface BookNote {
  id: string;
  user_id?: string;
  google_id: string;
  page?: number | null;
  body: string;
  created_at: string;
}

export type BookNoteCreateRequest = {
  google_id: string;
  page?: number | null;
  body: string;
};

export type BookCreateRequest = Omit<Book, "created_at" | "user_id">;
export type BookUpdateRequest = Partial<Omit<Book, "user_id">> & {
  google_id: string;
};

export type BookListFilter = BookStatus;
export type BookRatingFloor = "all" | "6" | "7" | "8" | "9";
