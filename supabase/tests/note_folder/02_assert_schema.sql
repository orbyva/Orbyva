\set ON_ERROR_STOP on

do $$
declare
  n int;
  txt text;
begin
  if to_regclass('public.note_folder') is null then
    raise exception 'FALHOU: tabela public.note_folder não existe';
  end if;

  -- ---- colunas de note_folder -------------------------------------------------------------
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='note_folder' and column_name='name'
     and is_nullable='NO';
  if not found then raise exception 'FALHOU: note_folder.name deveria ser not null'; end if;

  for txt in select unnest(array['parent_id','project_id','tag_id']) loop
    perform 1 from information_schema.columns
     where table_schema='public' and table_name='note_folder' and column_name=txt
       and is_nullable='YES';
    if not found then
      raise exception 'FALHOU: note_folder.% deveria ser nullable', txt;
    end if;
  end loop;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='note_folder' and column_name='created_at'
     and is_nullable='NO' and column_default like 'now()%';
  if not found then raise exception 'FALHOU: note_folder.created_at deveria ser not null default now()'; end if;

  -- ---- note.folder_id ---------------------------------------------------------------------
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='note' and column_name='folder_id'
     and is_nullable='YES';
  if not found then raise exception 'FALHOU: note.folder_id deveria existir e ser nullable'; end if;

  -- notas pré-existentes herdaram nulo sem update
  select count(*) into n from public.note where folder_id is not null;
  if n <> 0 then
    raise exception 'FALHOU: % nota(s) pré-existente(s) não ficaram com folder_id nulo', n;
  end if;

  -- ---- FKs e on delete --------------------------------------------------------------------
  perform 1 from pg_constraint
   where conrelid = 'public.note_folder'::regclass and contype = 'f'
     and confrelid = 'auth.users'::regclass and confdeltype = 'c';
  if not found then raise exception 'FALHOU: FK note_folder.user_id sem ON DELETE CASCADE'; end if;

  perform 1 from pg_constraint
   where conrelid = 'public.note_folder'::regclass and contype = 'f'
     and confrelid = 'public.note_folder'::regclass and confdeltype = 'c';
  if not found then raise exception 'FALHOU: FK parent_id sem ON DELETE CASCADE'; end if;

  perform 1 from pg_constraint
   where conrelid = 'public.note_folder'::regclass and contype = 'f'
     and confrelid = 'public.project'::regclass and confdeltype = 'n';
  if not found then raise exception 'FALHOU: FK project_id sem ON DELETE SET NULL'; end if;

  perform 1 from pg_constraint
   where conrelid = 'public.note_folder'::regclass and contype = 'f'
     and confrelid = 'public.tag'::regclass and confdeltype = 'n';
  if not found then raise exception 'FALHOU: FK tag_id sem ON DELETE SET NULL'; end if;

  perform 1 from pg_constraint
   where conrelid = 'public.note'::regclass and contype = 'f'
     and confrelid = 'public.note_folder'::regclass and confdeltype = 'n';
  if not found then raise exception 'FALHOU: FK note.folder_id sem ON DELETE SET NULL'; end if;

  perform 1 from pg_constraint
   where conrelid = 'public.note_folder'::regclass and contype = 'c'
     and conname = 'note_folder_parent_not_self';
  if not found then raise exception 'FALHOU: check parent_id is distinct from id ausente'; end if;

  -- ---- índices ----------------------------------------------------------------------------
  for txt in select unnest(array[
    'note_folder_user_idx','note_folder_parent_idx','note_folder_project_idx',
    'note_folder_tag_idx','note_folder_user_parent_name_unique','note_folder_id_idx'
  ]) loop
    perform 1 from pg_indexes where schemaname='public' and indexname=txt;
    if not found then raise exception 'FALHOU: índice % ausente', txt; end if;
  end loop;

  if coalesce(obj_description('public.note_folder'::regclass, 'pg_class'), '') = '' then
    raise exception 'FALHOU: falta comment on table public.note_folder';
  end if;

  -- ---- RLS + 4 policies -------------------------------------------------------------------
  perform 1 from pg_class where oid='public.note_folder'::regclass and relrowsecurity;
  if not found then raise exception 'FALHOU: RLS não está habilitada em public.note_folder'; end if;

  select count(*) into n from pg_policies where schemaname='public' and tablename='note_folder';
  if n <> 4 then raise exception 'FALHOU: esperadas 4 policies em note_folder, achadas %', n; end if;

  for txt in select unnest(array['select','insert','update','delete']) loop
    perform 1 from pg_policies
     where schemaname='public' and tablename='note_folder'
       and policyname = 'note_folder_' || txt || '_own'
       and roles @> array['authenticated']::name[]
       and coalesce(qual, '') || coalesce(with_check, '') like '%auth.uid()%';
    if not found then
      raise exception 'FALHOU: policy note_folder_%_own ausente ou sem auth.uid()', txt;
    end if;
  end loop;

  -- ---- trigger e wipe ---------------------------------------------------------------------
  perform 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid='public.note_folder'::regclass and t.tgname='trg_enforce_app_access'
     and p.proname='enforce_app_access' and not t.tgisinternal;
  if not found then raise exception 'FALHOU: trigger trg_enforce_app_access ausente em note_folder'; end if;

  select prosrc into txt from pg_proc where proname='wipe_own_data';
  if position('''note_folder''' in txt) = 0 then
    raise exception 'FALHOU: wipe_own_data não inclui note_folder';
  end if;
  if position('''note_folder''' in txt) < position('''note''' in txt) then
    raise exception 'FALHOU: wipe_own_data lista note_folder ANTES de note';
  end if;
  if position('''note_folder''' in txt) > position('''project''' in txt)
     or position('''note_folder''' in txt) > position('''tag''' in txt) then
    raise exception 'FALHOU: wipe_own_data lista note_folder DEPOIS de project/tag';
  end if;

  raise notice 'OK: schema, RLS, índices, FKs, wipe e trigger conferidos';
end $$;
