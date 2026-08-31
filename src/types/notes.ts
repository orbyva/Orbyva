/** Contratos do módulo de Notas (feature 055) — espelham `public.note`. */

/**
 * O que a nota é (feature 058). **Espelha o `check` de `note.kind`**
 * (`supabase/migrations/20260816180000_note_canvas.sql`) — mexeu num, mexe no outro.
 *
 * `markdown` é o default do banco, então nota antiga (inclusive as copiadas de `project.notes`
 * pela 055) cai aqui sem migração de dados.
 */
export const NOTE_KINDS = ["markdown", "canvas"] as const;

export type NoteKind = (typeof NOTE_KINDS)[number];

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
  /** Markdown cru. Nunca `null`: a coluna é `not null default ''`. Vazio numa nota-canvas. */
  content: string;
  /** `not null default 'markdown'` no banco — nota antiga vem como markdown sem migração de dados. */
  kind: NoteKind;
  /** Desenho do Excalidraw. `null` em nota markdown. */
  canvas_data: NoteCanvasData | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * O JSON nativo do Excalidraw (formato `.excalidraw`) como ele é gravado no `jsonb` — descrito de
 * forma **estrutural e mínima** de propósito: o tipo real (`ExcalidrawElement`) mora dentro do
 * pacote de 2,7 MB, e importá-lo aqui acorrentaria os contratos do módulo à versão da lib. O que o
 * app precisa saber fora do editor é só "quantos elementos tem" (o card da lista); quem de fato
 * desenha faz o cast na fronteira, em `CanvasEditor`/`CanvasBlock`.
 */
export interface NoteCanvasData {
  elements: readonly unknown[];
  /** Só a parte persistível do `appState` (cor de fundo, grid…), nunca o estado volátil. */
  appState?: Record<string, unknown> | null;
  /** Imagens coladas no desenho, indexadas por id — vazio enquanto não houver upload. */
  files?: Record<string, unknown> | null;
}

/**
 * Payload de create/update. `id`, `user_id` e os timestamps ficam de fora: quem os preenche é o
 * banco (defaults) ou `src/api/notes/notes.ts` (`user_id`, `updated_at`).
 *
 * `kind`/`canvas_data` são opcionais porque a esmagadora maioria das criações é de nota markdown e
 * o banco já tem o default — quem omite ganha `'markdown'` de `normalizeNoteDraft`.
 */
export type NoteDraft = {
  title: string;
  content: string;
  project_id: string | null;
  kind?: NoteKind;
  canvas_data?: NoteCanvasData | null;
};

/**
 * O rascunho depois de `normalizeNoteDraft` — o que de fato vai para o `insert`. Aqui `kind` e
 * `canvas_data` já não são opcionais: a normalização resolveu o default.
 */
export type NormalizedNoteDraft = Required<NoteDraft>;

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
