/** Contratos do módulo de Notas (feature 055) — espelham `public.note`. */

export interface Note {
  id: string;
  user_id?: string;
  /**
   * Projeto ao qual a nota está vinculada. Nulo = nota solta, que é o caso normal — o vínculo é
   * opcional de propósito. Excluir o projeto não apaga a nota, só zera esta coluna
   * (`on delete set null`).
   */
  project_id: string | null;
  title: string;
  /** Markdown cru. Nunca `null`: a coluna é `not null default ''`. */
  content: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Payload de create/update. `id`, `user_id` e os timestamps ficam de fora: quem os preenche é o
 * banco (defaults) ou `src/api/notes/notes.ts` (`user_id`, `updated_at`).
 */
export type NoteDraft = {
  title: string;
  content: string;
  project_id: string | null;
};

export type NoteUpdateRequest = Partial<NoteDraft> & { id: string };
