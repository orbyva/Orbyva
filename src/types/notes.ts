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

/**
 * Entidades que uma nota pode referenciar (feature 056).
 *
 * **Este union espelha exatamente o `check` de `note_link.entity_type`**
 * (`supabase/migrations/20260816170000_note_links.sql`) — é o contrato entre o banco e o app.
 * Acrescentar um tipo aqui sem acrescentar lá faz o insert estourar em runtime; o contrário deixa
 * um tipo inalcançável. Mexeu num, mexe no outro.
 */
export const NOTE_LINK_ENTITY_TYPES = [
  "project",
  "task",
  "book",
  "movie",
  "album",
  "trip",
  "place",
  "goal",
  "habit",
  "vehicle",
] as const;

export type NoteLinkEntityType = (typeof NOTE_LINK_ENTITY_TYPES)[number];

/**
 * Vínculo N:N entre uma nota e qualquer entidade do app — a parte "conversam com tudo".
 *
 * `entity_id` é `text`, não `uuid`, porque nem toda entidade referenciável tem id uuid (a origem é
 * polimórfica e sem FK). Vínculo órfão — entidade apagada — é caso previsto: a UI mostra
 * "referência removida" em vez de sumir com a linha.
 */
export interface NoteLink {
  id: string;
  user_id?: string;
  note_id: string;
  entity_type: NoteLinkEntityType;
  entity_id: string;
  /** Rótulo congelado no momento do vínculo, para o painel não depender de buscar a entidade. */
  label: string | null;
  created_at?: string;
}

/** Payload de criação. `id`/`user_id`/`created_at` são do banco ou de `src/api/notes/noteLinks.ts`. */
export type NoteLinkDraft = {
  note_id: string;
  entity_type: NoteLinkEntityType;
  entity_id: string;
  label?: string | null;
};
