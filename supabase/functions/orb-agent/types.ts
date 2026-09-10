/** Espelha `src/types/orb.ts` — duplicado porque a Edge (Deno) não importa de `src/`. */

export type OrbModule = "movies" | "books" | "albums";

export type OrbProposalToolName =
  | "propose_mark_movie"
  | "propose_mark_book"
  | "propose_mark_album";

export interface OrbProposalDraft {
  tool_name: OrbProposalToolName;
  module: OrbModule;
  payload: Record<string, unknown>;
  summary: string;
}

export type OrbSuggestedActionKind =
  | "similar_movies"
  | "recommend_friend"
  | "rate_more"
  | "search_more"
  | "open_library";

export const SUGGESTED_ACTION_KINDS: OrbSuggestedActionKind[] = [
  "similar_movies",
  "recommend_friend",
  "rate_more",
  "search_more",
  "open_library",
];

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
  locale?: string;
  timezone?: string;
}

/** Custo do turno, somado nas rodadas do loop. Também vai em `orb_message.meta`. */
export interface OrbUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  rounds: number;
  model: string;
}

export interface OrbAgentResponse {
  thread_id: string;
  message_id: string;
  text: string;
  proposals: Array<{
    id: string;
    tool_name: OrbProposalToolName;
    module: OrbModule;
    payload: Record<string, unknown>;
    summary: string;
  }>;
  clarify: OrbClarify | null;
  suggested_actions: OrbSuggestedAction[];
  usage?: OrbUsage;
}
