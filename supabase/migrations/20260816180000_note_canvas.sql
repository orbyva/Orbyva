-- Módulo de Notas — canvas de desenho livre (feature 058).
--
-- Canvas é uma **nota**, não uma entidade nova: ganha de graça a RLS, o `project_id`, o
-- `note_link` (056), o `wipe_own_data` e a listagem que a 055 já montou em `public.note`. Uma
-- tabela `canvas` separada duplicaria tudo isso para economizar uma coluna nula.
--
-- `kind` nasce com default 'markdown', então toda nota existente (inclusive as copiadas de
-- `project.notes` pela 055) continua sendo markdown sem update nenhum.
--
-- `canvas_data` guarda o JSON nativo do Excalidraw (`elements` + `appState` relevante) — é o
-- formato `.excalidraw`, portável para o app oficial. Fica `null` em nota markdown.

alter table public.note
  add column if not exists kind text not null default 'markdown';

alter table public.note
  add column if not exists canvas_data jsonb;

-- O `check` é o contrato que `NoteKind` (src/types/notes.ts) espelha. Mexeu num, mexe no outro.
-- `do $$` em vez de `add constraint if not exists` porque Postgres 16 não tem essa forma.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'note_kind_check'
  ) then
    alter table public.note
      add constraint note_kind_check check (kind in ('markdown', 'canvas'));
  end if;
end $$;

comment on column public.note.kind is
  'markdown = nota de texto (o padrão); canvas = desenho livre do Excalidraw, cujo conteúdo está '
  'em canvas_data.';
comment on column public.note.canvas_data is
  'JSON nativo do Excalidraw (elements + appState) — formato .excalidraw. Nulo em nota markdown.';
