\set ON_ERROR_STOP on

-- Assertivas de schema da migration 20260816180000_note_canvas.sql (feature 058).
-- Cobre o roteiro que a feature mandava conferir à mão no SQL editor depois do `db push`:
-- "as notas existentes ficaram com kind = 'markdown'" e "um update para outro valor é rejeitado".
do $$
declare
  n int;
  txt text;
begin
  -- ---- colunas novas ----------------------------------------------------------------------
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='note' and column_name='kind'
     and data_type='text' and is_nullable='NO' and column_default like '%markdown%';
  if not found then
    raise exception 'FALHOU: note.kind deveria ser text not null default ''markdown''';
  end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='note' and column_name='canvas_data'
     and data_type='jsonb' and is_nullable='YES';
  if not found then
    raise exception 'FALHOU: note.canvas_data deveria ser jsonb nullable (nota markdown não tem desenho)';
  end if;

  -- A migration só ACRESCENTA: as 7 colunas da 055 + kind + canvas_data.
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='note';
  if n <> 9 then
    raise exception 'FALHOU: note deveria ter 9 colunas (7 da 055 + kind + canvas_data), tem %', n;
  end if;

  -- ---- notas antigas herdaram 'markdown' sem update nenhum --------------------------------
  select count(*) into n from public.note where kind <> 'markdown';
  if n <> 0 then
    raise exception 'FALHOU: % nota(s) pré-existente(s) não ficaram com kind = markdown', n;
  end if;
  select count(*) into n from public.note where canvas_data is not null;
  if n <> 0 then
    raise exception 'FALHOU: nota pré-existente não deveria ter canvas_data';
  end if;

  -- ---- check do kind: a lista fechada é o contrato com NoteKind (src/types/notes.ts) ------
  select pg_get_constraintdef(oid) into txt from pg_constraint
   where conrelid = 'public.note'::regclass and contype='c' and conname='note_kind_check';
  if txt is null then raise exception 'FALHOU: constraint note_kind_check ausente'; end if;
  if txt not like '%''markdown''%' or txt not like '%''canvas''%' then
    raise exception 'FALHOU: note_kind_check não cobre markdown e canvas: %', txt;
  end if;

  -- ---- comentários de coluna (documentação do contrato) -----------------------------------
  if coalesce(col_description('public.note'::regclass,
       (select ordinal_position from information_schema.columns
         where table_schema='public' and table_name='note' and column_name='kind')::int), '') = '' then
    raise exception 'FALHOU: falta comment on column public.note.kind';
  end if;

  -- ---- o que a 055/056 deixaram continua de pé ---------------------------------------------
  perform 1 from pg_class where oid='public.note'::regclass and relrowsecurity;
  if not found then raise exception 'FALHOU: RLS de public.note foi desligada pela migration'; end if;

  select count(*) into n from pg_policies where schemaname='public' and tablename='note';
  if n <> 4 then raise exception 'FALHOU: esperadas 4 policies em note, achadas %', n; end if;

  perform 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid='public.note'::regclass and t.tgname='trg_enforce_app_access'
     and p.proname='enforce_app_access' and not t.tgisinternal;
  if not found then
    raise exception 'FALHOU: trigger trg_enforce_app_access sumiu de public.note';
  end if;

  select prosrc into txt from pg_proc where proname='wipe_own_data';
  if position('''note''' in txt) = 0 then
    raise exception 'FALHOU: wipe_own_data não inclui note — canvas escaparia do wipe de conta';
  end if;

  raise notice 'OK: colunas kind/canvas_data, default nas notas antigas, check, RLS, trigger e wipe conferidos';
end $$;
