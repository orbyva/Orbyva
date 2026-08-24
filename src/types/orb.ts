import type { MovieCreateRequest } from "@/types/movies";
import type { BookStatus } from "@/types/books";
import type { AlbumCreateRequest } from "@/types/music";

export type OrbModule = "movies" | "books" | "albums";

export type OrbProposalToolName =
  | "propose_mark_movie"
  | "propose_mark_book"
  | "propose_manual_book"
  | "propose_mark_album";

/** Filme: a Edge já resolve o catálogo (TMDB/OMDb) e devolve o registro completo. */
export type OrbMoviePayload = MovieCreateRequest;

/**
 * Livro: a Edge só resolve `google_id` (via busca ranqueada); o restante do
 * registro (autores, categorias, capa...) é buscado pelo client ao aplicar
 * (`fetchGoogleBookById`), porque `search_book_catalog` não tem um "detalhe
 * completo" barato como TMDB tem.
 */
export interface OrbBookPayload {
  google_id: string;
  title: string;
  status: BookStatus;
  rating?: number | null;
  read_date?: string | null;
  current_page?: number | null;
  notes?: string | null;
  would_recommend?: boolean;
  is_favorite?: boolean;
}

/** Álbum: `search_album_catalog` (Spotify/MusicBrainz) já devolve o hit quase pronto. */
export type OrbAlbumPayload = AlbumCreateRequest;

/**
 * Livro fora do Google Books: o usuário ditou os dados, não há catálogo pra
 * consultar. O `google_id` sintético (`manual_…`) é gerado no client ao aplicar.
 */
export interface OrbManualBookPayload {
  title: string;
  authors?: string[];
  published_year?: number | null;
  status: BookStatus;
  rating?: number | null;
  read_date?: string | null;
  current_page?: number | null;
  notes?: string | null;
  would_recommend?: boolean;
  is_favorite?: boolean;
}

export type OrbProposalPayload =
  | OrbMoviePayload
  | OrbBookPayload
  | OrbManualBookPayload
  | OrbAlbumPayload;

export type OrbProposalStatus = "pending" | "applied" | "dismissed" | "expired";

export interface OrbProposal {
  id: string;
  tool_name: OrbProposalToolName;
  module: OrbModule;
  payload: OrbProposalPayload;
  /** Texto humano pronto pro ActionCard, ex.: "Marcar 'Gente Grande 2' como assistido, nota 4". */
  summary: string;
  status: OrbProposalStatus;
  applied_entity_id?: string | null;
}

export type OrbSuggestedActionKind =
  | "similar_movies"
  | "recommend_friend"
  | "rate_more"
  | "search_more";

export interface OrbSuggestedAction {
  id: string;
  label: string;
  action: OrbSuggestedActionKind;
  args?: Record<string, unknown>;
}

export interface OrbClarify {
  question: string;
  suggestions: string[];
}

export interface OrbAgentRequest {
  thread_id: string | null;
  message: string;
  locale: "pt-BR";
  timezone: string;
}

export interface OrbAgentResponse {
  thread_id: string;
  message_id: string;
  text: string;
  proposals: OrbProposal[];
  clarify: OrbClarify | null;
  suggested_actions: OrbSuggestedAction[];
}

export type OrbMessageRole = "user" | "assistant" | "tool";

export interface OrbMessage {
  id: string;
  thread_id: string;
  role: OrbMessageRole;
  content: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface OrbThread {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}
