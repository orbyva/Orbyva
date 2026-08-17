\set ON_ERROR_STOP on

do $$
declare
  n int;
  txt text;
begin
  -- ---- tabela e colunas ------------------------------------------------------------------
  if to_regclass('public.note') is null then
    raise exception 'FALHOU: tabela public.note não existe';
  end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'note';
  if n <> 7 then
    raise exception 'FALHOU: note deveria ter 7 colunas, tem %', n;
  end if;

  -- not null / defaults
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='note' and column_name='id'
     and column_default like 'gen_random_uuid%';
  if not found then raise exception 'FALHOU: note.id sem default gen_random_uuid()'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='note' and column_name='content'
     and is_nullable='NO' and column_default like '''''::text%';
  if not found then raise exception 'FALHOU: note.content deveria ser not null default '''''; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='note' and column_name='title' and is_nullable='NO';
  if not found then raise exception 'FALHOU: note.title deveria ser not null'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='note' and column_name='project_id' and is_nullable='YES';
  if not found then raise exception 'FALHOU: note.project_id deveria ser nullable'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='note' and column_name='user_id' and is_nullable='NO';
  if not found then raise exception 'FALHOU: note.user_id deveria ser not null'; end if;

  for txt in select unnest(array['created_at','updated_at']) loop
    perform 1 from information_schema.columns
     where table_schema='public' and table_name='note' and column_name=txt
       and is_nullable='NO' and column_default like 'now()%';
    if not found then raise exception 'FALHOU: note.% deveria ser not null default now()', txt; end if;
  end loop;

  -- ---- FKs e seus on delete --------------------------------------------------------------
  perform 1 from pg_constraint
   where conrelid = 'public.note'::regclass and contype = 'f'
     and confrelid = 'auth.users'::regclass and confdeltype = 'c';
  if not found then raise exception 'FALHOU: FK note.user_id -> auth.users sem ON DELETE CASCADE'; end if;

  perform 1 from pg_constraint
   where conrelid = 'public.note'::regclass and contype = 'f'
     and confrelid = 'public.project'::regclass and confdeltype = 'n';
  if not found then raise exception 'FALHOU: FK note.project_id -> project sem ON DELETE SET NULL'; end if;

  -- ---- índices ---------------------------------------------------------------------------
  perform 1 from pg_indexes
   where schemaname='public' and tablename='note' and indexname='note_user_updated_idx'
     and indexdef ilike '%(user_id, updated_at DESC)%';
  if not found then raise exception 'FALHOU: note_user_updated_idx ausente ou sem (user_id, updated_at desc)'; end if;

  perform 1 from pg_indexes
   where schemaname='public' and tablename='note' and indexname='note_project_idx';
  if not found then raise exception 'FALHOU: note_project_idx ausente'; end if;

  -- ---- comment on table ------------------------------------------------------------------
  if coalesce(obj_description('public.note'::regclass, 'pg_class'), '') = '' then
    raise exception 'FALHOU: falta comment on table public.note';
  end if;

  -- ---- RLS ligada + as 4 policies com auth.uid() -----------------------------------------
  perform 1 from pg_class where oid='public.note'::regclass and relrowsecurity;
  if not found then raise exception 'FALHOU: RLS não está habilitada em public.note'; end if;

  select count(*) into n from pg_policies where schemaname='public' and tablename='note';
  if n <> 4 then raise exception 'FALHOU: esperadas 4 policies em note, achadas %', n; end if;

  for txt in select unnest(array['select','insert','update','delete']) loop
    perform 1 from pg_policies
     where schemaname='public' and tablename='note'
       and policyname = 'note_' || txt || '_own'
       and roles @> array['authenticated']::name[]
       and coalesce(qual, '') || coalesce(with_check, '') like '%auth.uid()%';
    if not found then
      raise exception 'FALHOU: policy note_%_own ausente, não é "to authenticated" ou não usa auth.uid()', txt;
    end if;
  end loop;

  -- insert/update precisam de WITH CHECK; select/delete precisam de USING.
  perform 1 from pg_policies where tablename='note' and policyname='note_insert_own'
    and with_check like '%auth.uid()%';
  if not found then raise exception 'FALHOU: note_insert_own sem WITH CHECK user_id = auth.uid()'; end if;
  perform 1 from pg_policies where tablename='note' and policyname='note_update_own'
    and qual like '%auth.uid()%' and with_check like '%auth.uid()%';
  if not found then raise exception 'FALHOU: note_update_own precisa de USING e WITH CHECK'; end if;

  -- ---- trigger do gate Pro ---------------------------------------------------------------
  perform 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid='public.note'::regclass and t.tgname='trg_enforce_app_access'
     and p.proname='enforce_app_access' and not t.tgisinternal;
  if not found then raise exception 'FALHOU: trigger trg_enforce_app_access ausente em public.note'; end if;

  -- ---- wipe_own_data cita 'note', antes de 'project' --------------------------------------
  select prosrc into txt from pg_proc where proname='wipe_own_data';
  if position('''note''' in txt) = 0 then
    raise exception 'FALHOU: wipe_own_data não inclui note';
  end if;
  if position('''note''' in txt) > position('''project''' in txt) then
    raise exception 'FALHOU: wipe_own_data lista note DEPOIS de project (FK quebraria o delete)';
  end if;

  -- ---- cópia de project.notes -------------------------------------------------------------
  select count(*) into n from public.note where title = 'Notas do projeto';
  if n <> (select with_notes from public.__before) then
    raise exception 'FALHOU: copiadas % notas, mas havia % projetos com notes não-vazio',
      n, (select with_notes from public.__before);
  end if;

  -- conteúdo idêntico ao original, projeto e dono preservados
  perform 1 from public.note n2
    join public.project p on p.id = n2.project_id
   where n2.title = 'Notas do projeto'
     and (n2.content is distinct from p.notes or n2.user_id is distinct from p.user_id);
  if found then
    raise exception 'FALHOU: nota copiada diverge do original (content/user_id)';
  end if;

  -- e o filtro do migration é mesmo mais estrito que `btrim(notes) <> ''` (que só corta espaço)
  if (select with_notes_space_only_trim from public.__before) <= (select with_notes from public.__before) then
    raise exception 'FALHOU: o seed não cobre o caso de notes só com \n/\t — teste inútil';
  end if;

  -- projeto sem notes ou só com espaço em branco NÃO virou nota
  perform 1 from public.note where project_id in (
    'aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000004');
  if found then raise exception 'FALHOU: projeto sem notas (ou só espaços) virou nota'; end if;

  -- a nota do outro usuário ficou com o user_id dele, não com o do primeiro
  perform 1 from public.note
   where project_id = 'bbbbbbbb-0000-0000-0000-000000000001'
     and user_id = '22222222-2222-2222-2222-222222222222';
  if not found then raise exception 'FALHOU: cópia não preservou o dono do projeto'; end if;

  -- ---- a coluna project.notes CONTINUA existindo, intocada (decisão explícita da 055) -----
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='project' and column_name='notes';
  if not found then
    raise exception 'FALHOU: project.notes foi dropada — a 055 só COPIA; o drop é da 058';
  end if;

  select md5(string_agg(coalesce(notes, '<null>'), '|' order by id)) into txt from public.project;
  if txt is distinct from (select notes_digest from public.__before) then
    raise exception 'FALHOU: o conteúdo de project.notes mudou durante a migration';
  end if;

  raise notice 'OK: schema, RLS, índices, FKs, wipe, trigger e cópia de project.notes conferidos';
end $$;
