\set ON_ERROR_STOP on

do $$
declare
  n int;
  txt text;
  expected text[] := array['project','task','book','movie','album','trip','place','goal','habit','vehicle'];
begin
  -- ---- tabela e colunas ------------------------------------------------------------------
  if to_regclass('public.note_link') is null then
    raise exception 'FALHOU: tabela public.note_link não existe';
  end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'note_link';
  if n <> 7 then
    raise exception 'FALHOU: note_link deveria ter 7 colunas, tem %', n;
  end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='note_link' and column_name='id'
     and column_default like 'gen_random_uuid%';
  if not found then raise exception 'FALHOU: note_link.id sem default gen_random_uuid()'; end if;

  for txt in select unnest(array['user_id','note_id','entity_type','entity_id']) loop
    perform 1 from information_schema.columns
     where table_schema='public' and table_name='note_link' and column_name=txt and is_nullable='NO';
    if not found then raise exception 'FALHOU: note_link.% deveria ser not null', txt; end if;
  end loop;

  -- `label` é opcional de propósito: é só um apelido para o vínculo.
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='note_link' and column_name='label' and is_nullable='YES';
  if not found then raise exception 'FALHOU: note_link.label deveria ser nullable'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='note_link' and column_name='created_at'
     and is_nullable='NO' and column_default like 'now()%';
  if not found then raise exception 'FALHOU: note_link.created_at deveria ser not null default now()'; end if;

  -- ---- FKs e seus on delete --------------------------------------------------------------
  perform 1 from pg_constraint
   where conrelid = 'public.note_link'::regclass and contype = 'f'
     and confrelid = 'auth.users'::regclass and confdeltype = 'c';
  if not found then raise exception 'FALHOU: FK note_link.user_id -> auth.users sem ON DELETE CASCADE'; end if;

  perform 1 from pg_constraint
   where conrelid = 'public.note_link'::regclass and contype = 'f'
     and confrelid = 'public.note'::regclass and confdeltype = 'c';
  if not found then raise exception 'FALHOU: FK note_link.note_id -> note sem ON DELETE CASCADE'; end if;

  -- Polimórfico de propósito: entity_id NÃO pode ter FK (aponta para 10 tabelas diferentes).
  select count(*) into n from pg_constraint
   where conrelid = 'public.note_link'::regclass and contype = 'f';
  if n <> 2 then
    raise exception 'FALHOU: note_link deveria ter exatamente 2 FKs (user_id, note_id), tem %', n;
  end if;

  -- ---- check do entity_type: a lista fechada é o contrato com src/types/notes.ts ----------
  select pg_get_constraintdef(oid) into txt from pg_constraint
   where conrelid = 'public.note_link'::regclass and contype = 'c'
     and conname = 'note_link_entity_type_check';
  if txt is null then raise exception 'FALHOU: check note_link_entity_type_check ausente'; end if;
  foreach txt in array expected loop
    perform 1 from pg_constraint
     where conrelid = 'public.note_link'::regclass and conname = 'note_link_entity_type_check'
       and pg_get_constraintdef(oid) like '%''' || txt || '''%';
    if not found then raise exception 'FALHOU: entity_type % fora do check', txt; end if;
  end loop;

  -- ---- unique (note_id, entity_type, entity_id) ------------------------------------------
  perform 1 from pg_constraint
   where conrelid = 'public.note_link'::regclass and contype = 'u'
     and pg_get_constraintdef(oid) ilike '%(note_id, entity_type, entity_id)%';
  if not found then
    raise exception 'FALHOU: unique (note_id, entity_type, entity_id) ausente';
  end if;

  -- ---- índices ---------------------------------------------------------------------------
  perform 1 from pg_indexes
   where schemaname='public' and tablename='note_link' and indexname='note_link_user_note_idx'
     and indexdef ilike '%(user_id, note_id)%';
  if not found then raise exception 'FALHOU: note_link_user_note_idx ausente ou sem (user_id, note_id)'; end if;

  perform 1 from pg_indexes
   where schemaname='public' and tablename='note_link' and indexname='note_link_user_entity_idx'
     and indexdef ilike '%(user_id, entity_type, entity_id)%';
  if not found then
    raise exception 'FALHOU: note_link_user_entity_idx ausente — a consulta reversa ficaria sem índice';
  end if;

  -- ---- comment on table ------------------------------------------------------------------
  if coalesce(obj_description('public.note_link'::regclass, 'pg_class'), '') = '' then
    raise exception 'FALHOU: falta comment on table public.note_link';
  end if;

  -- ---- RLS ligada + as 4 policies com auth.uid() -----------------------------------------
  perform 1 from pg_class where oid='public.note_link'::regclass and relrowsecurity;
  if not found then raise exception 'FALHOU: RLS não está habilitada em public.note_link'; end if;

  select count(*) into n from pg_policies where schemaname='public' and tablename='note_link';
  if n <> 4 then raise exception 'FALHOU: esperadas 4 policies em note_link, achadas %', n; end if;

  for txt in select unnest(array['select','insert','update','delete']) loop
    perform 1 from pg_policies
     where schemaname='public' and tablename='note_link'
       and policyname = 'note_link_' || txt || '_own'
       and roles @> array['authenticated']::name[]
       and coalesce(qual, '') || coalesce(with_check, '') like '%auth.uid()%';
    if not found then
      raise exception 'FALHOU: policy note_link_%_own ausente, não é "to authenticated" ou não usa auth.uid()', txt;
    end if;
  end loop;

  perform 1 from pg_policies where tablename='note_link' and policyname='note_link_insert_own'
    and with_check like '%auth.uid()%';
  if not found then raise exception 'FALHOU: note_link_insert_own sem WITH CHECK user_id = auth.uid()'; end if;
  perform 1 from pg_policies where tablename='note_link' and policyname='note_link_update_own'
    and qual like '%auth.uid()%' and with_check like '%auth.uid()%';
  if not found then raise exception 'FALHOU: note_link_update_own precisa de USING e WITH CHECK'; end if;

  -- ---- trigger do gate Pro ---------------------------------------------------------------
  perform 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid='public.note_link'::regclass and t.tgname='trg_enforce_app_access'
     and p.proname='enforce_app_access' and not t.tgisinternal;
  if not found then raise exception 'FALHOU: trigger trg_enforce_app_access ausente em public.note_link'; end if;

  -- ---- wipe_own_data cita note_link, antes de note ---------------------------------------
  select prosrc into txt from pg_proc where proname='wipe_own_data';
  if position('''note_link''' in txt) = 0 then
    raise exception 'FALHOU: wipe_own_data não inclui note_link';
  end if;
  if position('''note_link''' in txt) > position('''note''' in replace(txt, '''note_link''', '')) then
    raise exception 'FALHOU: wipe_own_data lista note_link DEPOIS de note (FK quebraria o delete)';
  end if;

  raise notice 'OK: schema, check, unique, índices, FKs, RLS, trigger e wipe de note_link conferidos';
end $$;
