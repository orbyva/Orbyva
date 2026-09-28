\set ON_ERROR_STOP on

do $$
declare
  n int;
  txt text;
begin
  -- ---- 1. a coluna sumiu -------------------------------------------------------------------
  perform 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'project' and column_name = 'notes';
  if found then
    raise exception 'FALHOU: project.notes ainda existe — a migration não dropou a coluna';
  end if;

  -- ---- 2. o RESTO de `project` continua igual ------------------------------------------------
  -- A migration da 006 criou `notes` e `project_event` no mesmo arquivo; o risco desta migration
  -- é arrastar junto o que não devia sair.
  for txt in select unnest(array['id','user_id','name','status','created_at','updated_at']) loop
    perform 1 from information_schema.columns
     where table_schema='public' and table_name='project' and column_name=txt;
    if not found then
      raise exception 'FALHOU: o drop levou junto a coluna project.%', txt;
    end if;
  end loop;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='project' and column_name='status'
     and is_nullable='NO' and column_default like '''planned''%';
  if not found then raise exception 'FALHOU: project.status perdeu o not null/default planned'; end if;

  perform 1 from pg_constraint
   where conrelid = 'public.project'::regclass and conname = 'project_status_check';
  if not found then raise exception 'FALHOU: project_status_check sumiu junto com a coluna notes'; end if;

  -- RLS de `project` intocada
  perform 1 from pg_class where oid='public.project'::regclass and relrowsecurity;
  if not found then raise exception 'FALHOU: RLS de public.project foi desligada'; end if;

  select count(*) into n from pg_policies where schemaname='public' and tablename='project';
  if n <> 2 then raise exception 'FALHOU: esperadas 2 policies em project, achadas %', n; end if;

  -- ---- 3. `project_event` intacta — tabela e linhas -----------------------------------------
  if to_regclass('public.project_event') is null then
    raise exception 'FALHOU: o drop levou junto a tabela project_event (feature 006)';
  end if;

  select count(*) into n from public.project_event;
  if n <> (select event_count from public.__before) then
    raise exception 'FALHOU: project_event tinha % linhas e ficou com %',
      (select event_count from public.__before), n;
  end if;

  select count(*) into n from pg_policies where schemaname='public' and tablename='project_event';
  if n <> 4 then raise exception 'FALHOU: project_event deveria manter 4 policies, tem %', n; end if;

  -- ---- 4. nenhuma linha de `project` foi perdida ou alterada ---------------------------------
  select count(*) into n from public.project;
  if n <> (select project_count from public.__before) then
    raise exception 'FALHOU: project tinha % linhas e ficou com %',
      (select project_count from public.__before), n;
  end if;

  select md5(string_agg(id::text || '|' || name || '|' || status, '#' order by id))
    into txt from public.project;
  if txt is distinct from (select project_digest from public.__before) then
    raise exception 'FALHOU: o drop mudou id/name/status de alguma linha de project';
  end if;

  -- ---- 5. as notas migradas continuam lá, byte a byte ----------------------------------------
  -- É o ponto da feature: a coluna só pode sair porque o conteúdo dela já vive em `note`.
  select count(*) into n from public.note where title = 'Notas do projeto';
  if n <> (select copied_notes from public.__after_copy) then
    raise exception 'FALHOU: havia % notas copiadas e sobraram % depois do drop',
      (select copied_notes from public.__after_copy), n;
  end if;
  if n <> (select with_notes from public.__before) then
    raise exception 'FALHOU: % projetos tinham notes não-vazio, mas há % notas migradas',
      (select with_notes from public.__before), n;
  end if;

  select md5(string_agg(coalesce(project_id::text, '<null>') || '|' || user_id::text || '|' || content,
                        '#' order by id))
    into txt from public.note;
  if txt is distinct from (select note_digest from public.__after_copy) then
    raise exception 'FALHOU: o conteúdo de public.note mudou durante o drop';
  end if;

  -- o vínculo nota↔projeto e o dono continuam de pé
  perform 1 from public.note
   where project_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and user_id = '11111111-1111-1111-1111-111111111111'
     and content like '# Reforma%';
  if not found then raise exception 'FALHOU: a nota migrada da Obra da casa não está mais ligada ao projeto'; end if;

  perform 1 from public.note
   where project_id = 'bbbbbbbb-0000-0000-0000-000000000001'
     and user_id = '22222222-2222-2222-2222-222222222222';
  if not found then raise exception 'FALHOU: a nota migrada do outro usuário perdeu o dono'; end if;

  -- ---- 6. wipe de conta continua citando note e project --------------------------------------
  select prosrc into txt from pg_proc where proname='wipe_own_data';
  if position('''note''' in txt) = 0 or position('''project''' in txt) = 0 then
    raise exception 'FALHOU: wipe_own_data perdeu note ou project';
  end if;

  raise notice 'OK: project.notes dropada; project, project_event, policies e as notas migradas intactos';
end $$;
